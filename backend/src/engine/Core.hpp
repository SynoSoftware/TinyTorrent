#pragma once

#include <cstdint>
#include <filesystem>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace tt::engine {

struct CoreSettings {
  std::filesystem::path download_path{"data"};
  std::string listen_interface{"0.0.0.0:6881"};
  unsigned idle_sleep_ms = 500;
};

struct TorrentAddRequest {
  std::optional<std::string> uri;
  std::vector<std::uint8_t> metainfo;
  std::filesystem::path download_path;
  bool paused = false;
};

struct TorrentSnapshot {
  int id = 0;
  std::string hash;
  std::string name;
  std::string state;
  double progress = 0.0;
  std::int64_t total_wanted = 0;
  std::int64_t total_done = 0;
  std::int64_t total_size = 0;
  std::int64_t downloaded = 0;
  std::int64_t uploaded = 0;
  std::uint64_t download_rate = 0;
  std::uint64_t upload_rate = 0;
  int status = 0;
  int queue_position = 0;
  int peers_connected = 0;
  int seeds_connected = 0;
  int peers_sending_to_us = 0;
  int peers_getting_from_us = 0;
  std::int64_t eta = 0;
  std::int64_t total_wanted_done = 0;
  std::int64_t added_time = 0;
  double ratio = 0.0;
  bool is_finished = false;
  bool sequential_download = false;
  bool super_seeding = false;
  std::string download_dir;
  int error = 0;
  std::string error_string;
  std::int64_t left_until_done = 0;
  std::int64_t size_when_done = 0;
};

struct TorrentFileInfo {
  int index = 0;
  std::string name;
  std::uint64_t length = 0;
  std::uint64_t bytes_completed = 0;
  double progress = 0.0;
  int priority = 0;
  bool wanted = true;
};

struct TorrentTrackerInfo {
  std::string announce;
  int tier = 0;
};

struct TorrentPeerInfo {
  std::string address;
  std::string client_name;
  bool client_is_choking = false;
  bool client_is_interested = false;
  bool peer_is_choking = false;
  bool peer_is_interested = false;
  std::string flag_str;
  int rate_to_client = 0;
  int rate_to_peer = 0;
  double progress = 0.0;
};

struct TorrentDetail {
  TorrentSnapshot summary;
  std::vector<TorrentFileInfo> files;
  std::vector<TorrentTrackerInfo> trackers;
  std::vector<TorrentPeerInfo> peers;
  int piece_count = 0;
  int piece_size = 0;
  std::vector<int> piece_states;
  std::vector<int> piece_availability;
};

struct SessionSnapshot {
  std::vector<TorrentSnapshot> torrents;
  std::uint64_t download_rate = 0;
  std::uint64_t upload_rate = 0;
  std::size_t torrent_count = 0;
  std::size_t active_torrent_count = 0;
  std::size_t paused_torrent_count = 0;
  std::uint64_t dht_nodes = 0;
};

class Core {
public:
  enum class AddTorrentStatus { Ok, InvalidUri };

  explicit Core(CoreSettings settings);
  ~Core();
  static std::unique_ptr<Core> create(CoreSettings settings);

  void run();
  void stop() noexcept;
  bool is_running() const noexcept;

  AddTorrentStatus enqueue_add_torrent(TorrentAddRequest request);
  std::shared_ptr<SessionSnapshot> snapshot() const noexcept;
  CoreSettings settings() const noexcept;
  std::vector<TorrentSnapshot> torrent_list() const;
  std::optional<TorrentDetail> torrent_detail(int id);
  void start_torrents(std::vector<int> ids, bool now = false);
  void stop_torrents(std::vector<int> ids);
  void verify_torrents(std::vector<int> ids);
  void remove_torrents(std::vector<int> ids, bool delete_data = false);
  void reannounce_torrents(std::vector<int> ids);
  void queue_move_top(std::vector<int> ids);
  void queue_move_bottom(std::vector<int> ids);
  void queue_move_up(std::vector<int> ids);
  void queue_move_down(std::vector<int> ids);
  void toggle_file_selection(std::vector<int> ids, std::vector<int> file_indexes, bool wanted);
  void set_sequential(std::vector<int> ids, bool enabled);
  void set_super_seeding(std::vector<int> ids, bool enabled);
  void move_torrent_location(int id, std::string path, bool move);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace tt::engine
