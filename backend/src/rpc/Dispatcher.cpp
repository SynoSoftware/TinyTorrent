#include "rpc/Dispatcher.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Log.hpp"

#include <array>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <filesystem>
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
    size_t idx, max;
    yyjson_val *value = nullptr;
    yyjson_arr_foreach(ids, idx, max, value) {
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
  size_t idx, max;
  yyjson_val *entry = nullptr;
  yyjson_arr_foreach(value, idx, max, entry) {
    if (auto parsed = parse_int_value(entry)) {
      result.push_back(*parsed);
    }
  }
  return result;
}

bool needs_detail(yyjson_val *fields) {
  if (fields == nullptr || !yyjson_is_arr(fields)) {
    return false;
  }
  size_t idx, max;
  yyjson_val *value = nullptr;
  yyjson_arr_foreach(fields, idx, max, value) {
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
    TT_LOG_DEBUG("session-set invoked (no-op)");
    response = serialize_success();
  } else if (method == "session-test") {
    TT_LOG_DEBUG("session-test stubbed (port detection disabled)");
    response = serialize_session_test(false);
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
    } else {
      TT_LOG_INFO("torrent-rename-path stubbed (no-op)");
      response = serialize_torrent_rename(ids.front(), yyjson_get_str(name_value),
                                         yyjson_get_str(path_value));
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
