#pragma once

#include <filesystem>
#include <string>
#include <unordered_map>
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
  int alt_speed_down_kbps = 0;
  int alt_speed_up_kbps = 0;
  bool alt_speed_enabled = false;
  bool alt_speed_time_enabled = false;
  int alt_speed_time_begin = 0;
  int alt_speed_time_end = 0;
  int alt_speed_time_day = 0;
  int encryption = 0;
  bool dht_enabled = true;
  bool pex_enabled = true;
  bool lpd_enabled = true;
  bool utp_enabled = true;
  int download_queue_size = 0;
  int seed_queue_size = 0;
  bool queue_stalled_enabled = false;
  std::string incomplete_dir;
  bool incomplete_dir_enabled = false;
  std::vector<PersistedTorrent> torrents;
  bool watch_dir_enabled = false;
  std::string watch_dir;
  bool seed_ratio_enabled = false;
  double seed_ratio_limit = 0.0;
  bool seed_idle_enabled = false;
  int seed_idle_limit = 0;
  int proxy_type = 0;
  std::string proxy_hostname;
  int proxy_port = 0;
  bool proxy_auth_enabled = false;
  std::string proxy_username;
  std::string proxy_password;
  bool proxy_peer_connections = false;
  std::unordered_map<std::string, std::vector<std::string>> labels;
};

SessionState load_session_state(std::filesystem::path const &path);
bool save_session_state(std::filesystem::path const &path,
                        SessionState const &state);

} // namespace tt::storage
