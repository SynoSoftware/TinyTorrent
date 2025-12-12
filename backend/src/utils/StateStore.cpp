#include "utils/StateStore.hpp"

#include "utils/Base64.hpp"
#include "utils/Json.hpp"
#include <yyjson.h>

#include <fstream>
#include <iterator>
#include <system_error>
#include <string>

namespace tt::storage {

namespace {

std::string_view read_string(yyjson_val *root, char const *key) {
  auto *value = yyjson_obj_get(root, key);
  if (value == nullptr || !yyjson_is_str(value)) {
    return {};
  }
  return yyjson_get_str(value);
}

int read_int(yyjson_val *root, char const *key) {
  auto *value = yyjson_obj_get(root, key);
  if (value == nullptr) {
    return 0;
  }
  if (yyjson_is_sint(value)) {
    return static_cast<int>(yyjson_get_sint(value));
  }
  if (yyjson_is_uint(value)) {
    return static_cast<int>(yyjson_get_uint(value));
  }
  return 0;
}

double read_double(yyjson_val *root, char const *key) {
  auto *value = yyjson_obj_get(root, key);
  if (value == nullptr) {
    return 0.0;
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
  return 0.0;
}

bool read_bool(yyjson_val *root, char const *key) {
  auto *value = yyjson_obj_get(root, key);
  if (value == nullptr) {
    return false;
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
  return false;
}

std::uint64_t read_uint64(yyjson_val *root, char const *key) {
  auto *value = yyjson_obj_get(root, key);
  if (value == nullptr) {
    return 0;
  }
  if (yyjson_is_uint(value)) {
    return yyjson_get_uint(value);
  }
  if (yyjson_is_sint(value)) {
    auto signed_value = yyjson_get_sint(value);
    if (signed_value < 0) {
      return 0;
    }
    return static_cast<std::uint64_t>(signed_value);
  }
  return 0;
}

} // namespace

SessionState load_session_state(std::filesystem::path const &path) {
  SessionState state;
  if (path.empty() || !std::filesystem::exists(path)) {
    return state;
  }
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    return state;
  }
  std::string payload(
      (std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  if (payload.empty()) {
    return state;
  }

  auto doc = tt::json::Document::parse(payload);
  if (!doc.is_valid()) {
    return state;
  }
  auto *root = doc.root();
  if (root == nullptr || !yyjson_is_obj(root)) {
    return state;
  }

  state.listen_interface = std::string(read_string(root, "listenInterface"));
  state.rpc_bind = std::string(read_string(root, "rpcBind"));
  state.download_path = std::string(read_string(root, "downloadPath"));
  state.speed_limit_down_kbps = read_int(root, "speedLimitDown");
  state.speed_limit_down_enabled = read_bool(root, "speedLimitDownEnabled");
  state.speed_limit_up_kbps = read_int(root, "speedLimitUp");
  state.speed_limit_up_enabled = read_bool(root, "speedLimitUpEnabled");
  state.peer_limit = read_int(root, "peerLimit");
  state.peer_limit_per_torrent = read_int(root, "peerLimitPerTorrent");
  state.alt_speed_down_kbps = read_int(root, "altSpeedDown");
  state.alt_speed_up_kbps = read_int(root, "altSpeedUp");
  state.alt_speed_enabled = read_bool(root, "altSpeedEnabled");
  state.alt_speed_time_enabled = read_bool(root, "altSpeedTimeEnabled");
  state.alt_speed_time_begin = read_int(root, "altSpeedTimeBegin");
  state.alt_speed_time_end = read_int(root, "altSpeedTimeEnd");
  state.alt_speed_time_day = read_int(root, "altSpeedTimeDay");
  state.encryption = read_int(root, "encryption");
  state.dht_enabled = read_bool(root, "dhtEnabled");
  state.pex_enabled = read_bool(root, "pexEnabled");
  state.lpd_enabled = read_bool(root, "lpdEnabled");
  state.utp_enabled = read_bool(root, "utpEnabled");
  state.download_queue_size = read_int(root, "downloadQueueSize");
  state.seed_queue_size = read_int(root, "seedQueueSize");
  state.queue_stalled_enabled = read_bool(root, "queueStalledEnabled");
  state.incomplete_dir = std::string(read_string(root, "incompleteDir"));
  state.incomplete_dir_enabled = read_bool(root, "incompleteDirEnabled");
  state.watch_dir = std::string(read_string(root, "watchDir"));
  state.watch_dir_enabled = read_bool(root, "watchDirEnabled");
  state.seed_ratio_limit = read_double(root, "seedRatioLimit");
  state.seed_ratio_enabled = read_bool(root, "seedRatioLimited");
  state.seed_idle_limit = read_int(root, "seedIdleLimit");
  state.seed_idle_enabled = read_bool(root, "seedIdleLimited");
  state.proxy_type = read_int(root, "proxyType");
  state.proxy_hostname = std::string(read_string(root, "proxyHost"));
  state.proxy_port = read_int(root, "proxyPort");
  state.proxy_auth_enabled = read_bool(root, "proxyAuthEnabled");
  state.proxy_username = std::string(read_string(root, "proxyUsername"));
  state.proxy_password = std::string(read_string(root, "proxyPassword"));
  state.proxy_peer_connections = read_bool(root, "proxyPeerConnections");
  state.uploaded_bytes = read_uint64(root, "uploadedBytes");
  state.downloaded_bytes = read_uint64(root, "downloadedBytes");
  state.seconds_active = read_uint64(root, "secondsActive");
  state.session_count = read_uint64(root, "sessionCount");

  auto *labels = yyjson_obj_get(root, "labels");
  if (labels != nullptr && yyjson_is_obj(labels)) {
    yyjson_obj_iter iter;
    yyjson_obj_iter_init(labels, &iter);
    yyjson_val *key = nullptr;
    while ((key = yyjson_obj_iter_next(&iter)) != nullptr) {
      if (!yyjson_is_str(key)) {
        continue;
      }
      auto *value = yyjson_obj_iter_get_val(key);
      if (value == nullptr || !yyjson_is_arr(value)) {
        continue;
      }
      std::vector<std::string> entry_labels;
      size_t idx, limit;
      yyjson_val *label_value = nullptr;
      yyjson_arr_foreach(value, idx, limit, label_value) {
        if (yyjson_is_str(label_value)) {
          entry_labels.emplace_back(yyjson_get_str(label_value));
        }
      }
      state.labels.emplace(yyjson_get_str(key), std::move(entry_labels));
    }
  }

  auto *torrents = yyjson_obj_get(root, "torrents");
  if (torrents != nullptr && yyjson_is_arr(torrents)) {
    size_t idx, limit;
    yyjson_val *entry = nullptr;
    yyjson_arr_foreach(torrents, idx, limit, entry) {
      if (!yyjson_is_obj(entry)) {
        continue;
      }
      PersistedTorrent torrent;
      torrent.hash = std::string(read_string(entry, "hash"));
      if (torrent.hash.empty()) {
        continue;
      }
      torrent.download_path = std::string(read_string(entry, "downloadPath"));
      torrent.uri = std::string(read_string(entry, "uri"));
      torrent.metainfo = std::string(read_string(entry, "metainfo"));
      torrent.paused = read_bool(entry, "paused");
      state.torrents.push_back(std::move(torrent));
    }
  }

  return state;
}

bool save_session_state(std::filesystem::path const &path,
                        SessionState const &state) {
  if (path.empty()) {
    return false;
  }
  std::filesystem::create_directories(path.parent_path());

  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return false;
  }
  auto *native = doc.doc();
  auto *root = yyjson_mut_obj(native);
  doc.set_root(root);

  yyjson_mut_obj_add_str(native, root, "listenInterface",
                         state.listen_interface.c_str());
  yyjson_mut_obj_add_str(native, root, "rpcBind", state.rpc_bind.c_str());
  yyjson_mut_obj_add_str(native, root, "downloadPath",
                         state.download_path.c_str());
  yyjson_mut_obj_add_sint(native, root, "speedLimitDown",
                          state.speed_limit_down_kbps);
  yyjson_mut_obj_add_bool(native, root, "speedLimitDownEnabled",
                         state.speed_limit_down_enabled);
  yyjson_mut_obj_add_sint(native, root, "speedLimitUp",
                          state.speed_limit_up_kbps);
  yyjson_mut_obj_add_bool(native, root, "speedLimitUpEnabled",
                         state.speed_limit_up_enabled);
  yyjson_mut_obj_add_sint(native, root, "peerLimit", state.peer_limit);
  yyjson_mut_obj_add_sint(native, root, "peerLimitPerTorrent",
                          state.peer_limit_per_torrent);
  yyjson_mut_obj_add_sint(native, root, "altSpeedDown",
                          state.alt_speed_down_kbps);
  yyjson_mut_obj_add_sint(native, root, "altSpeedUp", state.alt_speed_up_kbps);
  yyjson_mut_obj_add_bool(native, root, "altSpeedEnabled",
                         state.alt_speed_enabled);
  yyjson_mut_obj_add_bool(native, root, "altSpeedTimeEnabled",
                         state.alt_speed_time_enabled);
  yyjson_mut_obj_add_sint(native, root, "altSpeedTimeBegin",
                          state.alt_speed_time_begin);
  yyjson_mut_obj_add_sint(native, root, "altSpeedTimeEnd",
                          state.alt_speed_time_end);
  yyjson_mut_obj_add_sint(native, root, "altSpeedTimeDay",
                          state.alt_speed_time_day);
  yyjson_mut_obj_add_sint(native, root, "encryption", state.encryption);
  yyjson_mut_obj_add_bool(native, root, "dhtEnabled", state.dht_enabled);
  yyjson_mut_obj_add_bool(native, root, "pexEnabled", state.pex_enabled);
  yyjson_mut_obj_add_bool(native, root, "lpdEnabled", state.lpd_enabled);
  yyjson_mut_obj_add_bool(native, root, "utpEnabled", state.utp_enabled);
  yyjson_mut_obj_add_sint(native, root, "downloadQueueSize",
                          state.download_queue_size);
  yyjson_mut_obj_add_sint(native, root, "seedQueueSize",
                          state.seed_queue_size);
  yyjson_mut_obj_add_bool(native, root, "queueStalledEnabled",
                         state.queue_stalled_enabled);
  if (!state.incomplete_dir.empty()) {
    yyjson_mut_obj_add_str(native, root, "incompleteDir",
                           state.incomplete_dir.c_str());
  }
  yyjson_mut_obj_add_bool(native, root, "incompleteDirEnabled",
                         state.incomplete_dir_enabled);
  if (!state.watch_dir.empty()) {
    yyjson_mut_obj_add_str(native, root, "watchDir", state.watch_dir.c_str());
  }
  yyjson_mut_obj_add_bool(native, root, "watchDirEnabled",
                         state.watch_dir_enabled);
  yyjson_mut_obj_add_real(native, root, "seedRatioLimit",
                          state.seed_ratio_limit);
  yyjson_mut_obj_add_bool(native, root, "seedRatioLimited",
                         state.seed_ratio_enabled);
  yyjson_mut_obj_add_sint(native, root, "seedIdleLimit",
                          state.seed_idle_limit);
  yyjson_mut_obj_add_bool(native, root, "seedIdleLimited",
                         state.seed_idle_enabled);
  yyjson_mut_obj_add_sint(native, root, "proxyType", state.proxy_type);
  if (!state.proxy_hostname.empty()) {
    yyjson_mut_obj_add_str(native, root, "proxyHost",
                           state.proxy_hostname.c_str());
  }
  yyjson_mut_obj_add_sint(native, root, "proxyPort", state.proxy_port);
  yyjson_mut_obj_add_bool(native, root, "proxyAuthEnabled",
                         state.proxy_auth_enabled);
  if (!state.proxy_username.empty()) {
    yyjson_mut_obj_add_str(native, root, "proxyUsername",
                           state.proxy_username.c_str());
  }
  if (!state.proxy_password.empty()) {
    yyjson_mut_obj_add_str(native, root, "proxyPassword",
                           state.proxy_password.c_str());
  }
  yyjson_mut_obj_add_bool(native, root, "proxyPeerConnections",
                         state.proxy_peer_connections);
  yyjson_mut_obj_add_uint(native, root, "uploadedBytes",
                          state.uploaded_bytes);
  yyjson_mut_obj_add_uint(native, root, "downloadedBytes",
                          state.downloaded_bytes);
  yyjson_mut_obj_add_uint(native, root, "secondsActive",
                          state.seconds_active);
  yyjson_mut_obj_add_uint(native, root, "sessionCount",
                          state.session_count);
  auto *labels_obj = yyjson_mut_obj(native);
  yyjson_mut_obj_add_val(native, root, "labels", labels_obj);
  for (auto const &entry : state.labels) {
    auto *array = yyjson_mut_arr(native);
    yyjson_mut_obj_add_val(native, labels_obj, entry.first.c_str(), array);
    for (auto const &label : entry.second) {
      yyjson_mut_arr_add_str(native, array, label.c_str());
    }
  }

  auto *torrents = yyjson_mut_arr(native);
  yyjson_mut_obj_add_val(native, root, "torrents", torrents);
  for (auto const &torrent : state.torrents) {
    auto *entry = yyjson_mut_obj(native);
    yyjson_mut_obj_add_str(native, entry, "hash", torrent.hash.c_str());
    if (!torrent.download_path.empty()) {
      yyjson_mut_obj_add_str(native, entry, "downloadPath",
                             torrent.download_path.c_str());
    }
    if (!torrent.uri.empty()) {
      yyjson_mut_obj_add_str(native, entry, "uri", torrent.uri.c_str());
    }
    if (!torrent.metainfo.empty()) {
      yyjson_mut_obj_add_str(native, entry, "metainfo", torrent.metainfo.c_str());
    }
    yyjson_mut_obj_add_bool(native, entry, "paused", torrent.paused);
    yyjson_mut_arr_add_val(torrents, entry);
  }

  auto payload = doc.write(R"({"result":"error"})");
  auto tmp_path = path;
  tmp_path.replace_extension(".json.tmp");
  std::ofstream output(tmp_path, std::ios::binary);
  if (!output) {
    return false;
  }
  output << payload;
  output.flush();
  output.close();

  std::error_code ec;
  std::filesystem::rename(tmp_path, path, ec);
  if (ec) {
    std::filesystem::remove(tmp_path, ec);
    return false;
  }
  return true;
}

} // namespace tt::storage
