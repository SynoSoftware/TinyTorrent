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
