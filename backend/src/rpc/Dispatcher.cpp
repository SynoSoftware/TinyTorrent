#include "rpc/Dispatcher.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Log.hpp"

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#endif

#include <array>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <limits>
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
    TT_LOG_INFO("session-set download-dir invalid: %s", ex.what());
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

std::optional<std::vector<std::uint8_t>> decode_base64(std::string_view input) {
  static constexpr char const *kAlphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  static const std::array<int8_t, 256> kLookup = [] {
    std::array<int8_t, 256> table{};
    table.fill(-1);
    for (int i = 0; kAlphabet[i] != '\0'; ++i) {
      table[static_cast<std::size_t>(kAlphabet[i])] =
          static_cast<int8_t>(i);
    }
    return table;
  }();

  std::vector<std::uint8_t> result;
  result.reserve((input.size() * 3) / 4);
  unsigned buffer = 0;
  int bits_collected = 0;
  for (char ch : input) {
    if (std::isspace(static_cast<unsigned char>(ch))) {
      continue;
    }
    if (ch == '=') {
      break;
    }
    auto value = kLookup[static_cast<unsigned char>(ch)];
    if (value < 0) {
      return std::nullopt;
    }
    buffer = (buffer << 6) | static_cast<unsigned>(value);
    bits_collected += 6;
    if (bits_collected >= 8) {
      bits_collected -= 8;
      result.push_back(
          static_cast<std::uint8_t>((buffer >> bits_collected) & 0xFF));
    }
  }
  return result;
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
    auto decoded = decode_base64(raw);
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

  TT_LOG_DEBUG("torrent-add download-dir=%s paused=%d",
               request.download_path.string().c_str(),
               static_cast<int>(request.paused));
  auto status = engine->enqueue_add_torrent(std::move(request));
  return serialize_add_result(status);
}

} // namespace

Dispatcher::Dispatcher(engine::Core *engine) : engine_(engine) {}

std::string Dispatcher::dispatch(std::string_view payload) {
  if (payload.empty()) {
    return serialize_error("empty RPC payload");
  }

  yyjson_doc *doc = yyjson_read(payload.data(), payload.size(), 0);
  if (doc == nullptr) {
    return serialize_error("invalid JSON");
  }

  yyjson_val *root = yyjson_doc_get_root(doc);
  if (root == nullptr || !yyjson_is_obj(root)) {
    yyjson_doc_free(doc);
    return serialize_error("expected JSON object");
  }

  yyjson_val *method_value = yyjson_obj_get(root, "method");
  if (method_value == nullptr || !yyjson_is_str(method_value)) {
    yyjson_doc_free(doc);
    return serialize_error("missing method");
  }

  std::string method(yyjson_get_str(method_value));
  TT_LOG_DEBUG("Dispatching RPC method=%s", method.c_str());

  yyjson_val *arguments = yyjson_obj_get(root, "arguments");
  std::string response;

  if (method == "session-get") {
    if (!engine_) {
      response = serialize_error("engine unavailable");
    } else {
      response = serialize_session_settings(engine_->settings());
    }
  } else if (method == "session-set") {
    if (!engine_) {
      response = serialize_success();
    } else {
      bool applied = false;
      bool ok = true;
      if (auto download = parse_download_dir(arguments)) {
        TT_LOG_DEBUG("session-set download-dir=%s",
                     download->string().c_str());
        engine_->set_download_path(*download);
        applied = true;
      }
      if (auto port = parse_peer_port(arguments)) {
        TT_LOG_DEBUG("session-set peer-port=%u", static_cast<unsigned>(*port));
        applied = true;
        if (!engine_->set_listen_port(*port)) {
          ok = false;
        }
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
          TT_LOG_INFO("free-space failed for %s: %s", path.string().c_str(),
                      ex.what());
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
      if (!handled) {
        response = serialize_error("files-wanted or files-unwanted required");
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

  yyjson_doc_free(doc);
  TT_LOG_DEBUG("RPC method %s responded with %zu bytes", method.c_str(),
               response.size());
  return response;
}

} // namespace tt::rpc
