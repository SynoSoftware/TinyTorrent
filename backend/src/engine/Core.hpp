#pragma once

#include <chrono>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace tt::engine
{

enum class EncryptionMode
{
    Tolerated = 0,
    Preferred = 1,
    Required = 2,
};

struct CoreSettings
{
    std::filesystem::path download_path{"data"};
    std::string listen_interface{"0.0.0.0:6881"};
    unsigned idle_sleep_ms = 500;
    int download_rate_limit_kbps = 0;
    int upload_rate_limit_kbps = 0;
    bool download_rate_limit_enabled = false;
    bool upload_rate_limit_enabled = false;
    int alt_download_rate_limit_kbps = 0;
    int alt_upload_rate_limit_kbps = 0;
    bool alt_speed_enabled = false;
    bool alt_speed_time_enabled = false;
    int alt_speed_time_begin = 0;
    int alt_speed_time_end = 0;
    int alt_speed_time_day = 0;
    EncryptionMode encryption = EncryptionMode::Tolerated;
    int peer_limit = 0;
    int peer_limit_per_torrent = 0;
    bool dht_enabled = true;
    bool pex_enabled = true;
    bool lpd_enabled = true;
    bool utp_enabled = true;
    int download_queue_size = 0;
    int seed_queue_size = 0;
    bool queue_stalled_enabled = false;
    std::filesystem::path incomplete_dir;
    bool incomplete_dir_enabled = false;
    std::filesystem::path blocklist_path;
    std::filesystem::path state_path;
    std::filesystem::path watch_dir;
    bool watch_dir_enabled = false;
    bool seed_ratio_enabled = false;
    double seed_ratio_limit = 0.0;
    bool seed_idle_enabled = false;
    int seed_idle_limit_minutes = 0;
    int proxy_type = 0;
    std::string proxy_hostname;
    int proxy_port = 0;
    bool proxy_auth_enabled = false;
    std::string proxy_username;
    std::string proxy_password;
    bool proxy_peer_connections = false;
    bool history_enabled = true;
    int history_interval_seconds = 300;
    int history_retention_days = 30;
};

struct SessionUpdate
{
    std::optional<int> alt_speed_down_kbps;
    std::optional<int> alt_speed_up_kbps;
    std::optional<bool> alt_speed_enabled;
    std::optional<bool> alt_speed_time_enabled;
    std::optional<int> alt_speed_time_begin;
    std::optional<int> alt_speed_time_end;
    std::optional<int> alt_speed_time_day;
    std::optional<EncryptionMode> encryption;
    std::optional<bool> dht_enabled;
    std::optional<bool> pex_enabled;
    std::optional<bool> lpd_enabled;
    std::optional<bool> utp_enabled;
    std::optional<int> download_queue_size;
    std::optional<int> seed_queue_size;
    std::optional<bool> queue_stalled_enabled;
    std::optional<std::filesystem::path> incomplete_dir;
    std::optional<bool> incomplete_dir_enabled;
    std::optional<std::filesystem::path> watch_dir;
    std::optional<bool> watch_dir_enabled;
    std::optional<bool> seed_ratio_enabled;
    std::optional<double> seed_ratio_limit;
    std::optional<bool> seed_idle_enabled;
    std::optional<int> seed_idle_limit;
    std::optional<int> proxy_type;
    std::optional<std::string> proxy_hostname;
    std::optional<int> proxy_port;
    std::optional<bool> proxy_auth_enabled;
    std::optional<std::string> proxy_username;
    std::optional<std::string> proxy_password;
    std::optional<bool> proxy_peer_connections;
    std::optional<bool> history_enabled;
    std::optional<int> history_interval_seconds;
    std::optional<int> history_retention_days;
};

struct TrackerEntry
{
    std::string announce;
    int tier = 0;
};

struct TorrentSeedLimit
{
    std::optional<double> ratio_limit;
    std::optional<bool> ratio_enabled;
    std::optional<int> ratio_mode;
    std::optional<int> idle_limit;
    std::optional<bool> idle_enabled;
    std::optional<int> idle_mode;
};

struct TorrentAddRequest
{
    std::optional<std::string> uri;
    std::vector<std::uint8_t> metainfo;
    std::vector<std::uint8_t> resume_data;
    std::filesystem::path download_path;
    bool paused = false;
};

struct TorrentSnapshot
{
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
    std::vector<std::string> labels;
    int bandwidth_priority = 0;
    std::uint64_t revision = 0;
};

struct TorrentFileInfo
{
    int index = 0;
    std::string name;
    std::uint64_t length = 0;
    std::uint64_t bytes_completed = 0;
    double progress = 0.0;
    int priority = 0;
    bool wanted = true;
};

struct TorrentTrackerInfo
{
    std::string announce;
    int tier = 0;
};

struct TorrentPeerInfo
{
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

struct TorrentDetail
{
    TorrentSnapshot summary;
    std::vector<TorrentFileInfo> files;
    std::vector<TorrentTrackerInfo> trackers;
    std::vector<TorrentPeerInfo> peers;
    int piece_count = 0;
    int piece_size = 0;
    std::vector<int> piece_states;
    std::vector<int> piece_availability;
};

struct SessionStatistics
{
    std::uint64_t uploaded_bytes = 0;
    std::uint64_t downloaded_bytes = 0;
    std::uint64_t seconds_active = 0;
    std::uint64_t session_count = 0;
};

struct SessionTotals
{
    std::uint64_t uploaded = 0;
    std::uint64_t downloaded = 0;
};

struct HistoryBucket
{
    std::int64_t timestamp = 0;
    std::uint64_t total_down = 0;
    std::uint64_t total_up = 0;
    std::uint64_t peak_down = 0;
    std::uint64_t peak_up = 0;
};

struct HistoryConfig
{
    bool enabled = true;
    int interval_seconds = 300;
    int retention_days = 30;
};

struct SessionSnapshot
{
    std::vector<TorrentSnapshot> torrents;
    std::uint64_t download_rate = 0;
    std::uint64_t upload_rate = 0;
    std::size_t torrent_count = 0;
    std::size_t active_torrent_count = 0;
    std::size_t paused_torrent_count = 0;
    std::uint64_t dht_nodes = 0;
    SessionStatistics cumulative_stats;
    SessionStatistics current_stats;
};

class Core
{
  public:
    enum class AddTorrentStatus
    {
        Ok,
        InvalidUri
    };

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
    void toggle_file_selection(std::vector<int> ids,
                               std::vector<int> file_indexes, bool wanted);
    void set_sequential(std::vector<int> ids, bool enabled);
    void set_super_seeding(std::vector<int> ids, bool enabled);
    void move_torrent_location(int id, std::string path, bool move);
    void set_download_path(std::filesystem::path path);
    bool set_listen_port(std::uint16_t port);
    bool rename_torrent_path(int id, std::string const &path,
                             std::string const &name);
    void set_speed_limits(std::optional<int> download_kbps,
                          std::optional<bool> download_enabled,
                          std::optional<int> upload_kbps,
                          std::optional<bool> upload_enabled);
    void set_peer_limits(std::optional<int> global_limit,
                         std::optional<int> per_torrent_limit);
    bool request_blocklist_reload();
    std::size_t blocklist_entry_count() const noexcept;
    std::optional<std::chrono::system_clock::time_point>
    blocklist_last_update() const noexcept;
    void update_session_settings(SessionUpdate update);
    void add_trackers(std::vector<int> ids,
                      std::vector<TrackerEntry> const &entries);
    void remove_trackers(std::vector<int> ids,
                         std::vector<std::string> const &announces);
    void replace_trackers(std::vector<int> ids,
                          std::vector<TrackerEntry> const &entries);
    void set_torrent_bandwidth_priority(std::vector<int> ids, int priority);
    void set_torrent_bandwidth_limits(std::vector<int> ids,
                                      std::optional<int> download_limit_kbps,
                                      std::optional<bool> download_limited,
                                      std::optional<int> upload_limit_kbps,
                                      std::optional<bool> upload_limited);
    void set_torrent_seed_limits(std::vector<int> ids, TorrentSeedLimit limits);
    void set_torrent_labels(std::vector<int> ids,
                            std::vector<std::string> const &labels);
    using HistoryCallback = std::function<void(std::vector<HistoryBucket>)>;
    HistoryConfig history_config() const;
    void history_data(std::int64_t start, std::int64_t end, std::int64_t step,
                      HistoryCallback callback) const;
    bool history_clear(std::optional<std::int64_t> older_than);
    std::string listen_error() const;
    void set_listen_error_for_testing(std::string message);

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace tt::engine
