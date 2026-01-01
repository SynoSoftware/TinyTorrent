#pragma once

#include "engine/Core.hpp"

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/ip_filter.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_handle.hpp>
#include <libtorrent/sha1_hash.hpp>

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <filesystem>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace tt::engine
{

struct Sha1HashHash
{
    std::size_t operator()(libtorrent::sha1_hash const &hash) const noexcept
    {
        constexpr auto size = libtorrent::sha1_hash::size();
        auto const *data = reinterpret_cast<unsigned char const *>(hash.data());
        std::size_t value = 0;
        for (std::size_t i = 0; i < size; ++i)
        {
            value = value * 1315423911u + data[i];
        }
        return value;
    }
};

class TorrentManager
{
  public:
    struct AlertCallbacks
    {
        std::function<void(libtorrent::torrent_handle const &,
                           libtorrent::v2::torrent_status const &)>
            on_torrent_finished;
        std::function<std::filesystem::path(std::string const &)>
            metadata_file_path;
        std::function<void(std::string const &, std::filesystem::path const &,
                           std::vector<std::uint8_t> const &)>
            on_metadata_persisted;
        std::function<void(std::string const &,
                           libtorrent::add_torrent_params const &)>
            on_resume_data;
        std::function<void(std::string const &)> on_resume_hash_completed;
        std::function<void()> extend_resume_deadline;
        std::function<void(std::vector<libtorrent::v2::torrent_status> const &)>
            on_state_update;
        std::function<void(libtorrent::listen_succeeded_alert const &)>
            on_listen_succeeded;
        std::function<void(libtorrent::listen_failed_alert const &)>
            on_listen_failed;
        std::function<void(libtorrent::file_error_alert const &)> on_file_error;
        std::function<void(libtorrent::tracker_error_alert const &)>
            on_tracker_error;
        std::function<void(libtorrent::portmap_error_alert const &)>
            on_portmap_error;
        std::function<void(libtorrent::torrent_delete_failed_alert const &)>
            on_torrent_delete_failed;
        std::function<void(libtorrent::add_torrent_alert const &)>
            on_torrent_add_failed;
        std::function<void(libtorrent::metadata_failed_alert const &)>
            on_metadata_failed;
        std::function<void(libtorrent::storage_moved_alert const &)>
            on_storage_moved;
        std::function<void(libtorrent::storage_moved_failed_alert const &)>
            on_storage_moved_failed;
        std::function<void(libtorrent::fastresume_rejected_alert const &)>
            on_fastresume_rejected;
    };

    struct SnapshotBuildCallbacks
    {
        std::function<TorrentSnapshot(
            int, libtorrent::v2::torrent_status const &, std::uint64_t,
            std::optional<std::int64_t>)>
            build_snapshot_entry;
        std::function<void(int, libtorrent::torrent_handle const &,
                           libtorrent::v2::torrent_status const &)>
            on_torrent_visit;
        std::function<std::vector<std::string>(int, std::string const &)>
            labels_for_torrent;
        std::function<int(int)> priority_for_torrent;
        std::function<std::uint64_t(int)> ensure_revision;
    };

    struct SnapshotBuildResult
    {
        std::shared_ptr<SessionSnapshot> snapshot;
        std::unordered_set<int> seen_ids;
    };

    TorrentManager();
    TorrentManager(TorrentManager const &) = delete;
    TorrentManager &operator=(TorrentManager const &) = delete;
    ~TorrentManager();

    void start_session(libtorrent::v2::session_params params);
    libtorrent::session *session() const noexcept;

    void enqueue_task(std::function<void()> task);
    template <typename Fn>
    auto run_task(Fn &&fn) -> std::future<std::invoke_result_t<Fn>>
    {
        using result_t = std::invoke_result_t<Fn>;
        auto task = std::make_shared<std::packaged_task<result_t()>>(
            std::forward<Fn>(fn));
        auto future = task->get_future();
        enqueue_task([task]() mutable { (*task)(); });
        return future;
    }
    void process_tasks();
    void wait_for_work(unsigned idle_sleep_ms,
                       std::atomic_bool const &shutdown_requested);
    void notify();
    void set_alert_callbacks(AlertCallbacks callbacks);
    void
    handle_torrent_finished(libtorrent::torrent_finished_alert const &alert);
    void handle_metadata_received_alert(
        libtorrent::metadata_received_alert const &alert);
    void handle_save_resume_data_alert(
        libtorrent::save_resume_data_alert const &alert);
    void handle_save_resume_data_failed_alert(
        libtorrent::save_resume_data_failed_alert const &alert);
    int assign_rpc_id(libtorrent::sha1_hash const &hash);
    std::optional<int> id_for_hash(libtorrent::sha1_hash const &hash) const;
    void recover_rpc_mappings(
        std::vector<std::pair<std::string, int>> const &mappings);
    void update_rpc_id(libtorrent::sha1_hash const &hash, int id);
    std::optional<libtorrent::torrent_handle> handle_for_id(int id) const;
    std::optional<TorrentSnapshot>
    cached_snapshot(int id, std::uint64_t revision) const;
    std::vector<int> purge_missing_ids(std::unordered_set<int> const &seen_ids);
    bool has_pending_move(std::string const &hash) const;
    void queue_pending_move(std::string const &hash,
                            std::filesystem::path const &destination);
    void cancel_pending_move(std::string const &hash);
    void process_alerts();
    void async_add_torrent(libtorrent::add_torrent_params params);
    std::vector<libtorrent::torrent_handle> torrent_handles() const;
    std::vector<libtorrent::torrent_handle>
    handles_for_ids(std::vector<int> const &ids) const;
    void set_ip_filter(libtorrent::ip_filter &&filter);
    void remove_torrent(libtorrent::torrent_handle const &handle,
                        bool delete_data);
    std::vector<char>
    write_session_params(libtorrent::save_state_flags_t mode) const;
    void apply_settings(libtorrent::settings_pack const &pack);
    void set_pex_enabled(bool enabled);
    void set_torrent_bandwidth_limits(std::vector<int> const &ids,
                                      std::optional<int> download_limit_kbps,
                                      std::optional<bool> download_limited,
                                      std::optional<int> upload_limit_kbps,
                                      std::optional<bool> upload_limited);
    SessionTotals capture_session_totals() const;
    RehashState rehash_info(int id) const;
    void notify_rehash_requested(int id);

    std::shared_ptr<SessionSnapshot> snapshot_copy() const noexcept;
    void store_snapshot(std::shared_ptr<SessionSnapshot> snapshot);
    SnapshotBuildResult build_snapshot(SnapshotBuildCallbacks const &callbacks);

  private:
    std::unique_ptr<libtorrent::session> session_;
    libtorrent::settings_pack current_settings_;

    std::deque<std::function<void()>> tasks_;
    mutable std::mutex task_mutex_;
    std::condition_variable task_space_cv_;
    std::condition_variable wake_cv_;
    std::mutex wake_mutex_;
    std::atomic<std::shared_ptr<SessionSnapshot>> snapshot_{
        std::make_shared<SessionSnapshot>()};

    AlertCallbacks callbacks_;
    std::unordered_map<libtorrent::sha1_hash, int, Sha1HashHash> hash_to_id_;
    std::unordered_map<int, libtorrent::sha1_hash> id_to_hash_;
    int next_id_ = 1;
    std::unordered_map<int, TorrentSnapshot> snapshot_cache_;
    mutable std::mutex pending_move_mutex_;
    std::unordered_map<std::string, std::filesystem::path> pending_move_paths_;
    struct ActivityCounters
    {
        std::uint64_t tracker_announces = 0;
        std::uint64_t dht_replies = 0;
        std::uint64_t peer_connections = 0;
    };

    void record_tracker_announce(libtorrent::tracker_announce_alert const &alert);
    void record_dht_reply(libtorrent::dht_reply_alert const &alert);
    void record_peer_connect(libtorrent::peer_connect_alert const &alert);
    void record_activity(libtorrent::torrent_handle const &handle,
                         std::function<void(ActivityCounters &)> update);
    void apply_activity(TorrentSnapshot &snapshot, int id) const;
    void prune_activity(std::unordered_set<int> const &seen_ids);
    void mark_rehash_completed(libtorrent::torrent_handle const &handle);
    std::optional<int> id_for_handle(libtorrent::torrent_handle const &handle) const;

    std::unordered_map<int, ActivityCounters> activity_counters_;
    mutable std::mutex activity_mutex_;
    std::unordered_map<int, RehashState> rehash_states_;
    mutable std::mutex rehash_mutex_;

    static constexpr std::size_t kMaxPendingTasks = 4096;
    static constexpr std::size_t kAlertBufferCapacity = 65536;
    std::vector<libtorrent::alert *> alert_buffer_;
    std::size_t alert_buffer_annotated_size_ = 0;
};

} // namespace tt::engine
