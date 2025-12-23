#pragma once

#include "engine/Core.hpp"
#include <atomic>
#include <functional>
#include <libtorrent/settings_pack.hpp>
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <unordered_map>
#include <vector>

// Forward declarations
namespace libtorrent
{
struct torrent_handle;
inline namespace v2
{
struct session_params;
struct torrent_status;
} // namespace v2
} // namespace libtorrent

namespace tt::engine
{

class TorrentManager;
class PersistenceManager;
class StateService;
class HistoryAgent;
class SnapshotBuilder;
class EventBus;
class ConfigurationService;

struct TorrentLimitState
{
    std::optional<double> ratio_limit;
    bool ratio_enabled = false;
    std::optional<int> ratio_mode;
    std::optional<int> idle_limit;
    bool idle_enabled = false;
    std::optional<int> idle_mode;
    std::chrono::steady_clock::time_point last_activity;
    bool ratio_triggered = false;
    bool idle_triggered = false;
};

class SessionService
{
  public:
    SessionService(TorrentManager *manager, PersistenceManager *persistence,
                   StateService *state, HistoryAgent *history,
                   ConfigurationService *config, EventBus *bus);
    ~SessionService();

    void start(libtorrent::v2::session_params params);
    void tick(std::chrono::steady_clock::time_point now);

    // Command Interface (Engine Thread Safe)
    Core::AddTorrentStatus add_torrent(TorrentAddRequest request);
    void remove_torrents(std::vector<int> const &ids, bool delete_data);
    void
    perform_action(std::vector<int> const &ids,
                   std::function<void(libtorrent::torrent_handle &)> action);
    void perform_action_all(
        std::function<void(libtorrent::torrent_handle &)> action);

    // Query Interface (Thread Safe)
    std::shared_ptr<SessionSnapshot> snapshot() const;
    std::optional<TorrentDetail> get_detail(int id);

    // Advanced setters (Thread Safe)
    void apply_seed_limits(std::vector<int> const &ids,
                           TorrentSeedLimit const &limits);
    void apply_bandwidth_priority(std::vector<int> const &ids, int priority);
    void apply_bandwidth_limits(std::vector<int> const &ids,
                                std::optional<int> dl,
                                std::optional<bool> dl_en,
                                std::optional<int> ul,
                                std::optional<bool> ul_en);

    // ID Mapping
    int get_rpc_id(std::string const &hash);
    std::string get_hash(int id);

  private:
    void update_snapshot(std::chrono::steady_clock::time_point now);
    void check_speed_limits(bool force = false);
    void enforce_limits(int id, libtorrent::torrent_handle const &h,
                        libtorrent::v2::torrent_status const &s,
                        std::vector<int> *pending_pause_ids = nullptr);
    void mark_dirty(int id);
    std::uint64_t ensure_revision(int id);

    TorrentManager *manager_;
    PersistenceManager *persistence_;
    StateService *state_;
    HistoryAgent *history_;
    ConfigurationService *config_;
    EventBus *bus_;

    std::unique_ptr<SnapshotBuilder> snapshot_builder_;

    // Logic state
    // Protected by data_mutex_
    std::unordered_map<int, TorrentLimitState> seed_limits_;
    std::unordered_map<std::string, std::string> error_messages_;

    // Protected by priority_mutex_ (Shared because SnapshotBuilder reads it
    // frequently)
    std::unordered_map<int, int> priorities_;

    // Only accessed on Engine thread or during snapshot build (which is
    // serialized on engine thread)
    std::unordered_map<int, std::uint64_t> revisions_;
    std::uint64_t next_revision_ = 1;
    bool alt_speed_active_ = false;
    std::optional<libtorrent::settings_pack> last_applied_pack_;

    mutable std::mutex data_mutex_;
    mutable std::shared_mutex priority_mutex_;
};

} // namespace tt::engine
