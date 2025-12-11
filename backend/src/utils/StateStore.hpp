#pragma once

#include <filesystem>
#include <string>
#include <vector>

namespace tt::storage {

struct PersistedTorrent {
  std::string hash;
  std::string download_path;
  bool paused = false;
  std::string uri;
  std::string metainfo;
};

struct SessionState {
  std::string listen_interface;
  std::string rpc_bind;
  std::string download_path;
  int speed_limit_down_kbps = 0;
  bool speed_limit_down_enabled = false;
  int speed_limit_up_kbps = 0;
  bool speed_limit_up_enabled = false;
  int peer_limit = 0;
  int peer_limit_per_torrent = 0;
  std::vector<PersistedTorrent> torrents;
};

SessionState load_session_state(std::filesystem::path const &path);
bool save_session_state(std::filesystem::path const &path,
                        SessionState const &state);

} // namespace tt::storage
