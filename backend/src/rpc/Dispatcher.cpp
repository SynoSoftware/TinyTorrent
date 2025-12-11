#include "rpc/Dispatcher.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Base64.hpp"
#include "utils/Json.hpp"
#include "utils/Log.hpp"

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shellapi.h>
#endif

#include <array>
#include <cstdlib>
#include <algorithm>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <limits>
#include <system_error>
#include <utility>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>
#include <yyjson.h>

namespace tt::rpc {

namespace {

std::optional<int> parse_int_value(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  if (yyjson_is_sint(value)) {
    return static_cast<int>(yyjson_get_sint(value));
  }
  if (yyjson_is_uint(value)) {
    return static_cast<int>(yyjson_get_uint(value));
  }
  if (yyjson_is_real(value)) {
    return static_cast<int>(yyjson_get_real(value));
  }
  if (yyjson_is_str(value)) {
    try {
      return std::stoi(yyjson_get_str(value));
    } catch (...) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

std::vector<int> parse_ids(yyjson_val *arguments) {
  std::vector<int> result;
  if (arguments == nullptr) {
    return result;
  }
  yyjson_val *ids = yyjson_obj_get(arguments, "ids");
  if (ids == nullptr) {
    return result;
  }
  if (yyjson_is_arr(ids)) {
    size_t idx, limit;
    yyjson_val *value = nullptr;
    yyjson_arr_foreach(ids, idx, limit, value) {
      if (auto parsed = parse_int_value(value)) {
        result.push_back(*parsed);
      }
    }
    return result;
  }
  if (auto parsed = parse_int_value(ids)) {
    result.push_back(*parsed);
  }
  return result;
}

std::vector<int> parse_int_array(yyjson_val *arguments, char const *key) {
  std::vector<int> result;
  if (arguments == nullptr) {
    return result;
  }
  yyjson_val *value = yyjson_obj_get(arguments, key);
  if (value == nullptr || !yyjson_is_arr(value)) {
    return result;
  }
  size_t idx, limit;
  yyjson_val *entry = nullptr;
  yyjson_arr_foreach(value, idx, limit, entry) {
    if (auto parsed = parse_int_value(entry)) {
      result.push_back(*parsed);
    }
  }
  return result;
}

std::optional<std::filesystem::path> parse_download_dir(yyjson_val *arguments) {
  if (arguments == nullptr) {
    return std::nullopt;
  }
  auto *value = yyjson_obj_get(arguments, "download-dir");
  if (value == nullptr || !yyjson_is_str(value)) {
    return std::nullopt;
  }
  auto candidate = std::filesystem::path(yyjson_get_str(value));
  if (candidate.empty()) {
    return std::nullopt;
  }
  try {
    if (!candidate.is_absolute()) {
      candidate = std::filesystem::absolute(candidate);
    }
    candidate = candidate.lexically_normal();
    return candidate;
  } catch (std::filesystem::filesystem_error const &ex) {
  TT_LOG_INFO("session-set download-dir invalid: {}", ex.what());
    return std::nullopt;
  }
}

std::optional<std::uint16_t> parse_peer_port(yyjson_val *arguments) {
  if (arguments == nullptr) {
    return std::nullopt;
  }
  auto *value = yyjson_obj_get(arguments, "peer-port");
  if (value == nullptr) {
    return std::nullopt;
  }
  if (auto parsed = parse_int_value(value)) {
    if (*parsed >= 0 && *parsed <= std::numeric_limits<std::uint16_t>::max()) {
      return static_cast<std::uint16_t>(*parsed);
    }
  }
  return std::nullopt;
}

bool needs_detail(yyjson_val *fields) {
  if (fields == nullptr || !yyjson_is_arr(fields)) {
    return false;
  }
  size_t idx, count;
  yyjson_val *value = nullptr;
  yyjson_arr_foreach(fields, idx, count, value) {
    if (!yyjson_is_str(value)) {
      continue;
    }
    auto str = std::string_view(yyjson_get_str(value));
    if (str == "files" || str == "trackers" || str == "peers" ||
        str == "pieceStates" || str == "pieceAvailability") {
      return true;
    }
  }
  return false;
}

bool bool_value(yyjson_val *value, bool default_value = false) {
  if (value == nullptr) {
    return default_value;
  }
  if (yyjson_is_bool(value)) {
    return yyjson_get_bool(value);
  }
  if (yyjson_is_sint(value)) {
    return yyjson_get_sint(value) != 0;
  }
  if (yyjson_is_uint(value)) {
    return yyjson_get_uint(value) != 0;
  }
  if (yyjson_is_str(value)) {
    auto content = std::string_view(yyjson_get_str(value));
    if (content == "true" || content == "1") {
      return true;
    }
    if (content == "false" || content == "0") {
      return false;
    }
  }
  return default_value;
}

std::optional<bool> parse_bool_flag(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  return bool_value(value);
}

std::string escape_shell_argument(std::string const &value) {
  std::string result;
  result.reserve(value.size() + 2);
  result.push_back('"');
  for (char ch : value) {
    if (ch == '"' || ch == '\\') {
      result.push_back('\\');
    }
    result.push_back(ch);
  }
  result.push_back('"');
  return result;
}

bool run_external_command(std::string const &command) {
  if (command.empty()) {
    return false;
  }
  int status = std::system(command.c_str());
  return status == 0;
}

bool open_with_default_app(std::filesystem::path const &path) {
  if (path.empty()) {
    return false;
  }
#if defined(_WIN32)
  auto wide_path = path.wstring();
  auto handle = ShellExecuteW(nullptr, L"open", wide_path.c_str(), nullptr,
                              nullptr, SW_SHOWNORMAL);
  return reinterpret_cast<intptr_t>(handle) > 32;
#elif defined(__APPLE__)
  return run_external_command(
      "open " + escape_shell_argument(path.string()));
#else
  return run_external_command(
      "xdg-open " + escape_shell_argument(path.string()));
#endif
}

bool reveal_in_file_manager(std::filesystem::path const &target) {
  if (target.empty()) {
    return false;
  }
  auto subject = target;
  if (!std::filesystem::is_directory(subject)) {
    subject = subject.parent_path();
  }
  if (subject.empty()) {
    subject = std::filesystem::current_path();
  }
#if defined(_WIN32)
  auto params = std::wstring(L"/select,") + target.wstring();
  auto handle = ShellExecuteW(nullptr, L"open", L"explorer.exe", params.c_str(),
                              nullptr, SW_SHOWNORMAL);
  return reinterpret_cast<intptr_t>(handle) > 32;
#else
  return open_with_default_app(subject);
#endif
}

std::string path_to_string(std::filesystem::path const &value) {
  try {
    return value.string();
  } catch (...) {
    return {};
  }
}

std::filesystem::path parse_request_path(yyjson_val *value) {
  if (value == nullptr || !yyjson_is_str(value)) {
    return {};
  }
  return std::filesystem::path(yyjson_get_str(value));
}

std::vector<tt::rpc::FsEntry> collect_directory_entries(
    std::filesystem::path const &path) {
  std::vector<tt::rpc::FsEntry> result;
  try {
    for (auto const &entry : std::filesystem::directory_iterator(path)) {
      tt::rpc::FsEntry info;
      info.name = entry.path().filename().string();
      if (entry.is_directory()) {
        info.type = "directory";
      } else if (entry.is_regular_file()) {
        info.type = "file";
      } else {
        info.type = "other";
      }
      if (entry.is_regular_file()) {
        info.size = entry.file_size();
      }
      result.push_back(std::move(info));
    }
    std::sort(result.begin(), result.end(), [](auto const &a, auto const &b) {
      if (a.type != b.type) {
        return a.type < b.type;
      }
      return a.name < b.name;
    });
  } catch (...) {
  }
  return result;
}

std::string to_lower_view(std::string_view value) {
  std::string result(value);
  std::transform(result.begin(), result.end(), result.begin(),
                 [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
  return result;
}

std::optional<double> parse_double_value(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  if (yyjson_is_real(value)) {
    return yyjson_get_real(value);
  }
  if (yyjson_is_sint(value)) {
    return static_cast<double>(yyjson_get_sint(value));
  }
  if (yyjson_is_uint(value)) {
    return static_cast<double>(yyjson_get_uint(value));
  }
  if (yyjson_is_str(value)) {
    try {
      return std::stod(yyjson_get_str(value));
    } catch (...) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

std::optional<engine::EncryptionMode> parse_encryption(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  if (yyjson_is_sint(value)) {
    int code = static_cast<int>(yyjson_get_sint(value));
    switch (code) {
      case 1:
        return engine::EncryptionMode::Preferred;
      case 2:
        return engine::EncryptionMode::Required;
      default:
        return engine::EncryptionMode::Tolerated;
    }
  }
  if (yyjson_is_uint(value)) {
    int code = static_cast<int>(yyjson_get_uint(value));
    switch (code) {
      case 1:
        return engine::EncryptionMode::Preferred;
      case 2:
        return engine::EncryptionMode::Required;
      default:
        return engine::EncryptionMode::Tolerated;
    }
  }
  if (yyjson_is_str(value)) {
    auto text = to_lower_view(yyjson_get_str(value));
    if (text == "preferred" || text == "1" || text == "prefer") {
      return engine::EncryptionMode::Preferred;
    }
    if (text == "required" || text == "2") {
      return engine::EncryptionMode::Required;
    }
    return engine::EncryptionMode::Tolerated;
  }
  return std::nullopt;
}

std::vector<engine::TrackerEntry> parse_tracker_entries(yyjson_val *value) {
  std::vector<engine::TrackerEntry> entries;
  if (value == nullptr) {
    return entries;
  }
  auto push_entry = [&](yyjson_val *entry) {
    if (entry == nullptr) {
      return;
    }
    engine::TrackerEntry tracker;
    if (yyjson_is_str(entry)) {
      tracker.announce = yyjson_get_str(entry);
    } else if (yyjson_is_obj(entry)) {
      auto *announce = yyjson_obj_get(entry, "announce");
      if (announce && yyjson_is_str(announce)) {
        tracker.announce = yyjson_get_str(announce);
      }
      tracker.tier = parse_int_value(yyjson_obj_get(entry, "tier")).value_or(0);
    }
    if (!tracker.announce.empty()) {
      entries.push_back(std::move(tracker));
    }
  };
  if (yyjson_is_arr(value)) {
    size_t idx, limit;
    yyjson_val *item = nullptr;
    yyjson_arr_foreach(value, idx, limit, item) {
      push_entry(item);
    }
  } else {
    push_entry(value);
  }
  return entries;
}

std::vector<std::string> parse_tracker_announces(yyjson_val *value) {
  std::vector<std::string> result;
  if (value == nullptr) {
    return result;
  }
  if (yyjson_is_arr(value)) {
    size_t idx, limit;
    yyjson_val *item = nullptr;
    yyjson_arr_foreach(value, idx, limit, item) {
      if (yyjson_is_str(item)) {
        result.emplace_back(yyjson_get_str(item));
      } else if (yyjson_is_obj(item)) {
        auto *announce = yyjson_obj_get(item, "announce");
        if (announce && yyjson_is_str(announce)) {
          result.emplace_back(yyjson_get_str(announce));
        }
      }
    }
  } else if (yyjson_is_str(value)) {
    result.emplace_back(yyjson_get_str(value));
  } else if (yyjson_is_obj(value)) {
    auto *announce = yyjson_obj_get(value, "announce");
    if (announce && yyjson_is_str(announce)) {
      result.emplace_back(yyjson_get_str(announce));
    }
  }
  return result;
}

std::optional<std::vector<std::string>> parse_labels(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  std::vector<std::string> result;
  if (yyjson_is_arr(value)) {
    size_t idx, limit;
    yyjson_val *item = nullptr;
    yyjson_arr_foreach(value, idx, limit, item) {
      if (yyjson_is_str(item)) {
        result.emplace_back(yyjson_get_str(item));
      }
    }
  } else if (yyjson_is_str(value)) {
    result.emplace_back(yyjson_get_str(value));
  }
  return result;
}

std::optional<int> parse_bandwidth_priority(yyjson_val *value) {
  if (value == nullptr) {
    return std::nullopt;
  }
  if (auto parsed = parse_int_value(value)) {
    int priority = std::clamp(*parsed, 0, 2);
    return priority;
  }
  if (yyjson_is_str(value)) {
    auto text = to_lower_view(yyjson_get_str(value));
    if (text == "low" || text == "0") {
      return 0;
    }
    if (text == "normal" || text == "1") {
      return 1;
    }
    if (text == "high" || text == "2") {
      return 2;
    }
  }
  return std::nullopt;
}

#if defined(_WIN32)
struct WsaInitializer {
  WsaInitializer() {
    WSADATA data{};
    started = (WSAStartup(MAKEWORD(2, 2), &data) == 0);
  }
  ~WsaInitializer() {
    if (started) {
      WSACleanup();
    }
  }
  bool started = false;
};

std::pair<std::string, std::string> split_listen_interface(std::string const &value) {
  auto colon = value.find_last_of(':');
  if (colon == std::string::npos) {
    return {"127.0.0.1", {}};
  }
  auto host = value.substr(0, colon);
  auto port = value.substr(colon + 1);
  if (host.empty() || host == "0.0.0.0") {
    host = "127.0.0.1";
  }
  return {host, port};
}

bool check_session_port(std::string const &listen_interface) {
  auto [host, port] = split_listen_interface(listen_interface);
  if (port.empty()) {
    return false;
  }
  WsaInitializer wsa;
  if (!wsa.started) {
    return false;
  }

  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;
  addrinfo *result = nullptr;
  if (getaddrinfo(host.c_str(), port.c_str(), &hints, &result) != 0) {
    return false;
  }

  bool success = false;
  for (auto *ptr = result; ptr != nullptr; ptr = ptr->ai_next) {
    SOCKET sock = socket(ptr->ai_family, ptr->ai_socktype, ptr->ai_protocol);
    if (sock == INVALID_SOCKET) {
      continue;
    }
    u_long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);

    timeval timeout{};
    timeout.tv_sec = 0;
    timeout.tv_usec = 250000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<char *>(&timeout),
               sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<char *>(&timeout),
               sizeof(timeout));

    auto result_code = connect(sock, ptr->ai_addr,
                               static_cast<int>(ptr->ai_addrlen));
    if (result_code == 0) {
      success = true;
    } else {
      auto err = WSAGetLastError();
      if (err == WSAEWOULDBLOCK || err == WSAEINPROGRESS) {
        fd_set write_fds;
        FD_ZERO(&write_fds);
        FD_SET(sock, &write_fds);
        timeval select_timeout{};
        select_timeout.tv_sec = 0;
        select_timeout.tv_usec = 200000;
        int ready =
            select(0, nullptr, &write_fds, nullptr, &select_timeout);
        if (ready > 0 && FD_ISSET(sock, &write_fds)) {
          int sock_err = 0;
          int len = sizeof(sock_err);
          if (getsockopt(sock, SOL_SOCKET, SO_ERROR,
                         reinterpret_cast<char *>(&sock_err),
                         &len) == 0 &&
              sock_err == 0) {
            success = true;
          }
        }
      }
    }
    closesocket(sock);
    if (success) {
      break;
    }
  }

  freeaddrinfo(result);
  return success;
}
#else
bool check_session_port(std::string const &) {
  return false;
}
#endif

std::vector<engine::TorrentSnapshot> filter_torrents(
    engine::Core *engine, std::vector<int> const &ids) {
  if (engine == nullptr) {
    return {};
  }
  auto torrents = engine->torrent_list();
  if (ids.empty()) {
    return torrents;
  }
  std::unordered_set<int> wanted(ids.begin(), ids.end());
  std::vector<engine::TorrentSnapshot> filtered;
  filtered.reserve(wanted.size());
  for (auto const &torrent : torrents) {
    if (wanted.contains(torrent.id)) {
      filtered.push_back(torrent);
    }
  }
  return filtered;
}

std::vector<engine::TorrentDetail> gather_torrent_details(
    engine::Core *engine, std::vector<int> const &ids) {
  std::vector<engine::TorrentDetail> details;
  if (engine == nullptr) {
    return details;
  }
  std::vector<int> targets = ids;
  if (targets.empty()) {
    auto snapshots = engine->torrent_list();
    targets.reserve(snapshots.size());
    for (auto const &snapshot : snapshots) {
      targets.push_back(snapshot.id);
    }
  }
  details.reserve(targets.size());
  for (int id : targets) {
    if (auto detail = engine->torrent_detail(id)) {
      details.push_back(std::move(*detail));
    }
  }
  return details;
}

std::string handle_torrent_add(engine::Core *engine, yyjson_val *arguments) {
  if (engine == nullptr) {
    return serialize_error("engine unavailable");
  }
  if (arguments == nullptr || !yyjson_is_obj(arguments)) {
    return serialize_error("arguments object missing for torrent-add");
  }

  engine::TorrentAddRequest request;
  request.download_path = engine->settings().download_path;

  yyjson_val *download = yyjson_obj_get(arguments, "download-dir");
  if (download && yyjson_is_str(download)) {
    try {
      std::filesystem::path candidate(yyjson_get_str(download));
      if (!candidate.empty()) {
        if (!candidate.is_absolute()) {
          candidate = std::filesystem::absolute(candidate);
        }
        request.download_path = std::move(candidate);
      }
    } catch (std::filesystem::filesystem_error const &ex) {
      return serialize_error(ex.what());
    }
  }

  request.paused = bool_value(yyjson_obj_get(arguments, "paused"));

  yyjson_val *metainfo_value = yyjson_obj_get(arguments, "metainfo");
  if (metainfo_value && yyjson_is_str(metainfo_value)) {
    auto raw = std::string_view(yyjson_get_str(metainfo_value));
    auto decoded = tt::utils::decode_base64(raw);
    if (!decoded || decoded->empty()) {
      return serialize_error("invalid metainfo content");
    }
    request.metainfo = std::move(*decoded);
  } else {
    yyjson_val *uri_value = yyjson_obj_get(arguments, "uri");
    if (uri_value == nullptr || !yyjson_is_str(uri_value)) {
      uri_value = yyjson_obj_get(arguments, "filename");
    }
    if (uri_value == nullptr || !yyjson_is_str(uri_value)) {
      return serialize_error("uri or filename required");
    }
    request.uri = std::string(yyjson_get_str(uri_value));
  }

  TT_LOG_DEBUG("torrent-add download-dir={} paused={}",
               request.download_path.string(), static_cast<int>(request.paused));
  auto status = engine->enqueue_add_torrent(std::move(request));
  return serialize_add_result(status);
}

} // namespace

Dispatcher::Dispatcher(engine::Core *engine, std::string rpc_bind)
    : engine_(engine), rpc_bind_(std::move(rpc_bind)) {}

std::string Dispatcher::dispatch(std::string_view payload) {
  if (payload.empty()) {
    return serialize_error("empty RPC payload");
  }

  auto doc = tt::json::Document::parse(payload);
  if (!doc.is_valid()) {
    return serialize_error("invalid JSON");
  }

  yyjson_val *root = doc.root();
  if (root == nullptr || !yyjson_is_obj(root)) {
    return serialize_error("expected JSON object");
  }

  yyjson_val *method_value = yyjson_obj_get(root, "method");
  if (method_value == nullptr || !yyjson_is_str(method_value)) {
    return serialize_error("missing method");
  }

  std::string method(yyjson_get_str(method_value));
  TT_LOG_DEBUG("Dispatching RPC method={}", method);

  yyjson_val *arguments = yyjson_obj_get(root, "arguments");
  std::string response;

  if (method == "session-get") {
    auto settings = engine_ ? engine_->settings() : engine::CoreSettings{};
    auto entries = engine_ ? engine_->blocklist_entry_count() : 0;
    auto updated = engine_ ? engine_->blocklist_last_update() : std::optional<std::chrono::system_clock::time_point>{};
    response = serialize_session_settings(settings, entries, updated, rpc_bind_);
  } else if (method == "session-set") {
    if (!engine_) {
      response = serialize_success();
    } else {
      bool applied = false;
      bool ok = true;
      if (auto download = parse_download_dir(arguments)) {
        TT_LOG_DEBUG("session-set download-dir={}", download->string());
        engine_->set_download_path(*download);
        applied = true;
      }
      if (auto port = parse_peer_port(arguments)) {
        TT_LOG_DEBUG("session-set peer-port={}", static_cast<unsigned>(*port));
        applied = true;
        if (!engine_->set_listen_port(*port)) {
          ok = false;
        }
      }
      auto download_limit =
          parse_int_value(yyjson_obj_get(arguments, "speed-limit-down"));
      auto download_enabled =
          parse_bool_flag(yyjson_obj_get(arguments, "speed-limit-down-enabled"));
      auto upload_limit =
          parse_int_value(yyjson_obj_get(arguments, "speed-limit-up"));
      auto upload_enabled =
          parse_bool_flag(yyjson_obj_get(arguments, "speed-limit-up-enabled"));
      if (download_limit || download_enabled || upload_limit ||
          upload_enabled) {
        TT_LOG_DEBUG("session-set speed-limit-down={} enabled={} speed-limit-up={} enabled={}",
                     download_limit.value_or(-1),
                     download_enabled.value_or(false),
                     upload_limit.value_or(-1),
                     upload_enabled.value_or(false));
        engine_->set_speed_limits(download_limit, download_enabled, upload_limit,
                                  upload_enabled);
        applied = true;
      }
      auto peer_limit = parse_int_value(yyjson_obj_get(arguments, "peer-limit"));
      auto peer_limit_per_torrent =
          parse_int_value(yyjson_obj_get(arguments, "peer-limit-per-torrent"));
      if (peer_limit || peer_limit_per_torrent) {
        TT_LOG_DEBUG("session-set peer-limit={} peer-limit-per-torrent={}",
                     peer_limit.value_or(-1),
                     peer_limit_per_torrent.value_or(-1));
        engine_->set_peer_limits(peer_limit, peer_limit_per_torrent);
        applied = true;
      }

      tt::engine::SessionUpdate session_update;
      bool session_update_needed = false;
      if (auto value = parse_int_value(yyjson_obj_get(arguments, "alt-speed-down"))) {
        session_update.alt_speed_down_kbps = *value;
        session_update_needed = true;
      }
      if (auto value = parse_int_value(yyjson_obj_get(arguments, "alt-speed-up"))) {
        session_update.alt_speed_up_kbps = *value;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "alt-speed-enabled"))) {
        session_update.alt_speed_enabled = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "alt-speed-time-enabled"))) {
        session_update.alt_speed_time_enabled = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-begin"))) {
        session_update.alt_speed_time_begin = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-end"))) {
        session_update.alt_speed_time_end = *value;
        session_update_needed = true;
      }
      if (auto value = parse_int_value(yyjson_obj_get(arguments, "alt-speed-time-day"))) {
        session_update.alt_speed_time_day = *value;
        session_update_needed = true;
      }
      if (auto enc = parse_encryption(yyjson_obj_get(arguments, "encryption"))) {
        session_update.encryption = *enc;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "dht-enabled"))) {
        session_update.dht_enabled = *value;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "pex-enabled"))) {
        session_update.pex_enabled = *value;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "lpd-enabled"))) {
        session_update.lpd_enabled = *value;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments, "utp-enabled"))) {
        session_update.utp_enabled = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_int_value(yyjson_obj_get(arguments, "download-queue-size"))) {
        session_update.download_queue_size = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_int_value(yyjson_obj_get(arguments, "seed-queue-size"))) {
        session_update.seed_queue_size = *value;
        session_update_needed = true;
      }
      if (auto value = parse_bool_flag(yyjson_obj_get(arguments,
                                                      "queue-stalled-enabled"))) {
        session_update.queue_stalled_enabled = *value;
        session_update_needed = true;
      }
      if (auto *incomplete =
              yyjson_obj_get(arguments, "incomplete-dir")) {
        if (yyjson_is_str(incomplete)) {
          session_update.incomplete_dir =
              std::filesystem::path(yyjson_get_str(incomplete));
          session_update_needed = true;
        }
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "incomplete-dir-enabled"))) {
        session_update.incomplete_dir_enabled = *value;
        session_update_needed = true;
      }
      if (auto *watch_dir =
              yyjson_obj_get(arguments, "watch-dir")) {
        if (yyjson_is_str(watch_dir)) {
          session_update.watch_dir =
              std::filesystem::path(yyjson_get_str(watch_dir));
          session_update_needed = true;
        }
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "watch-dir-enabled"))) {
        session_update.watch_dir_enabled = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_double_value(yyjson_obj_get(arguments, "seed-ratio-limit"))) {
        session_update.seed_ratio_limit = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "seed-ratio-limited"))) {
        session_update.seed_ratio_enabled = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_int_value(yyjson_obj_get(arguments, "seed-idle-limit"))) {
        session_update.seed_idle_limit = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "seed-idle-limited"))) {
        session_update.seed_idle_enabled = *value;
        session_update_needed = true;
      }
      if (auto value = parse_int_value(yyjson_obj_get(arguments, "proxy-type"))) {
        session_update.proxy_type = *value;
        session_update_needed = true;
      }
      if (auto *proxy_host = yyjson_obj_get(arguments, "proxy-host")) {
        if (yyjson_is_str(proxy_host)) {
          session_update.proxy_hostname = std::string(yyjson_get_str(proxy_host));
          session_update_needed = true;
        }
      }
      if (auto value = parse_int_value(yyjson_obj_get(arguments, "proxy-port"))) {
        session_update.proxy_port = *value;
        session_update_needed = true;
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "proxy-auth-enabled"))) {
        session_update.proxy_auth_enabled = *value;
        session_update_needed = true;
      }
      if (auto *proxy_user = yyjson_obj_get(arguments, "proxy-username")) {
        if (yyjson_is_str(proxy_user)) {
          session_update.proxy_username =
              std::string(yyjson_get_str(proxy_user));
          session_update_needed = true;
        }
      }
      if (auto *proxy_pass = yyjson_obj_get(arguments, "proxy-password")) {
        if (yyjson_is_str(proxy_pass)) {
          session_update.proxy_password =
              std::string(yyjson_get_str(proxy_pass));
          session_update_needed = true;
        }
      }
      if (auto value =
              parse_bool_flag(yyjson_obj_get(arguments, "proxy-peer-connections"))) {
        session_update.proxy_peer_connections = *value;
        session_update_needed = true;
      }
      if (session_update_needed) {
        engine_->update_session_settings(std::move(session_update));
        applied = true;
      }
      if (!ok) {
        response = serialize_error("failed to update session settings");
      } else {
        response = serialize_success();
      }
    }
  } else if (method == "session-test") {
    auto port_interface = engine_ ? engine_->settings().listen_interface : std::string{};
    bool port_open = !port_interface.empty() && check_session_port(port_interface);
    response = serialize_session_test(port_open);
  } else if (method == "session-stats") {
    auto snapshot = engine_ ? engine_->snapshot()
                            : std::make_shared<engine::SessionSnapshot>();
    response = serialize_session_stats(*snapshot);
  } else if (method == "session-close") {
    TT_LOG_INFO("session-close requested");
    if (engine_) {
      engine_->stop();
    }
    response = serialize_success();
  } else if (method == "blocklist-update") {
    if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      auto entries = engine_->reload_blocklist();
      if (!entries) {
        response = serialize_error("blocklist update failed");
      } else {
        response = serialize_blocklist_update(
            *entries, engine_->blocklist_last_update());
      }
    }
  } else if (method == "fs-browse") {
    if (!arguments) {
      response = serialize_error("arguments required for fs-browse");
    } else {
      auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
      if (target.empty()) {
        target = std::filesystem::current_path();
      }
      auto normalized = target.lexically_normal();
      std::error_code ec;
      if (!std::filesystem::exists(normalized, ec)) {
        response = serialize_error("path does not exist");
      } else if (!std::filesystem::is_directory(normalized, ec)) {
        response = serialize_error("path is not a directory");
      } else {
        auto entries = collect_directory_entries(normalized);
        auto parent = normalized.parent_path();
        response = serialize_fs_browse(
            path_to_string(normalized), path_to_string(parent),
            std::string(1, std::filesystem::path::preferred_separator),
            entries);
      }
    }
  } else if (method == "fs-space") {
    auto target = arguments ? parse_request_path(yyjson_obj_get(arguments, "path"))
                            : std::filesystem::path{};
    if (target.empty()) {
      target = std::filesystem::current_path();
    }
    std::error_code ec;
    auto info = std::filesystem::space(target, ec);
    if (ec) {
      response = serialize_error("unable to query space");
    } else {
      response = serialize_fs_space(path_to_string(target), info.available,
                                   info.capacity);
    }
  } else if (method == "system-reveal") {
    if (!arguments) {
      response = serialize_error("arguments required for system-reveal");
    } else {
      auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
      if (target.empty()) {
        response = serialize_error("path required");
      } else {
        bool success = reveal_in_file_manager(target);
        response = serialize_system_action("system-reveal", success,
                                           success ? "" : "unable to reveal path");
      }
    }
  } else if (method == "system-open") {
    if (!arguments) {
      response = serialize_error("arguments required for system-open");
    } else {
      auto target = parse_request_path(yyjson_obj_get(arguments, "path"));
      if (target.empty()) {
        response = serialize_error("path required");
      } else {
        bool success = open_with_default_app(target);
        response = serialize_system_action("system-open", success,
                                           success ? "" : "unable to open path");
      }
    }
  } else if (method == "system-register-handler") {
    response = serialize_system_action("system-register-handler", false,
                                       "not implemented");
  } else if (method == "free-space") {
    if (!arguments) {
      response = serialize_error("arguments missing for free-space");
    } else {
      yyjson_val *path_value = yyjson_obj_get(arguments, "path");
      if (path_value == nullptr || !yyjson_is_str(path_value)) {
        response = serialize_error("path argument required");
      } else {
        std::filesystem::path path(yyjson_get_str(path_value));
        try {
          auto info = std::filesystem::space(path);
          response = serialize_free_space(path.string(), info.available,
                                          info.capacity);
        } catch (std::filesystem::filesystem_error const &ex) {
          TT_LOG_INFO("free-space failed for {}: {}", path.string(), ex.what());
          response = serialize_error(ex.what());
        }
      }
    }
  } else if (method == "torrent-get") {
    if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      auto ids = parse_ids(arguments);
      yyjson_val *fields = arguments ? yyjson_obj_get(arguments, "fields") : nullptr;
      if (needs_detail(fields)) {
        auto details = gather_torrent_details(engine_, ids);
        response = serialize_torrent_detail(details);
      } else {
        auto snapshots = filter_torrents(engine_, ids);
        response = serialize_torrent_list(snapshots);
      }
    }
  } else if (method == "torrent-add") {
    response = handle_torrent_add(engine_, arguments);
  } else if (method == "torrent-start" || method == "torrent-start-now") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      engine_->start_torrents(ids, method == "torrent-start-now");
      response = serialize_success();
    }
  } else if (method == "torrent-stop") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      engine_->stop_torrents(ids);
      response = serialize_success();
    }
  } else if (method == "torrent-verify") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      engine_->verify_torrents(ids);
      response = serialize_success();
    }
  } else if (method == "torrent-remove") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      bool delete_data =
          bool_value(yyjson_obj_get(arguments, "delete-local-data"));
      engine_->remove_torrents(ids, delete_data);
      response = serialize_success();
    }
  } else if (method == "torrent-reannounce") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      engine_->reannounce_torrents(ids);
      response = serialize_success();
    }
  } else if (method == "queue-move-top" || method == "queue-move-bottom" ||
             method == "queue-move-up" || method == "queue-move-down") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      if (method == "queue-move-top") {
        engine_->queue_move_top(ids);
      } else if (method == "queue-move-bottom") {
        engine_->queue_move_bottom(ids);
      } else if (method == "queue-move-up") {
        engine_->queue_move_up(ids);
      } else {
        engine_->queue_move_down(ids);
      }
      response = serialize_success();
    }
  } else if (method == "torrent-set") {
    auto ids = parse_ids(arguments);
    if (ids.empty()) {
      response = serialize_error("ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      bool handled = false;
      auto wanted = parse_int_array(arguments, "files-wanted");
      if (!wanted.empty()) {
        engine_->toggle_file_selection(ids, wanted, true);
        handled = true;
      }
      auto unwanted = parse_int_array(arguments, "files-unwanted");
      if (!unwanted.empty()) {
        engine_->toggle_file_selection(ids, unwanted, false);
        handled = true;
      }
      auto tracker_add =
          parse_tracker_entries(yyjson_obj_get(arguments, "trackerAdd"));
      if (!tracker_add.empty()) {
        engine_->add_trackers(ids, tracker_add);
        handled = true;
      }
      auto tracker_remove =
          parse_tracker_announces(yyjson_obj_get(arguments, "trackerRemove"));
      if (!tracker_remove.empty()) {
        engine_->remove_trackers(ids, tracker_remove);
        handled = true;
      }
      auto tracker_replace =
          parse_tracker_entries(yyjson_obj_get(arguments, "trackerReplace"));
      if (!tracker_replace.empty()) {
        engine_->replace_trackers(ids, tracker_replace);
        handled = true;
      }
      if (auto priority =
              parse_bandwidth_priority(yyjson_obj_get(arguments, "bandwidthPriority"));
          priority) {
        engine_->set_torrent_bandwidth_priority(ids, *priority);
        handled = true;
      }
      auto download_limit =
          parse_int_value(yyjson_obj_get(arguments, "downloadLimit"));
      auto download_limited =
          parse_bool_flag(yyjson_obj_get(arguments, "downloadLimited"));
      auto upload_limit =
          parse_int_value(yyjson_obj_get(arguments, "uploadLimit"));
      auto upload_limited =
          parse_bool_flag(yyjson_obj_get(arguments, "uploadLimited"));
      if (download_limit || download_limited || upload_limit ||
          upload_limited) {
        engine_->set_torrent_bandwidth_limits(ids, download_limit,
                                              download_limited, upload_limit,
                                              upload_limited);
        handled = true;
      }
      engine::TorrentSeedLimit seed_limits;
      bool seed_limit_set = false;
      if (auto ratio_limit =
              parse_double_value(yyjson_obj_get(arguments, "seedRatioLimit"))) {
        seed_limits.ratio_limit = *ratio_limit;
        seed_limit_set = true;
      }
      if (auto ratio_enabled =
              parse_bool_flag(yyjson_obj_get(arguments, "seedRatioLimited"))) {
        seed_limits.ratio_enabled = *ratio_enabled;
        seed_limit_set = true;
      }
      if (auto ratio_mode =
              parse_int_value(yyjson_obj_get(arguments, "seedRatioMode"))) {
        seed_limits.ratio_mode = *ratio_mode;
        seed_limit_set = true;
      }
      if (auto idle_limit =
              parse_int_value(yyjson_obj_get(arguments, "seedIdleLimit"))) {
        seed_limits.idle_limit = std::max(0, *idle_limit) * 60;
        seed_limit_set = true;
      }
      if (auto idle_enabled =
              parse_bool_flag(yyjson_obj_get(arguments, "seedIdleLimited"))) {
        seed_limits.idle_enabled = *idle_enabled;
        seed_limit_set = true;
      }
      if (auto idle_mode =
              parse_int_value(yyjson_obj_get(arguments, "seedIdleMode"))) {
        seed_limits.idle_mode = *idle_mode;
        seed_limit_set = true;
      }
      if (seed_limit_set) {
        engine_->set_torrent_seed_limits(ids, seed_limits);
        handled = true;
      }
      if (auto labels = parse_labels(yyjson_obj_get(arguments, "labels"))) {
        engine_->set_torrent_labels(ids, *labels);
        handled = true;
      }
      if (!handled) {
        response = serialize_error("unsupported torrent-set arguments");
      } else {
        response = serialize_success();
      }
    }
  } else if (method == "torrent-set-location") {
    auto ids = parse_ids(arguments);
    yyjson_val *location = arguments ? yyjson_obj_get(arguments, "location") : nullptr;
    if (ids.empty() || location == nullptr || !yyjson_is_str(location)) {
      response = serialize_error("location and ids required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      std::string destination(yyjson_get_str(location));
      bool move_data = bool_value(yyjson_obj_get(arguments, "move"), true);
      for (int id : ids) {
        engine_->move_torrent_location(id, destination, move_data);
      }
      response = serialize_success();
    }
  } else if (method == "torrent-rename-path") {
    auto ids = parse_ids(arguments);
    yyjson_val *path_value = arguments ? yyjson_obj_get(arguments, "path") : nullptr;
    yyjson_val *name_value = arguments ? yyjson_obj_get(arguments, "name") : nullptr;
    if (ids.empty() || path_value == nullptr || !yyjson_is_str(path_value) ||
        name_value == nullptr || !yyjson_is_str(name_value)) {
      response = serialize_error("ids, path and name required");
    } else if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      std::string path(yyjson_get_str(path_value));
      std::string name(yyjson_get_str(name_value));
      bool renamed = false;
      for (int id : ids) {
        if (engine_->rename_torrent_path(id, path, name)) {
          renamed = true;
          break;
        }
      }
      if (!renamed) {
        response = serialize_error("rename failed");
      } else {
        response = serialize_torrent_rename(ids.front(), name, path);
      }
    }
  } else if (method == "group-set") {
    TT_LOG_DEBUG("group-set ignored in this implementation");
    response = serialize_success();
  } else {
    response = serialize_error("unsupported method");
  }

  TT_LOG_DEBUG("RPC method {} responded with {} bytes", method, response.size());
  return response;
}

} // namespace tt::rpc
