#include "engine/Core.hpp"
#include "engine/AsyncTaskService.hpp"
#include "engine/AutomationAgent.hpp"
#include "engine/BlocklistManager.hpp"
#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/announce_entry.hpp>
#include <libtorrent/bdecode.hpp>
#include <libtorrent/download_priority.hpp>
#include <libtorrent/error_code.hpp>
#include <libtorrent/file_storage.hpp>
#include <libtorrent/hex.hpp>
#include <libtorrent/kademlia/dht_state.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/peer_info.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_handle.hpp>
#include <libtorrent/session_params.hpp>
#include <libtorrent/settings_pack.hpp>
#include <libtorrent/sha1_hash.hpp>
#include <libtorrent/span.hpp>
#include <libtorrent/storage_defs.hpp>
#include <libtorrent/time.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_status.hpp>
#include <libtorrent/units.hpp>
#include <libtorrent/write_resume_data.hpp>
#include <string_view>

#include "engine/SettingsManager.hpp"
#include "utils/Base64.hpp"
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

#include <atomic>
#include <cerrno>
#include <chrono>
#include <ctime>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <functional>
#include <future>
#include <iterator>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <string>
#include <system_error>
#include <type_traits>
#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif
#include <span>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace tt::engine
{

namespace
{

constexpr char const *kUserAgent = "TinyTorrent/0.1.0";
constexpr auto kHousekeepingInterval = std::chrono::seconds(2);
constexpr auto kResumeAlertTimeout = std::chrono::seconds(5);
constexpr auto kStateFlushInterval = std::chrono::seconds(5);
constexpr auto kShutdownTimeout = std::chrono::seconds(10);
constexpr int kMinHistoryIntervalSeconds = 60;
constexpr std::size_t kMaxPendingTasks = 4096;
constexpr int kAlertQueueSizeLimit = 8192;
constexpr auto kSettingsPersistInterval = std::chrono::milliseconds(500);

std::int64_t
align_to_history_interval(std::chrono::system_clock::time_point now,
                          int interval_seconds)
{
    auto seconds = static_cast<std::int64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch())
            .count());
    if (interval_seconds <= 0)
    {
        return seconds;
    }
    return (seconds / interval_seconds) * interval_seconds;
}

std::string to_utf8_string(std::u8string const &value)
{
    return std::string(value.begin(), value.end());
}

std::string to_utf8_string(std::filesystem::path const &path)
{
    return to_utf8_string(path.u8string());
}

std::int64_t estimate_eta(libtorrent::torrent_status const &status)
{
    if (status.download_rate <= 0)
    {
        return -1;
    }
    auto remaining = status.total_wanted - status.total_wanted_done;
    if (remaining <= 0)
    {
        return 0;
    }
    return (remaining + static_cast<std::int64_t>(status.download_rate) - 1) /
           static_cast<std::int64_t>(status.download_rate);
}

std::string to_state_string(libtorrent::torrent_status::state_t state)
{
    using state_t = libtorrent::torrent_status::state_t;
    switch (state)
    {
    case state_t::checking_files:
        return "checking-files";
    case state_t::downloading_metadata:
        return "downloading-metadata";
    case state_t::downloading:
        return "downloading";
    case state_t::finished:
        return "finished";
    case state_t::seeding:
        return "seeding";
    case state_t::checking_resume_data:
        return "checking-resume-data";
    default:
        return "unknown";
    }
}

std::string normalize_torrent_path(std::string_view value)
{
    if (value.empty())
    {
        return {};
    }
    try
    {
        auto path = std::filesystem::path(std::string(value));
        path = path.lexically_normal();
        return path.generic_string();
    }
    catch (...)
    {
        return {};
    }
}

std::tm to_local_time(std::time_t value)
{
    std::tm result{};
#if defined(_WIN32)
    localtime_s(&result, &value);
#else
    localtime_r(&value, &result);
#endif
    return result;
}

bool alt_speed_day_matches(CoreSettings const &settings, int day)
{
    int mask = settings.alt_speed_time_day;
    if (mask == 0)
    {
        mask = 0x7F;
    }
    return (mask & (1 << day)) != 0;
}

bool alt_speed_time_matches(CoreSettings const &settings)
{
    if (!settings.alt_speed_time_enabled)
    {
        return false;
    }
    int begin = std::clamp(settings.alt_speed_time_begin, 0, 24 * 60 - 1);
    int end = std::clamp(settings.alt_speed_time_end, 0, 24 * 60 - 1);
    auto now = std::chrono::system_clock::now();
    auto tm = to_local_time(std::chrono::system_clock::to_time_t(now));
    int minute = tm.tm_hour * 60 + tm.tm_min;
    if (!alt_speed_day_matches(settings, tm.tm_wday))
    {
        return false;
    }
    if (begin == end)
    {
        return true;
    }
    if (begin < end)
    {
        return minute >= begin && minute < end;
    }
    return minute >= begin || minute < end;
}

bool should_use_alt_speed(CoreSettings const &settings)
{
    if (settings.alt_speed_enabled)
    {
        return true;
    }
    if (settings.alt_speed_time_enabled)
    {
        return alt_speed_time_matches(settings);
    }
    return false;
}

void configure_encryption(libtorrent::settings_pack &pack, EncryptionMode mode)
{
    using namespace libtorrent;
    settings_pack::enc_policy policy = settings_pack::enc_policy::pe_enabled;
    settings_pack::enc_level level = settings_pack::enc_level::pe_both;
    bool prefer_rc4 = false;
    switch (mode)
    {
    case EncryptionMode::Preferred:
        prefer_rc4 = true;
        break;
    case EncryptionMode::Required:
        policy = settings_pack::enc_policy::pe_forced;
        level = settings_pack::enc_level::pe_rc4;
        prefer_rc4 = true;
        break;
    case EncryptionMode::Tolerated:
    default:
        break;
    }
    pack.set_int(settings_pack::out_enc_policy, static_cast<int>(policy));
    pack.set_int(settings_pack::in_enc_policy, static_cast<int>(policy));
    pack.set_int(settings_pack::allowed_enc_level, static_cast<int>(level));
    pack.set_bool(settings_pack::prefer_rc4, prefer_rc4);
}

void configure_proxy_settings(libtorrent::settings_pack &pack,
                              CoreSettings const &settings)
{
    pack.set_int(libtorrent::settings_pack::proxy_type, settings.proxy_type);
    pack.set_str(libtorrent::settings_pack::proxy_hostname,
                 settings.proxy_hostname);
    pack.set_int(libtorrent::settings_pack::proxy_port, settings.proxy_port);
    pack.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                  settings.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                  settings.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_hostnames,
                  !settings.proxy_hostname.empty());
    pack.set_str(libtorrent::settings_pack::proxy_username,
                 settings.proxy_auth_enabled ? settings.proxy_username : "");
    pack.set_str(libtorrent::settings_pack::proxy_password,
                 settings.proxy_auth_enabled ? settings.proxy_password : "");
}

} // namespace

struct TorrentLimitState
{
    std::optional<double> ratio_limit;
    bool ratio_enabled = false;
    std::optional<int> ratio_mode;
    std::optional<int> idle_limit;
    bool idle_enabled = false;
    std::optional<int> idle_mode;
    libtorrent::clock_type::time_point last_activity =
        libtorrent::clock_type::now();
    bool ratio_triggered = false;
    bool idle_triggered = false;
};

struct Core::Impl
{
    friend class Core;
    CoreSettings settings;
    std::unique_ptr<TorrentManager> torrent_manager;
    libtorrent::settings_pack current_settings;
    std::atomic_bool running{true};
    std::atomic<std::chrono::steady_clock::duration::rep> shutdown_start_ticks{
        0};
    std::filesystem::path state_path;
    std::filesystem::path metadata_dir;
    std::filesystem::path dht_state_path;
    std::chrono::steady_clock::time_point session_start_time =
        std::chrono::steady_clock::now();
    std::uint64_t session_start_downloaded = 0;
    std::uint64_t session_start_uploaded = 0;
    std::chrono::steady_clock::time_point stats_last_update =
        std::chrono::steady_clock::now();
    std::uint64_t last_total_downloaded = 0;
    std::uint64_t last_total_uploaded = 0;
    bool state_dirty = false;
    std::chrono::steady_clock::time_point last_state_flush =
        std::chrono::steady_clock::now();
    std::unique_ptr<PersistenceManager> persistence;
    std::unique_ptr<HistoryAgent> history_agent;
    std::unique_ptr<AutomationAgent> automation_agent;
    SessionStatistics persisted_stats;
    mutable std::mutex state_mutex;
    mutable std::shared_mutex settings_mutex;
    BlocklistManager blocklist_manager;
    std::size_t blocklist_entries = 0;
    std::optional<std::chrono::system_clock::time_point> blocklist_last_update;
    bool alt_speed_active = false;
    std::unordered_map<int, TorrentLimitState> torrent_limits;
    std::unordered_map<int, int> torrent_priorities;
    std::unordered_map<int, std::uint64_t> torrent_revisions;
    std::uint64_t next_torrent_revision = 1;
    std::unordered_map<std::string, std::string> torrent_error_messages;
    std::atomic_bool shutdown_requested{false};
    bool save_resume_in_progress = false;
    std::unordered_set<std::string> pending_resume_hashes;
    std::chrono::steady_clock::time_point resume_deadline =
        std::chrono::steady_clock::now();
    std::chrono::steady_clock::time_point next_housekeeping =
        std::chrono::steady_clock::now();
    std::atomic_bool settings_dirty{false};
    std::chrono::steady_clock::time_point next_settings_persist =
        std::chrono::steady_clock::time_point::min();
    std::mutex settings_persist_mutex;
    std::string listen_error;
    AsyncTaskService task_service;
    bool replaying_saved_torrents = false;

    explicit Impl(CoreSettings settings) : settings(std::move(settings))
    {
        std::filesystem::create_directories(this->settings.download_path);
        metadata_dir = tt::utils::data_root() / "metadata";
        std::filesystem::create_directories(metadata_dir);
        if (this->settings.watch_dir_enabled &&
            !this->settings.watch_dir.empty())
        {
            std::filesystem::create_directories(this->settings.watch_dir);
        }
        task_service.start();

        state_path = this->settings.state_path;
        if (state_path.empty())
        {
            state_path = tt::utils::data_root() / "tinytorrent.db";
        }

        dht_state_path = state_path;
        dht_state_path.replace_extension(".dht");
        persistence = std::make_unique<PersistenceManager>(state_path);

        // Load stats (Torrents are loaded later, after TorrentManager is ready)
        if (persistence && persistence->is_valid())
        {
            load_persisted_stats_from_db();
        }
        else
        {
            TT_LOG_INFO("sqlite state database unavailable; falling back to "
                        "ephemeral state");
            persisted_stats.session_count = 1;
        }

        // Initialize Agents
        automation_agent = std::make_unique<AutomationAgent>(
            [this](std::function<void()> task)
            { task_service.submit(std::move(task)); },
            [this](std::function<void()> task)
            { enqueue_task(std::move(task)); },
            [this](TorrentAddRequest request)
            { return enqueue_torrent(std::move(request)); },
            [this](std::string const &hash, std::filesystem::path const &path)
            { queue_pending_move(hash, path); });
        automation_agent->configure(
            this->settings.watch_dir, this->settings.watch_dir_enabled,
            this->settings.download_path, this->settings.incomplete_dir,
            this->settings.incomplete_dir_enabled);

        // History
        HistoryConfig history_config;
        history_config.enabled = this->settings.history_enabled;
        history_config.interval_seconds =
            std::max(kMinHistoryIntervalSeconds,
                     this->settings.history_interval_seconds);
        this->settings.history_interval_seconds =
            history_config.interval_seconds;
        history_config.retention_days =
            std::max(0, this->settings.history_retention_days);
        this->settings.history_retention_days = history_config.retention_days;

        history_agent =
            std::make_unique<HistoryAgent>(state_path, history_config);
        history_agent->start();

        torrent_manager = std::make_unique<TorrentManager>();

        // Load and Start Torrents (Linear Startup)
        if (torrent_manager && persistence && persistence->is_valid())
        {
            auto torrents = persistence->load_torrents();
            std::vector<std::pair<std::string, int>> persisted_ids;

            for (auto const &entry : torrents)
            {
                if (entry.hash.empty())
                {
                    continue;
                }

                if (entry.rpc_id > 0)
                {
                    persisted_ids.emplace_back(entry.hash, entry.rpc_id);
                }

                auto request = build_add_request_from_persisted(entry);

                if (!request.metainfo.empty() || request.uri)
                {
                    // Use the existing enqueue path to add the torrent.
                    // This reuses Core's add path and keeps persistence
                    // centralized. It may update timestamps in DB but
                    // preserves correctness and avoids calling a missing
                    // TorrentManager API.
                    enqueue_torrent(std::move(request));
                }
            }

            if (!persisted_ids.empty())
            {
                torrent_manager->recover_rpc_mappings(persisted_ids);
            }
        }

        // Prepare Alerts
        TorrentManager::AlertCallbacks alert_callbacks;
        alert_callbacks.on_state_update =
            [this](std::vector<libtorrent::torrent_status> const &statuses)
        {
            for (auto const &status : statuses)
            {
                auto id = assign_rpc_id(status.info_hashes.get_best());
                mark_torrent_dirty(id);
            }
        };

        alert_callbacks.on_torrent_finished =
            [this](libtorrent::torrent_handle const &handle,
                   libtorrent::torrent_status const &status)
        {
            if (automation_agent)
            {
                automation_agent->process_completion(handle, status);
            }
            auto id = assign_rpc_id(status.info_hashes.get_best());
            mark_torrent_dirty(id);
        };

        alert_callbacks.metadata_file_path = [this](std::string const &hash)
        { return metadata_file_path(hash); };

        alert_callbacks.on_metadata_persisted =
            [this](std::string const &hash, std::filesystem::path const &path,
                   std::vector<std::uint8_t> const &metadata)
        {
            if (persistence)
            {
                persistence->update_metadata(hash, path.string(), metadata);
            }
        };

        alert_callbacks.on_resume_data =
            [this](std::string const &hash,
                   libtorrent::add_torrent_params const &params)
        {
            if (persistence)
            {
                auto buffer = libtorrent::write_resume_data_buf(params);
                std::vector<std::uint8_t> data(buffer.begin(), buffer.end());
                persistence->update_resume_data(hash, data);
            }
        };

        alert_callbacks.on_resume_hash_completed =
            [this](std::string const &hash)
        { mark_resume_hash_completed(hash); };

        alert_callbacks.extend_resume_deadline = [this]
        {
            resume_deadline =
                std::chrono::steady_clock::now() + kResumeAlertTimeout;
        };

        alert_callbacks.on_listen_succeeded = [this](auto &&a)
        { handle_listen_succeeded(a); };
        alert_callbacks.on_listen_failed = [this](auto &&a)
        { handle_listen_failed(a); };
        alert_callbacks.on_file_error = [this](auto &&a)
        { handle_file_error_alert(a); };
        alert_callbacks.on_tracker_error = [this](auto &&a)
        { handle_tracker_error_alert(a); };
        alert_callbacks.on_portmap_error = [this](auto &&a)
        { handle_portmap_error_alert(a); };
        alert_callbacks.on_storage_moved = [this](auto &&a)
        { handle_storage_moved_alert(a); };
        alert_callbacks.on_storage_moved_failed = [this](auto &&a)
        { handle_storage_moved_failed_alert(a); };
        alert_callbacks.on_fastresume_rejected = [this](auto &&a)
        { handle_fastresume_rejected(a); };

        // ----------------------------------------------------

        initialize_session_statistics();
        mark_state_dirty();

        auto dht_state = load_dht_state();

        auto pack = SettingsManager::build_settings_pack(this->settings);
        current_settings = pack;
        blocklist_manager.set_path(this->settings.blocklist_path);

        libtorrent::session_params params(pack);
        if (dht_state)
        {
            params.dht_state = std::move(*dht_state);
        }

        if (torrent_manager)
        {
            torrent_manager->start_session(std::move(params));
        }
        torrent_manager->set_alert_callbacks(std::move(alert_callbacks));
        refresh_active_speed_limits(true);
    }

    ~Impl()
    {
        // CRITICAL: Clear alert callbacks BEFORE destroying services
        // Alert callbacks capture 'this' and may call automation_agent,
        // persistence, etc. We must ensure callbacks are cleared before
        // those services are destroyed (which happens in reverse declaration
        // order).
        if (torrent_manager)
        {
            torrent_manager->set_alert_callbacks({});
        }

        task_service.stop();
        if (history_agent)
        {
            history_agent->stop();
        }

        // Explicitly reset services in controlled order to prevent
        // any potential use-after-free during destruction
        // Order: TorrentManager (has session) -> AutomationAgent ->
        // HistoryAgent -> Persistence
        torrent_manager.reset();
        automation_agent.reset();
        history_agent.reset();
        persistence.reset();
    }

    TorrentAddRequest
    build_add_request_from_persisted(tt::storage::PersistedTorrent const &entry)
    {
        TorrentAddRequest request;

        request.download_path = entry.save_path
                                    ? std::filesystem::u8path(*entry.save_path)
                                    : settings.download_path;

        request.paused = entry.paused;

        if (!entry.metainfo.empty())
        {
            request.metainfo = entry.metainfo;
        }
        else if (entry.magnet_uri)
        {
            request.uri = *entry.magnet_uri;
        }
        else if (!entry.metadata_path.empty())
        {
            auto path = std::filesystem::u8path(entry.metadata_path);
            std::ifstream input(path, std::ios::binary);
            if (input)
            {
                request.metainfo.assign(std::istreambuf_iterator<char>(input),
                                        std::istreambuf_iterator<char>());
            }
        }

        if (!entry.resume_data.empty())
        {
            request.resume_data = entry.resume_data;
        }

        return request;
    }

    void enqueue_task(std::function<void()> task)
    {
        if (torrent_manager)
        {
            torrent_manager->enqueue_task(std::move(task));
        }
    }

    void run()
    {
        try
        {
            while (running.load(std::memory_order_relaxed))
            {
                auto now = std::chrono::steady_clock::now();
                if (shutdown_requested.load(std::memory_order_relaxed) &&
                    !save_resume_in_progress)
                {
                    persist_resume_data();
                }
                refresh_active_speed_limits();
                if (torrent_manager)
                {
                    torrent_manager->process_tasks();
                    torrent_manager->process_alerts();
                }
                update_snapshot();
                perform_housekeeping();
                flush_settings_if_due(now);
                if (shutdown_requested.load(std::memory_order_relaxed))
                {
                    if (!save_resume_in_progress ||
                        pending_resume_hashes.empty() || now >= resume_deadline)
                    {
                        running.store(false, std::memory_order_relaxed);
                        continue;
                    }
                    auto start_ticks =
                        shutdown_start_ticks.load(std::memory_order_acquire);
                    if (start_ticks > 0)
                    {
                        auto start_time = std::chrono::steady_clock::time_point(
                            std::chrono::steady_clock::duration(start_ticks));
                        if (now - start_time >= kShutdownTimeout)
                        {
                            TT_LOG_INFO(
                                "shutdown timeout reached; forcing exit");
                            running.store(false, std::memory_order_relaxed);
                            continue;
                        }
                    }
                }
                if (torrent_manager)
                {
                    torrent_manager->wait_for_work(settings.idle_sleep_ms,
                                                   shutdown_requested);
                }
                else
                {
                    std::this_thread::sleep_for(
                        std::chrono::milliseconds(settings.idle_sleep_ms));
                }
            }
        }
        catch (std::exception const &ex)
        {
            TT_LOG_INFO("engine loop exception: {}", ex.what());
        }
        catch (...)
        {
            TT_LOG_INFO("engine loop exception");
        }
        auto now = std::chrono::steady_clock::now();
        if (history_agent)
        {
            history_agent->flush_if_due(now, true);
        }
        persist_dht_state();
        persist_state();
        flush_settings_now();
    }

    void stop() noexcept
    {
        auto now = std::chrono::steady_clock::now();
        auto ticks = now.time_since_epoch().count();
        auto expected = std::chrono::steady_clock::duration::rep(0);
        shutdown_start_ticks.compare_exchange_strong(expected, ticks,
                                                     std::memory_order_release,
                                                     std::memory_order_relaxed);
        shutdown_requested.store(true, std::memory_order_relaxed);
        if (torrent_manager)
        {
            torrent_manager->notify();
        }
    }

    Core::AddTorrentStatus enqueue_torrent(TorrentAddRequest request)
    {
        libtorrent::add_torrent_params params;
        libtorrent::error_code ec;

        if (!request.metainfo.empty())
        {
            libtorrent::span<char const> span(
                reinterpret_cast<char const *>(request.metainfo.data()),
                static_cast<int>(request.metainfo.size()));
            auto node = libtorrent::bdecode(span, ec);
            if (ec)
            {
                TT_LOG_INFO("failed to decode provided metainfo: {}",
                            ec.message());
                return Core::AddTorrentStatus::InvalidUri;
            }

            auto ti = std::make_shared<libtorrent::torrent_info>(node, ec);
            if (ec)
            {
                TT_LOG_INFO("failed to parse torrent metainfo: {}",
                            ec.message());
                return Core::AddTorrentStatus::InvalidUri;
            }
            params.ti = std::move(ti);
        }
        else if (request.uri)
        {
            libtorrent::parse_magnet_uri(*request.uri, params, ec);
            if (ec)
            {
                TT_LOG_INFO("failed to parse magnet link: {}", ec.message());
                return Core::AddTorrentStatus::InvalidUri;
            }
        }
        else
        {
            TT_LOG_INFO("torrent-add request missing uri/metainfo");
            return Core::AddTorrentStatus::InvalidUri;
        }

        auto save_path = request.download_path.empty() ? settings.download_path
                                                       : request.download_path;
        auto final_save_path = save_path;
        if (settings.incomplete_dir_enabled && !settings.incomplete_dir.empty())
        {
            params.save_path = settings.incomplete_dir.string();
        }
        else
        {
            params.save_path = final_save_path.string();
        }
        params.flags = libtorrent::torrent_flags::auto_managed;
        if (request.paused)
        {
            params.flags |= libtorrent::torrent_flags::paused;
        }

        std::string info;
        if (params.ti)
        {
            info = params.ti->name();
        }
        else if (request.uri)
        {
            info = *request.uri;
        }
        if (info.empty())
        {
            info = "<unnamed torrent>";
        }
        if (info.size() > 128)
        {
            info = info.substr(0, 128) + "...";
        }
        TT_LOG_INFO("enqueue_add_torrent name={} save_path={} paused={}", info,
                    params.save_path, static_cast<int>(request.paused));
        if (auto hash = info_hash_from_params(params); hash)
        {
            if (persistence)
            {
                tt::storage::PersistedTorrent entry;
                entry.hash = *hash;
                entry.save_path = to_utf8_string(request.download_path);
                entry.paused = request.paused;
                if (request.uri)
                    entry.magnet_uri = *request.uri;
                entry.metainfo = request.metainfo;
                entry.resume_data = request.resume_data;
                entry.added_at = static_cast<std::uint64_t>(
                    std::chrono::duration_cast<std::chrono::seconds>(
                        std::chrono::system_clock::now().time_since_epoch())
                        .count());
                persistence->add_or_update_torrent(std::move(entry));
            }
        }

        if (torrent_manager)
        {
            torrent_manager->async_add_torrent(std::move(params));
        }

        return Core::AddTorrentStatus::Ok;
    }

    std::shared_ptr<SessionSnapshot> snapshot_copy() const noexcept
    {
        return torrent_manager ? torrent_manager->snapshot_copy()
                               : std::make_shared<SessionSnapshot>();
    }

    template <typename Fn>
    auto run_task(Fn &&fn) -> std::future<std::invoke_result_t<Fn>>
    {
        if (!torrent_manager)
        {
            throw std::runtime_error("torrent manager unavailable");
        }
        return torrent_manager->run_task(std::forward<Fn>(fn));
    }

    std::optional<TorrentDetail> detail_for_id(int id)
    {
        if (auto handle = handle_for_id(id); handle)
        {
            auto status = handle->status();
            return collect_detail(id, *handle, status);
        }
        return std::nullopt;
    }

    void persist_state()
    {
        std::lock_guard<std::mutex> lock(state_mutex);
        persist_state_unlocked();
        state_dirty = false;
        last_state_flush = std::chrono::steady_clock::now();
    }

    void mark_state_dirty()
    {
        std::lock_guard<std::mutex> lock(state_mutex);
        mark_state_dirty_locked();
    }

    void mark_state_dirty_locked()
    {
        state_dirty = true;
    }

    void flush_state_if_due(std::chrono::steady_clock::time_point now)
    {
        std::lock_guard<std::mutex> lock(state_mutex);
        if (!state_dirty)
        {
            return;
        }
        if (now < last_state_flush + kStateFlushInterval)
        {
            return;
        }
        persist_state_unlocked();
        state_dirty = false;
        last_state_flush = now;
    }

    void persist_resume_data()
    {
        if (!torrent_manager)
        {
            return;
        }
        auto handles = torrent_manager->torrent_handles();
        pending_resume_hashes.clear();
        for (auto const &handle : handles)
        {
            if (!handle.is_valid())
            {
                continue;
            }
            auto status = handle.status();
            auto best = status.info_hashes.get_best();
            handle.save_resume_data();
            if (!hash_is_nonzero(best))
            {
                continue;
            }
            pending_resume_hashes.insert(info_hash_to_hex(best));
        }
        save_resume_in_progress = !pending_resume_hashes.empty();
        resume_deadline =
            std::chrono::steady_clock::now() + kResumeAlertTimeout;
    }

    void mark_resume_hash_completed(std::string const &hash)
    {
        if (!hash.empty())
        {
            pending_resume_hashes.erase(hash);
        }
        resume_deadline =
            std::chrono::steady_clock::now() + kResumeAlertTimeout;
        save_resume_in_progress = !pending_resume_hashes.empty();
    }

    void persist_state_unlocked()
    {
        if (!persistence || !persistence->is_valid())
        {
            return;
        }
        persistence->persist_session_stats(persisted_stats);
    }

    void load_persisted_stats_from_db()
    {
        if (!persistence || !persistence->is_valid())
        {
            return;
        }
        persisted_stats = persistence->load_session_statistics();
    }

    std::optional<libtorrent::dht::dht_state> load_dht_state() const
    {
        if (dht_state_path.empty() || !std::filesystem::exists(dht_state_path))
        {
            return std::nullopt;
        }
        std::ifstream input(dht_state_path, std::ios::binary);
        if (!input)
        {
            return std::nullopt;
        }
        std::vector<char> buffer((std::istreambuf_iterator<char>(input)),
                                 std::istreambuf_iterator<char>());
        if (buffer.empty())
        {
            return std::nullopt;
        }
        try
        {
            auto params = libtorrent::read_session_params(
                libtorrent::span<char const>(buffer.data(), buffer.size()),
                libtorrent::session_handle::save_dht_state);
            return params.dht_state;
        }
        catch (...)
        {
            TT_LOG_INFO("failed to load DHT state from {}",
                        dht_state_path.string());
        }
        return std::nullopt;
    }

    void persist_dht_state()
    {
        if (!torrent_manager || dht_state_path.empty())
        {
            return;
        }
        auto buffer = torrent_manager->write_session_params(
            libtorrent::session_handle::save_dht_state);
        if (buffer.empty())
        {
            return;
        }
        std::error_code ec;
        auto parent = dht_state_path.parent_path();
        if (!parent.empty() && !std::filesystem::exists(parent, ec))
        {
            std::filesystem::create_directories(parent, ec);
        }
        if (ec)
        {
            TT_LOG_INFO("failed to ensure DHT state directory {}: {}",
                        parent.string(), ec.message());
            return;
        }
        std::ofstream output(dht_state_path, std::ios::binary);
        if (!output)
        {
            TT_LOG_INFO("failed to write DHT state to {}",
                        dht_state_path.string());
            return;
        }
        output.write(buffer.data(),
                     static_cast<std::streamsize>(buffer.size()));
        if (!output)
        {
            TT_LOG_INFO("failed to write DHT state to {}",
                        dht_state_path.string());
        }
    }

    std::string listen_error_impl() const
    {
        std::shared_lock<std::shared_mutex> guard(settings_mutex);
        return listen_error;
    }

    void set_listen_error(std::string value)
    {
        std::lock_guard<std::shared_mutex> guard(settings_mutex);
        listen_error = std::move(value);
    }

    void
    handle_listen_succeeded(libtorrent::listen_succeeded_alert const &alert)
    {
        if (alert.socket_type != libtorrent::socket_type_t::tcp)
        {
            return;
        }
        auto host = alert.address.to_string();
        tt::net::HostPort host_port{host, std::to_string(alert.port)};
        host_port.bracketed = tt::net::is_ipv6_literal(host);
        auto interface = tt::net::format_host_port(host_port);
        {
            std::lock_guard<std::shared_mutex> guard(settings_mutex);
            settings.listen_interface = interface;
            listen_error.clear();
        }
        mark_settings_dirty();
        TT_LOG_INFO("listen succeeded on {}", interface);
    }

    void handle_listen_failed(libtorrent::listen_failed_alert const &alert)
    {
        if (alert.socket_type != libtorrent::socket_type_t::tcp)
        {
            return;
        }
        auto host = alert.address.to_string();
        tt::net::HostPort host_port{host, std::to_string(alert.port)};
        host_port.bracketed = tt::net::is_ipv6_literal(host);
        auto endpoint = tt::net::format_host_port(host_port);
        auto message =
            std::format("listen failed on {}: {}", endpoint, alert.message());
        set_listen_error(message);
        TT_LOG_INFO("{}", message);
    }

    void handle_file_error_alert(libtorrent::file_error_alert const &alert)
    {
        if (auto hash = hash_from_handle(alert.handle); hash)
        {
            auto message = std::format("file error: {}", alert.message());
            record_torrent_error(*hash, message);
            TT_LOG_INFO("{}: {}", *hash, message);
        }
    }

    void
    handle_tracker_error_alert(libtorrent::tracker_error_alert const &alert)
    {
        if (auto hash = hash_from_handle(alert.handle); hash)
        {
            auto tracker = alert.tracker_url();
            auto label = tracker && *tracker ? tracker : "<unknown>";
            auto message =
                std::format("tracker {}: {}", label, alert.message());
            record_torrent_error(*hash, message);
            TT_LOG_INFO("{}: {}", *hash, message);
        }
    }

    void
    handle_portmap_error_alert(libtorrent::portmap_error_alert const &alert)
    {
        auto message = std::format("portmap failed: {}", alert.message());
        set_listen_error(message);
        TT_LOG_INFO("{}", message);
    }

    void
    handle_storage_moved_alert(libtorrent::storage_moved_alert const &alert)
    {
        if (auto hash = hash_from_handle(alert.handle); hash)
        {
            auto path = alert.storage_path();
            if (path == nullptr || *path == '\0')
            {
                return;
            }
            finalize_pending_move(*hash, std::filesystem::path(path));
            TT_LOG_INFO("{} storage moved to {}", *hash, path);
        }
    }

    void handle_storage_moved_failed_alert(
        libtorrent::storage_moved_failed_alert const &alert)
    {
        if (auto hash = hash_from_handle(alert.handle); hash)
        {
            auto message =
                std::format("storage move failed: {}", alert.message());
            record_torrent_error(*hash, message);
            cancel_pending_move(*hash);
            TT_LOG_INFO("{}: {}", *hash, message);
        }
    }

    void handle_fastresume_rejected(
        libtorrent::fastresume_rejected_alert const &alert)
    {
        if (auto hash = hash_from_handle(alert.handle); hash)
        {
            TT_LOG_INFO("{}: fastresume rejected: {}", *hash, alert.message());
        }
        else
        {
            TT_LOG_INFO("fastresume rejected: {}", alert.message());
        }
    }

    void
    update_persisted_resume_data(std::string const &hash,
                                 libtorrent::add_torrent_params const &params)
    {
        if (hash.empty() || !persistence || !persistence->is_valid())
        {
            return;
        }
        auto buffer = libtorrent::write_resume_data_buf(params);
        if (buffer.empty())
        {
            return;
        }
        std::vector<std::uint8_t> data(buffer.begin(), buffer.end());
        persistence->update_resume_data(hash, data);
    }

    void persist_settings_to_db()
    {
        if (!persistence || !persistence->is_valid())
        {
            return;
        }
        CoreSettings snapshot;
        {
            std::shared_lock<std::shared_mutex> lock(settings_mutex);
            snapshot = settings;
        }
        if (!persistence->persist_settings(snapshot))
        {
            TT_LOG_INFO("failed to persist session settings");
        }
    }

    void mark_settings_dirty()
    {
        auto now = std::chrono::steady_clock::now();
        std::lock_guard<std::mutex> guard(settings_persist_mutex);
        settings_dirty.store(true, std::memory_order_release);
        next_settings_persist = now + kSettingsPersistInterval;
    }

    void flush_settings_if_due(std::chrono::steady_clock::time_point now)
    {
        bool should_flush = false;
        {
            std::lock_guard<std::mutex> guard(settings_persist_mutex);
            if (!settings_dirty.load(std::memory_order_acquire))
            {
                return;
            }
            if (now < next_settings_persist)
            {
                return;
            }
            settings_dirty.store(false, std::memory_order_release);
            next_settings_persist =
                std::chrono::steady_clock::time_point::min();
            should_flush = true;
        }
        if (should_flush)
        {
            persist_settings_to_db();
        }
    }

    void flush_settings_now()
    {
        bool should_flush = false;
        {
            std::lock_guard<std::mutex> guard(settings_persist_mutex);
            if (!settings_dirty.load(std::memory_order_acquire))
            {
                return;
            }
            settings_dirty.store(false, std::memory_order_release);
            next_settings_persist =
                std::chrono::steady_clock::time_point::min();
            should_flush = true;
        }
        if (should_flush)
        {
            persist_settings_to_db();
        }
    }

    void record_torrent_error(std::string const &hash, std::string message)
    {
        if (hash.empty())
        {
            return;
        }
        int dirty_id = 0;
        {
            std::lock_guard<std::mutex> guard(state_mutex);
            if (message.empty())
            {
                torrent_error_messages.erase(hash);
            }
            else
            {
                torrent_error_messages[hash] = std::move(message);
            }
        }
        if (torrent_manager)
        {
            if (auto sha1 = sha1_from_hex(hash); sha1)
            {
                if (auto id = torrent_manager->id_for_hash(*sha1))
                {
                    dirty_id = *id;
                }
            }
        }
        if (dirty_id > 0)
        {
            mark_torrent_dirty(dirty_id);
        }
    }

    std::string torrent_error_string(std::string const &hash) const
    {
        if (hash.empty())
        {
            return {};
        }
        std::lock_guard<std::mutex> guard(state_mutex);
        if (auto it = torrent_error_messages.find(hash);
            it != torrent_error_messages.end())
        {
            return it->second;
        }
        return {};
    }

    void queue_pending_move(std::string const &hash,
                            std::filesystem::path destination)
    {
        if (!torrent_manager)
        {
            return;
        }
        torrent_manager->queue_pending_move(hash, destination);
    }

    void cancel_pending_move(std::string const &hash)
    {
        if (!torrent_manager)
        {
            return;
        }
        torrent_manager->cancel_pending_move(hash);
    }

    void finalize_pending_move(std::string const &hash,
                               std::filesystem::path destination)
    {
        if (hash.empty() || destination.empty())
            return;
        cancel_pending_move(hash);
        if (persistence)
            persistence->update_save_path(hash, to_utf8_string(destination));
    }

    std::vector<HistoryBucket>
    history_query(std::int64_t start, std::int64_t end, std::int64_t step)
    {
        if (!history_agent)
        {
            return {};
        }
        return history_agent->query(start, end, step);
    }

    bool history_clear(std::optional<std::int64_t> older_than)
    {
        if (!history_agent)
        {
            return false;
        }
        return history_agent->clear(older_than);
    }

    HistoryConfig history_config_impl() const
    {
        if (!history_agent)
        {
            return {};
        }
        return history_agent->config();
    }

    CoreSettings settings_copy() const
    {
        std::shared_lock<std::shared_mutex> lock(settings_mutex);
        return settings;
    }

    void initialize_session_statistics()
    {
        session_start_time = std::chrono::steady_clock::now();
        stats_last_update = session_start_time;
        auto totals = torrent_manager->capture_session_totals();
        session_start_uploaded = totals.uploaded;
        session_start_downloaded = totals.downloaded;
        last_total_uploaded = totals.uploaded;
        last_total_downloaded = totals.downloaded;
    }

    void
    accumulate_session_stats_locked(SessionTotals const &totals,
                                    std::chrono::steady_clock::time_point now)
    {
        if (now < stats_last_update)
        {
            stats_last_update = now;
        }
        auto elapsed = now - stats_last_update;
        if (elapsed.count() > 0)
        {
            auto seconds = static_cast<std::uint64_t>(
                std::chrono::duration_cast<std::chrono::seconds>(elapsed)
                    .count());
            if (seconds > 0)
            {
                persisted_stats.seconds_active += seconds;
                mark_state_dirty_locked();
            }
        }
        std::uint64_t uploaded_delta =
            totals.uploaded >= last_total_uploaded
                ? totals.uploaded - last_total_uploaded
                : totals.uploaded;
        if (uploaded_delta > 0)
        {
            persisted_stats.uploaded_bytes += uploaded_delta;
            mark_state_dirty_locked();
        }
        std::uint64_t downloaded_delta =
            totals.downloaded >= last_total_downloaded
                ? totals.downloaded - last_total_downloaded
                : totals.downloaded;
        if (downloaded_delta > 0)
        {
            persisted_stats.downloaded_bytes += downloaded_delta;
            mark_state_dirty_locked();
        }
        last_total_uploaded = totals.uploaded;
        last_total_downloaded = totals.downloaded;
        stats_last_update = now;
    }

    void perform_housekeeping()
    {
        auto now = std::chrono::steady_clock::now();
        if (now < next_housekeeping)
        {
            return;
        }
        next_housekeeping = now + kHousekeepingInterval;
        if (automation_agent)
        {
            automation_agent->scan();
        }
        flush_state_if_due(now);
        if (history_agent)
        {
            history_agent->perform_retention(now);
        }
    }

    std::filesystem::path metadata_file_path(std::string const &hash) const
    {
        if (hash.empty() || metadata_dir.empty())
        {
            return {};
        }
        return metadata_dir / (hash + ".torrent");
    }

    void update_snapshot()
    {
        if (!torrent_manager)
        {
            return;
        }
        auto totals = torrent_manager->capture_session_totals();
        auto now = std::chrono::steady_clock::now();
        std::uint64_t downloaded_delta =
            totals.downloaded >= last_total_downloaded
                ? totals.downloaded - last_total_downloaded
                : totals.downloaded;
        std::uint64_t uploaded_delta =
            totals.uploaded >= last_total_uploaded
                ? totals.uploaded - last_total_uploaded
                : totals.uploaded;
        if (history_agent)
        {
            history_agent->record(now, downloaded_delta, uploaded_delta);
        }
        SessionStatistics cumulative_stats{};
        {
            std::lock_guard<std::mutex> lock(state_mutex);
            accumulate_session_stats_locked(totals, now);
            cumulative_stats = persisted_stats;
        }
        std::uint64_t elapsed_seconds = 0;
        if (now >= session_start_time)
        {
            elapsed_seconds = static_cast<std::uint64_t>(
                std::chrono::duration_cast<std::chrono::seconds>(
                    now - session_start_time)
                    .count());
        }
        SessionStatistics current_stats{};
        current_stats.uploaded_bytes =
            totals.uploaded >= session_start_uploaded
                ? totals.uploaded - session_start_uploaded
                : totals.uploaded;
        current_stats.downloaded_bytes =
            totals.downloaded >= session_start_downloaded
                ? totals.downloaded - session_start_downloaded
                : totals.downloaded;
        current_stats.seconds_active = elapsed_seconds;
        current_stats.session_count = 1;

        TorrentManager::SnapshotBuildCallbacks callbacks;

        // 1. Visit Callback
        callbacks.on_torrent_visit =
            [this](int id, libtorrent::torrent_handle const &handle,
                   libtorrent::torrent_status const &status)
        {
            enforce_torrent_seed_limits(id, handle, status);
            // Note: move_completed_from_incomplete logic is now in
            // AutomationAgent via alerts
        };

        // 2. Build Entry Callback
        callbacks.build_snapshot_entry =
            [this](int id, libtorrent::torrent_status const &status,
                   std::uint64_t revision)
        { return build_snapshot(id, status, revision); };

        // 3. Labels Callback (UPDATED)
        callbacks.labels_for_torrent =
            [this](int /*id*/, std::string const &hash)
        {
            if (persistence)
            {
                return persistence->get_labels(hash);
            }
            return std::vector<std::string>{};
        };

        // 4. Priority Callback
        callbacks.priority_for_torrent = [this](int id)
        {
            if (auto it = torrent_priorities.find(id);
                it != torrent_priorities.end())
            {
                return it->second;
            }
            return 0;
        };

        // 5. Revision Callback
        callbacks.ensure_revision = [this](int id)
        { return ensure_torrent_revision(id); };

        auto result = torrent_manager->build_snapshot(callbacks);
        auto new_snapshot = result.snapshot;
        if (!new_snapshot)
        {
            return;
        }
        new_snapshot->cumulative_stats = cumulative_stats;
        new_snapshot->current_stats = current_stats;

        auto seen_ids = std::move(result.seen_ids);
        if (torrent_manager)
        {
            auto removed_ids = torrent_manager->purge_missing_ids(seen_ids);
            for (auto removed_id : removed_ids)
            {
                torrent_revisions.erase(removed_id);
            }
        }

        for (auto it = torrent_limits.begin(); it != torrent_limits.end();)
        {
            if (!seen_ids.contains(it->first))
            {
                it = torrent_limits.erase(it);
            }
            else
            {
                ++it;
            }
        }
        for (auto it = torrent_priorities.begin();
             it != torrent_priorities.end();)
        {
            if (!seen_ids.contains(it->first))
            {
                it = torrent_priorities.erase(it);
            }
            else
            {
                ++it;
            }
        }

        TT_LOG_DEBUG(
            "Snapshot updated: {} torrents ({} active, {} paused) down={} "
            "up={}",
            new_snapshot->torrent_count, new_snapshot->active_torrent_count,
            new_snapshot->paused_torrent_count,
            static_cast<unsigned long long>(new_snapshot->download_rate),
            static_cast<unsigned long long>(new_snapshot->upload_rate));
    }
    int assign_rpc_id(libtorrent::sha1_hash const &hash)
    {
        if (!torrent_manager)
            return 0;
        int id = torrent_manager->assign_rpc_id(hash);
        if (persistence)
            persistence->update_rpc_id(info_hash_to_hex(hash), id);
        return id;
    }

    void mark_torrent_dirty(int id)
    {
        if (id <= 0)
        {
            return;
        }
        torrent_revisions[id] = next_torrent_revision++;
    }

    std::uint64_t ensure_torrent_revision(int id)
    {
        if (id <= 0)
        {
            return 0;
        }
        auto it = torrent_revisions.find(id);
        if (it == torrent_revisions.end())
        {
            auto [new_it, inserted] =
                torrent_revisions.emplace(id, next_torrent_revision++);
            return new_it->second;
        }
        return it->second;
    }

    std::optional<libtorrent::torrent_handle> handle_for_id(int id)
    {
        if (!torrent_manager)
        {
            return std::nullopt;
        }
        return torrent_manager->handle_for_id(id);
    }

    std::vector<libtorrent::torrent_handle>
    resolve_handles(std::vector<int> const &ids)
    {
        std::vector<libtorrent::torrent_handle> result;
        for (int id : ids)
        {
            if (auto handle = handle_for_id(id); handle)
            {
                result.push_back(*handle);
            }
        }
        return result;
    }

    void update_download_path(std::filesystem::path path)
    {
        if (path.empty())
        {
            return;
        }
        std::filesystem::create_directories(path);
        std::filesystem::path download_path_copy;
        {
            std::lock_guard<std::mutex> state_lock(state_mutex);
            std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
            settings.download_path = std::move(path);
            download_path_copy = settings.download_path;
        }
        mark_settings_dirty();
        if (automation_agent)
        {
            automation_agent->set_download_path(std::move(download_path_copy));
        }
    }

    bool update_listen_port(std::uint16_t port)
    {
        if (!torrent_manager)
        {
            return false;
        }
        auto host = std::string{"0.0.0.0"};
        auto colon = settings.listen_interface.find_last_of(':');
        if (colon != std::string::npos)
        {
            host = settings.listen_interface.substr(0, colon);
            if (host.empty())
            {
                host = "0.0.0.0";
            }
        }
        else if (!settings.listen_interface.empty())
        {
            host = settings.listen_interface;
        }
        std::string recorded_interface;
        {
            std::lock_guard<std::mutex> state_lock(state_mutex);
            std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
            settings.listen_interface = host + ":" + std::to_string(port);
            recorded_interface = settings.listen_interface;
        }
        TT_LOG_INFO("recorded listen interface {} for peer-port {}",
                    recorded_interface, static_cast<unsigned>(port));
        mark_settings_dirty();
        return true;
    }

    void apply_speed_limits(std::optional<int> download_kbps,
                            std::optional<bool> download_enabled,
                            std::optional<int> upload_kbps,
                            std::optional<bool> upload_enabled)
    {
        CoreSettings snapshot_settings;
        {
            std::shared_lock<std::shared_mutex> shared_lock(settings_mutex);
            snapshot_settings = settings;
        }
        auto download_enabled_flag = download_enabled.value_or(
            snapshot_settings.download_rate_limit_enabled);
        auto upload_enabled_flag = upload_enabled.value_or(
            snapshot_settings.upload_rate_limit_enabled);
        auto download_value =
            download_kbps.value_or(snapshot_settings.download_rate_limit_kbps);
        auto upload_value =
            upload_kbps.value_or(snapshot_settings.upload_rate_limit_kbps);

        {
            std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
            settings.download_rate_limit_enabled = download_enabled_flag;
            settings.upload_rate_limit_enabled = upload_enabled_flag;
            settings.download_rate_limit_kbps = download_value;
            settings.upload_rate_limit_kbps = upload_value;
        }

        refresh_active_speed_limits(true);
        mark_settings_dirty();
    }

    void refresh_active_speed_limits(bool force = false)
    {
        if (!torrent_manager)
        {
            return;
        }
        CoreSettings snapshot = settings_copy();
        bool active = should_use_alt_speed(snapshot);
        if (!force && active == alt_speed_active)
        {
            return;
        }
        alt_speed_active = active;
        int download_value = active ? snapshot.alt_download_rate_limit_kbps
                                    : snapshot.download_rate_limit_kbps;
        bool download_enabled =
            active ? true : snapshot.download_rate_limit_enabled;
        int upload_value = active ? snapshot.alt_upload_rate_limit_kbps
                                  : snapshot.upload_rate_limit_kbps;
        bool upload_enabled =
            active ? true : snapshot.upload_rate_limit_enabled;
        apply_rate_limits(download_value, download_enabled, upload_value,
                          upload_enabled);
    }

    void apply_rate_limits(int download_kbps, bool download_enabled,
                           int upload_kbps, bool upload_enabled)
    {
        libtorrent::settings_pack pack;
        int download_bytes = kbps_to_bytes(download_kbps, download_enabled);
        int upload_bytes = kbps_to_bytes(upload_kbps, upload_enabled);
        pack.set_int(libtorrent::settings_pack::download_rate_limit,
                     download_bytes);
        pack.set_int(libtorrent::settings_pack::upload_rate_limit,
                     upload_bytes);
        current_settings.set_int(libtorrent::settings_pack::download_rate_limit,
                                 download_bytes);
        current_settings.set_int(libtorrent::settings_pack::upload_rate_limit,
                                 upload_bytes);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_peer_limits(std::optional<int> global_limit,
                           std::optional<int> per_torrent_limit)
    {
        int updated_global = -1;
        int updated_per_torrent = -1;
        bool updated = false;
        {
            std::lock_guard<std::shared_mutex> lock(settings_mutex);
            if (global_limit)
            {
                int limit = std::max(0, *global_limit);
                settings.peer_limit = limit;
                updated_global = limit;
                updated = true;
            }
            if (per_torrent_limit)
            {
                int limit = std::max(0, *per_torrent_limit);
                settings.peer_limit_per_torrent = limit;
                updated_per_torrent = limit;
                updated = true;
            }
        }
        if (!updated)
        {
            return;
        }
        libtorrent::settings_pack pack;
        if (updated_global >= 0)
        {
            pack.set_int(libtorrent::settings_pack::connections_limit,
                         updated_global);
            current_settings.set_int(
                libtorrent::settings_pack::connections_limit, updated_global);
        }
        if (updated_per_torrent >= 0)
        {
            pack.set_int(libtorrent::settings_pack::unchoke_slots_limit,
                         updated_per_torrent);
            current_settings.set_int(
                libtorrent::settings_pack::unchoke_slots_limit,
                updated_per_torrent);
        }
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
        mark_settings_dirty();
    }

    void apply_session_update(SessionUpdate update)
    {
        bool persist = false;
        bool encryption_changed = false;
        bool network_changed = false;
        bool queue_changed = false;
        bool alt_changed = false;
        bool proxy_changed = false;
        bool pex_changed = false;
        bool flush_history_after = false;
        bool configure_history_after = false;
        std::filesystem::path watch_dir_value;
        bool watch_dir_enabled_value = false;
        std::filesystem::path download_path_value;

        {
            std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
            if (update.alt_speed_down_kbps)
            {
                settings.alt_download_rate_limit_kbps =
                    *update.alt_speed_down_kbps;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_up_kbps)
            {
                settings.alt_upload_rate_limit_kbps = *update.alt_speed_up_kbps;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_enabled)
            {
                settings.alt_speed_enabled = *update.alt_speed_enabled;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_time_enabled)
            {
                settings.alt_speed_time_enabled =
                    *update.alt_speed_time_enabled;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_time_begin)
            {
                settings.alt_speed_time_begin = *update.alt_speed_time_begin;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_time_end)
            {
                settings.alt_speed_time_end = *update.alt_speed_time_end;
                alt_changed = true;
                persist = true;
            }
            if (update.alt_speed_time_day)
            {
                settings.alt_speed_time_day = *update.alt_speed_time_day;
                alt_changed = true;
                persist = true;
            }
            if (update.encryption)
            {
                settings.encryption = *update.encryption;
                encryption_changed = true;
                persist = true;
            }
            if (update.dht_enabled)
            {
                settings.dht_enabled = *update.dht_enabled;
                network_changed = true;
                persist = true;
            }
            if (update.lpd_enabled)
            {
                settings.lpd_enabled = *update.lpd_enabled;
                network_changed = true;
                persist = true;
            }
            if (update.utp_enabled)
            {
                settings.utp_enabled = *update.utp_enabled;
                network_changed = true;
                persist = true;
            }
            if (update.pex_enabled)
            {
                settings.pex_enabled = *update.pex_enabled;
                pex_changed = true;
                persist = true;
            }
            if (update.download_queue_size)
            {
                settings.download_queue_size = *update.download_queue_size;
                queue_changed = true;
                persist = true;
            }
            if (update.seed_queue_size)
            {
                settings.seed_queue_size = *update.seed_queue_size;
                queue_changed = true;
                persist = true;
            }
            if (update.queue_stalled_enabled)
            {
                settings.queue_stalled_enabled = *update.queue_stalled_enabled;
                queue_changed = true;
                persist = true;
            }
            if (update.incomplete_dir)
            {
                settings.incomplete_dir = *update.incomplete_dir;
                persist = true;
            }
            if (update.incomplete_dir_enabled)
            {
                settings.incomplete_dir_enabled =
                    *update.incomplete_dir_enabled;
                persist = true;
            }
            if (update.watch_dir)
            {
                settings.watch_dir = *update.watch_dir;
                persist = true;
                if (settings.watch_dir_enabled && !settings.watch_dir.empty())
                {
                    std::filesystem::create_directories(settings.watch_dir);
                }
            }
            if (update.watch_dir_enabled)
            {
                settings.watch_dir_enabled = *update.watch_dir_enabled;
                persist = true;
                if (settings.watch_dir_enabled && !settings.watch_dir.empty())
                {
                    std::filesystem::create_directories(settings.watch_dir);
                }
            }
            if (update.seed_ratio_limit)
            {
                settings.seed_ratio_limit = *update.seed_ratio_limit;
                persist = true;
            }
            if (update.seed_ratio_enabled)
            {
                settings.seed_ratio_enabled = *update.seed_ratio_enabled;
                persist = true;
            }
            if (update.seed_idle_limit)
            {
                settings.seed_idle_limit_minutes = *update.seed_idle_limit;
                persist = true;
            }
            if (update.seed_idle_enabled)
            {
                settings.seed_idle_enabled = *update.seed_idle_enabled;
                persist = true;
            }
            if (update.proxy_type)
            {
                settings.proxy_type = *update.proxy_type;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_hostname)
            {
                settings.proxy_hostname = *update.proxy_hostname;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_port)
            {
                settings.proxy_port = *update.proxy_port;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_auth_enabled)
            {
                settings.proxy_auth_enabled = *update.proxy_auth_enabled;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_username)
            {
                settings.proxy_username = *update.proxy_username;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_password)
            {
                settings.proxy_password = *update.proxy_password;
                proxy_changed = true;
                persist = true;
            }
            if (update.proxy_peer_connections)
            {
                settings.proxy_peer_connections =
                    *update.proxy_peer_connections;
                proxy_changed = true;
                persist = true;
            }
            if (update.history_enabled)
            {
                bool new_value = *update.history_enabled;
                if (settings.history_enabled != new_value)
                {
                    flush_history_after = !new_value;
                    configure_history_after =
                        new_value && settings.history_interval_seconds > 0;
                    settings.history_enabled = new_value;
                    persist = true;
                }
            }
            if (update.history_interval_seconds)
            {
                int interval = std::max(kMinHistoryIntervalSeconds,
                                        *update.history_interval_seconds);
                if (settings.history_interval_seconds != interval)
                {
                    flush_history_after = true;
                    configure_history_after = true;
                    settings.history_interval_seconds = interval;
                    persist = true;
                }
            }
            if (update.history_retention_days)
            {
                int retention = std::max(0, *update.history_retention_days);
                if (settings.history_retention_days != retention)
                {
                    settings.history_retention_days = retention;
                    persist = true;
                }
            }
            watch_dir_value = settings.watch_dir;
            watch_dir_enabled_value = settings.watch_dir_enabled;
            download_path_value = settings.download_path;
        }

        if (history_agent)
        {
            HistoryConfig history_config;
            history_config.enabled = settings.history_enabled;
            history_config.interval_seconds = std::max(
                kMinHistoryIntervalSeconds, settings.history_interval_seconds);
            history_config.retention_days = settings.history_retention_days;
            history_agent->update_config(history_config, flush_history_after,
                                         configure_history_after);
        }
        if (automation_agent)
        {
            automation_agent->configure(
                std::move(watch_dir_value), watch_dir_enabled_value,
                std::move(download_path_value), settings.incomplete_dir,
                settings.incomplete_dir_enabled);
        }
        if (encryption_changed)
        {
            apply_encryption_settings();
        }
        if (network_changed)
        {
            apply_network_settings();
        }
        if (queue_changed)
        {
            apply_queue_settings();
        }
        if (alt_changed)
        {
            refresh_active_speed_limits(true);
        }
        if (proxy_changed)
        {
            apply_proxy_settings();
        }
        if (pex_changed)
        {
            apply_pex_flags();
        }
        if (persist)
        {
            mark_settings_dirty();
        }
    }

    void apply_encryption_settings()
    {
        libtorrent::settings_pack pack;
        CoreSettings snapshot = settings_copy();
        configure_encryption(pack, snapshot.encryption);
        configure_encryption(current_settings, snapshot.encryption);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_network_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        pack.set_bool(libtorrent::settings_pack::enable_dht,
                      snapshot.dht_enabled);
        pack.set_bool(libtorrent::settings_pack::enable_lsd,
                      snapshot.lpd_enabled);
        pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                      snapshot.utp_enabled);
        pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                      snapshot.utp_enabled);
        current_settings.set_bool(libtorrent::settings_pack::enable_dht,
                                  snapshot.dht_enabled);
        current_settings.set_bool(libtorrent::settings_pack::enable_lsd,
                                  snapshot.lpd_enabled);
        current_settings.set_bool(
            libtorrent::settings_pack::enable_incoming_utp,
            snapshot.utp_enabled);
        current_settings.set_bool(
            libtorrent::settings_pack::enable_outgoing_utp,
            snapshot.utp_enabled);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
        apply_pex_flags();
    }

    void apply_proxy_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        pack.set_int(libtorrent::settings_pack::proxy_type,
                     snapshot.proxy_type);
        pack.set_str(libtorrent::settings_pack::proxy_hostname,
                     snapshot.proxy_hostname);
        pack.set_int(libtorrent::settings_pack::proxy_port,
                     snapshot.proxy_port);
        pack.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                      snapshot.proxy_peer_connections);
        pack.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                      snapshot.proxy_peer_connections);
        pack.set_bool(libtorrent::settings_pack::proxy_hostnames,
                      !snapshot.proxy_hostname.empty());
        pack.set_str(libtorrent::settings_pack::proxy_username,
                     snapshot.proxy_auth_enabled ? snapshot.proxy_username
                                                 : "");
        pack.set_str(libtorrent::settings_pack::proxy_password,
                     snapshot.proxy_auth_enabled ? snapshot.proxy_password
                                                 : "");

        current_settings.set_int(libtorrent::settings_pack::proxy_type,
                                 snapshot.proxy_type);
        current_settings.set_str(libtorrent::settings_pack::proxy_hostname,
                                 snapshot.proxy_hostname);
        current_settings.set_int(libtorrent::settings_pack::proxy_port,
                                 snapshot.proxy_port);
        current_settings.set_bool(
            libtorrent::settings_pack::proxy_peer_connections,
            snapshot.proxy_peer_connections);
        current_settings.set_bool(
            libtorrent::settings_pack::proxy_tracker_connections,
            snapshot.proxy_peer_connections);
        current_settings.set_bool(libtorrent::settings_pack::proxy_hostnames,
                                  !snapshot.proxy_hostname.empty());
        current_settings.set_str(
            libtorrent::settings_pack::proxy_username,
            snapshot.proxy_auth_enabled ? snapshot.proxy_username : "");
        current_settings.set_str(
            libtorrent::settings_pack::proxy_password,
            snapshot.proxy_auth_enabled ? snapshot.proxy_password : "");

        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_queue_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        pack.set_int(libtorrent::settings_pack::active_downloads,
                     snapshot.download_queue_size);
        current_settings.set_int(libtorrent::settings_pack::active_downloads,
                                 snapshot.download_queue_size);
        pack.set_int(libtorrent::settings_pack::active_seeds,
                     snapshot.seed_queue_size);
        current_settings.set_int(libtorrent::settings_pack::active_seeds,
                                 snapshot.seed_queue_size);
        pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                      snapshot.queue_stalled_enabled);
        current_settings.set_bool(
            libtorrent::settings_pack::dont_count_slow_torrents,
            snapshot.queue_stalled_enabled);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_pex_flags()
    {
        if (!torrent_manager)
        {
            return;
        }
        torrent_manager->set_pex_enabled(settings.pex_enabled);
    }

    void add_torrent_trackers(std::vector<int> const &ids,
                              std::vector<TrackerEntry> const &entries)
    {
        if (entries.empty())
        {
            return;
        }
        auto handles = resolve_handles(ids);
        for (auto &handle : handles)
        {
            if (!handle.is_valid())
            {
                continue;
            }
            for (auto const &entry : entries)
            {
                libtorrent::announce_entry announce(entry.announce);
                announce.tier = entry.tier;
                handle.add_tracker(announce);
            }
            handle.force_reannounce();
        }
    }

    void remove_torrent_trackers(std::vector<int> const &ids,
                                 std::vector<std::string> const &announces)
    {
        if (announces.empty())
        {
            return;
        }
        std::unordered_set<std::string> to_remove;
        for (auto const &value : announces)
        {
            to_remove.insert(value);
        }
        auto handles = resolve_handles(ids);
        for (auto &handle : handles)
        {
            if (!handle.is_valid())
            {
                continue;
            }
            auto current = handle.trackers();
            std::vector<libtorrent::announce_entry> filtered;
            filtered.reserve(current.size());
            for (auto const &entry : current)
            {
                if (to_remove.contains(entry.url))
                {
                    continue;
                }
                filtered.push_back(entry);
            }
            handle.replace_trackers(filtered);
            handle.force_reannounce();
        }
    }

    void replace_torrent_trackers(std::vector<int> const &ids,
                                  std::vector<TrackerEntry> const &entries)
    {
        auto handles = resolve_handles(ids);
        std::vector<libtorrent::announce_entry> new_list;
        new_list.reserve(entries.size());
        for (auto const &entry : entries)
        {
            libtorrent::announce_entry announce(entry.announce);
            announce.tier = entry.tier;
            new_list.push_back(announce);
        }
        for (auto &handle : handles)
        {
            if (!handle.is_valid())
            {
                continue;
            }
            handle.replace_trackers(new_list);
            handle.force_reannounce();
        }
    }

    void set_torrent_bandwidth_limits(std::vector<int> const &ids,
                                      std::optional<int> download_limit_kbps,
                                      std::optional<bool> download_limited,
                                      std::optional<int> upload_limit_kbps,
                                      std::optional<bool> upload_limited)
    {
        if (!torrent_manager)
        {
            return;
        }
        torrent_manager->set_torrent_bandwidth_limits(
            ids, download_limit_kbps, download_limited, upload_limit_kbps,
            upload_limited);
    }

    void set_torrent_bandwidth_priority(std::vector<int> const &ids,
                                        int priority)
    {
        priority = std::clamp(priority, 0, 255);
        for (int id : ids)
        {
            torrent_priorities[id] = priority;
            mark_torrent_dirty(id);
        }
    }

    void set_torrent_labels(std::vector<int> const &ids,
                            std::vector<std::string> const &labels)
    {
        if (!persistence)
        {
            return;
        }

        std::string serialized =
            labels.empty() ? std::string{}
                           : tt::storage::serialize_label_list(labels);

        for (int id : ids)
        {
            if (auto handle = handle_for_id(id); handle)
            {
                auto hash = info_hash_to_hex(handle->status().info_hashes);
                if (!hash.empty())
                {
                    persistence->update_labels(hash, serialized);
                    mark_torrent_dirty(id);
                }
            }
        }
    }
    void set_torrent_seed_limits(std::vector<int> const &ids,
                                 TorrentSeedLimit const &limits)
    {
        auto now = libtorrent::clock_type::now();
        for (int id : ids)
        {
            auto &state = torrent_limits[id];
            if (limits.ratio_limit)
            {
                state.ratio_limit = limits.ratio_limit;
            }
            if (limits.ratio_enabled)
            {
                state.ratio_enabled = *limits.ratio_enabled;
                if (!state.ratio_enabled)
                {
                    state.ratio_triggered = false;
                }
            }
            if (limits.ratio_mode)
            {
                state.ratio_mode = limits.ratio_mode;
            }
            if (limits.idle_limit)
            {
                state.idle_limit = limits.idle_limit;
            }
            if (limits.idle_enabled)
            {
                state.idle_enabled = *limits.idle_enabled;
                if (!state.idle_enabled)
                {
                    state.idle_triggered = false;
                }
            }
            if (limits.idle_mode)
            {
                state.idle_mode = limits.idle_mode;
            }
            state.last_activity = now;
        }
    }

    void enforce_torrent_seed_limits(int id,
                                     libtorrent::torrent_handle const &handle,
                                     libtorrent::torrent_status const &status)
    {
        auto it = torrent_limits.find(id);
        if (it == torrent_limits.end())
        {
            return;
        }
        auto &state = it->second;
        auto now = libtorrent::clock_type::now();
        bool active =
            status.upload_payload_rate > 0 || status.download_payload_rate > 0;
        bool idle_enabled = state.idle_enabled;
        int idle_limit = state.idle_limit.value_or(0);
        if (!idle_enabled && settings.seed_idle_enabled &&
            settings.seed_idle_limit_minutes > 0)
        {
            idle_enabled = true;
            idle_limit = settings.seed_idle_limit_minutes * 60;
        }
        if (active)
        {
            state.last_activity = now;
            state.idle_triggered = false;
        }
        else if (idle_enabled && idle_limit > 0 && !state.idle_triggered)
        {
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                now - state.last_activity);
            if (elapsed.count() >= idle_limit)
            {
                handle.pause();
                state.idle_triggered = true;
            }
        }
        bool ratio_enabled = state.ratio_enabled;
        double ratio_limit = state.ratio_limit.value_or(0.0);
        if (!ratio_enabled && settings.seed_ratio_enabled &&
            settings.seed_ratio_limit > 0.0)
        {
            ratio_enabled = true;
            ratio_limit = settings.seed_ratio_limit;
        }
        if (ratio_enabled && ratio_limit > 0.0 && !state.ratio_triggered &&
            status.is_seeding)
        {
            double ratio = status.total_download > 0
                               ? static_cast<double>(status.total_upload) /
                                     status.total_download
                               : 0.0;
            if (ratio >= ratio_limit)
            {
                handle.pause();
                state.ratio_triggered = true;
            }
        }
    }

    bool rename_path(int id, std::string const &current,
                     std::string const &replacement)
    {
        if (!torrent_manager)
        {
            return false;
        }
        if (replacement.empty() || current.empty())
        {
            return false;
        }
        if (auto handle = handle_for_id(id); handle)
        {
            auto const *ti = handle->torrent_file().get();
            if (ti == nullptr)
            {
                return false;
            }
            auto const &files = ti->files();
            auto target = normalize_torrent_path(current);
            if (target.empty())
            {
                return false;
            }
            for (int index = 0; index < files.num_files(); ++index)
            {
                libtorrent::file_index_t file_index(index);
                auto existing =
                    normalize_torrent_path(files.file_path(file_index));
                if (existing != target)
                {
                    continue;
                }
                std::filesystem::path base(target);
                auto parent = base.parent_path();
                std::filesystem::path new_path =
                    parent.empty() ? std::filesystem::path(replacement)
                                   : parent / replacement;
                handle->rename_file(file_index, new_path.generic_string());
                return true;
            }
        }
        return false;
    }

    bool schedule_blocklist_reload()
    {
        if (blocklist_manager.path().empty())
        {
            TT_LOG_INFO("blocklist path not configured; skipping reload");
            return false;
        }
        auto path = blocklist_manager.path();
        task_service.submit(
            [this, path]()
            {
                auto result_opt = blocklist_manager.reload();
                if (!result_opt)
                {
                    TT_LOG_INFO("failed to load blocklist from {}",
                                path.string());
                    return;
                }

                // FIX: Move result out so it can be captured by enqueue_task
                auto result = std::move(*result_opt);

                enqueue_task(
                    [this, result = std::move(result), path]() mutable
                    {
                        if (torrent_manager)
                        {
                            torrent_manager->set_ip_filter(
                                std::move(result.filter));
                        }
                        blocklist_entries = result.entries;
                        blocklist_last_update = result.timestamp;
                        TT_LOG_INFO("loaded blocklist ({} entries) from {}",
                                    result.entries, path.string());
                    });
            });
        return true;
    }
    TorrentSnapshot build_snapshot(int rpc_id,
                                   libtorrent::torrent_status const &status,
                                   std::uint64_t revision = 0)
    {
        TorrentSnapshot info;
        info.id = rpc_id;
        info.hash = info_hash_to_hex(status.info_hashes);
        auto const hash = info.hash;
        info.name = status.name;
        info.state = to_state_string(status.state);
        info.progress = status.progress;
        info.total_wanted = status.total_wanted;
        info.total_done = status.total_wanted_done;
        info.total_size = status.total;
        info.downloaded = status.total_payload_download;
        info.uploaded = status.total_payload_upload;
        info.download_rate = status.download_payload_rate;
        info.upload_rate = status.upload_payload_rate;
        info.status = to_transmission_status(status);
        info.queue_position = static_cast<int>(status.queue_position);
        info.peers_connected = status.num_peers;
        info.seeds_connected = status.num_seeds;
        info.peers_sending_to_us = status.num_seeds;
        info.peers_getting_from_us =
            std::max(0, status.num_peers - status.num_seeds);
        info.eta = estimate_eta(status);
        info.total_wanted_done = status.total_wanted_done;
        info.added_time = status.added_time;
        info.ratio = status.total_download > 0
                         ? static_cast<double>(status.total_upload) /
                               status.total_download
                         : 0.0;
        info.is_finished = status.is_finished;
        info.sequential_download = static_cast<bool>(
            status.flags & libtorrent::torrent_flags::sequential_download);
        info.super_seeding = static_cast<bool>(
            status.flags & libtorrent::torrent_flags::super_seeding);
        info.download_dir = status.save_path;
        info.error = status.errc.value();
        info.error_string = status.errc.message();
        if (auto override = torrent_error_string(hash); !override.empty())
        {
            info.error_string = std::move(override);
        }
        info.left_until_done = std::max<std::int64_t>(
            0, status.total_wanted - status.total_wanted_done);
        info.size_when_done = status.total_wanted;
        if (revision == 0)
        {
            revision = ensure_torrent_revision(rpc_id);
        }
        info.revision = revision;
        return info;
    }

    TorrentDetail collect_detail(int rpc_id,
                                 libtorrent::torrent_handle const &handle,
                                 libtorrent::torrent_status const &status)
    {
        TorrentDetail detail;
        detail.summary = build_snapshot(rpc_id, status);
        auto const hash = info_hash_to_hex(status.info_hashes);

        // FIX: Use persistence instead of the deleted 'torrent_labels' map
        if (persistence)
        {
            detail.summary.labels = persistence->get_labels(hash);
        }

        if (auto prio_it = torrent_priorities.find(rpc_id);
            prio_it != torrent_priorities.end())
        {
            detail.summary.bandwidth_priority = prio_it->second;
        }

        detail.files = collect_files(handle);
        detail.trackers = collect_trackers(handle);
        detail.peers = collect_peers(handle);
        if (auto const *ti = handle.torrent_file().get())
        {
            detail.piece_count = ti->num_pieces();
            detail.piece_size = ti->piece_length();
        }
        else
        {
            detail.piece_count = 0;
            detail.piece_size = 0;
        }

        detail.piece_states.clear();
        int const pieces = status.pieces.size();
        if (pieces > 0)
        {
            detail.piece_states.resize(pieces);
            for (int i = 0; i < pieces; ++i)
            {
                detail.piece_states[i] =
                    status.pieces.get_bit(libtorrent::piece_index_t(i)) ? 1 : 0;
            }
        }

        std::vector<int> availability;
        handle.piece_availability(availability);
        detail.piece_availability = std::move(availability);
        return detail;
    }

    std::vector<TorrentFileInfo>
    collect_files(libtorrent::torrent_handle const &handle)
    {
        std::vector<TorrentFileInfo> files;
        if (!handle.is_valid())
        {
            return files;
        }
        auto const *ti = handle.torrent_file().get();
        if (ti == nullptr)
        {
            return files;
        }

        std::vector<std::int64_t> progress = handle.file_progress();
        auto const &storage = ti->files();

        files.reserve(storage.num_files());
        for (int index = 0; index < storage.num_files(); ++index)
        {
            libtorrent::file_index_t file_index(index);
            TorrentFileInfo entry;
            entry.index = index;
            entry.name = storage.file_path(file_index);
            entry.length = storage.file_size(file_index);
            entry.bytes_completed =
                index < static_cast<int>(progress.size()) ? progress[index] : 0;
            entry.progress =
                entry.length > 0
                    ? static_cast<double>(entry.bytes_completed) / entry.length
                    : 0.0;
            auto priority = handle.file_priority(file_index);
            entry.priority = static_cast<int>(
                static_cast<std::uint8_t>(priority)); // explicit conversion
            entry.wanted = priority != libtorrent::dont_download;
            files.push_back(entry);
        }
        return files;
    }

    std::vector<TorrentTrackerInfo>
    collect_trackers(libtorrent::torrent_handle const &handle)
    {
        std::vector<TorrentTrackerInfo> trackers;
        if (!handle.is_valid())
        {
            return trackers;
        }
        auto const *ti = handle.torrent_file().get();
        if (ti == nullptr)
        {
            return trackers;
        }
        auto const &entries = ti->trackers();
        for (auto const &entry : entries)
        {
            TorrentTrackerInfo info;
            info.announce = entry.url;
            info.tier = entry.tier;
            trackers.push_back(info);
        }
        return trackers;
    }

    std::vector<TorrentPeerInfo>
    collect_peers(libtorrent::torrent_handle const &handle)
    {
        std::vector<TorrentPeerInfo> peers;
        if (!handle.is_valid())
        {
            return peers;
        }
        std::vector<libtorrent::peer_info> peer_list;
        handle.get_peer_info(peer_list);
        peers.reserve(peer_list.size());
        for (auto const &peer : peer_list)
        {
            TorrentPeerInfo info;
            info.client_name = peer.client;
            info.client_is_choking =
                static_cast<bool>(peer.flags & libtorrent::peer_info::choked);
            info.client_is_interested = static_cast<bool>(
                peer.flags & libtorrent::peer_info::interesting);
            info.peer_is_choking = !static_cast<bool>(
                peer.flags & libtorrent::peer_info::remote_interested);
            info.peer_is_interested = static_cast<bool>(
                peer.flags & libtorrent::peer_info::remote_interested);
            info.flag_str = std::to_string(static_cast<unsigned>(peer.flags));
            info.rate_to_client = peer.payload_down_speed;
            info.rate_to_peer = peer.payload_up_speed;
            info.progress = peer.progress;
            if (peer.ip.address().is_v4() || peer.ip.address().is_v6())
            {
                info.address = peer.ip.address().to_string() + ":" +
                               std::to_string(peer.ip.port());
            }
            else
            {
                info.address = peer.ip.address().to_string();
            }
            peers.push_back(info);
        }
        return peers;
    }

    int to_transmission_status(libtorrent::torrent_status const &status) const
    {
        if (status.flags & libtorrent::torrent_flags::paused)
        {
            return 0;
        }
        switch (status.state)
        {
        case libtorrent::torrent_status::checking_files:
        case libtorrent::torrent_status::checking_resume_data:
            return 2;
        case libtorrent::torrent_status::downloading_metadata:
        case libtorrent::torrent_status::downloading:
            return 4;
        case libtorrent::torrent_status::finished:
        case libtorrent::torrent_status::seeding:
            return 6;
        default:
            return 0;
        }
    }
};

Core::~Core() = default;

Core::Core(CoreSettings settings)
    : impl_(std::make_unique<Impl>(std::move(settings)))
{
}

std::unique_ptr<Core> Core::create(CoreSettings settings)
{
    return std::unique_ptr<Core>(new Core(settings));
}

void Core::run()
{
    if (impl_)
    {
        impl_->run();
    }
}

void Core::stop() noexcept
{
    if (impl_)
    {
        impl_->stop();
    }
}

bool Core::is_running() const noexcept
{
    return impl_ ? impl_->running.load(std::memory_order_relaxed) : false;
}

Core::AddTorrentStatus Core::enqueue_add_torrent(TorrentAddRequest request)
{
    if (!impl_)
    {
        return AddTorrentStatus::InvalidUri;
    }
    return impl_->enqueue_torrent(std::move(request));
}

std::shared_ptr<SessionSnapshot> Core::snapshot() const noexcept
{
    if (!impl_)
    {
        return std::make_shared<SessionSnapshot>();
    }
    return impl_->snapshot_copy();
}

CoreSettings Core::settings() const noexcept
{
    if (!impl_)
    {
        return CoreSettings{};
    }
    return impl_->settings_copy();
}

std::vector<TorrentSnapshot> Core::torrent_list() const
{
    if (!impl_)
    {
        return {};
    }
    auto snap = impl_->snapshot_copy();
    return snap ? snap->torrents : std::vector<TorrentSnapshot>{};
}

std::optional<TorrentDetail> Core::torrent_detail(int id)
{
    if (!impl_)
    {
        return std::nullopt;
    }
    try
    {
        return impl_
            ->run_task([this, id]() { return impl_->detail_for_id(id); })
            .get();
    }
    catch (...)
    {
        return std::nullopt;
    }
}

void Core::start_torrents(std::vector<int> ids, bool now)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids), now]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (!handle.is_valid())
                    {
                        continue;
                    }
                    handle.resume();
                }
            })
        .get();
}

void Core::stop_torrents(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.pause();
                    }
                }
            })
        .get();
}

void Core::verify_torrents(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.force_recheck();
                    }
                }
            })
        .get();
}

void Core::remove_torrents(std::vector<int> ids, bool delete_data)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids), delete_data]()
            {
                if (!impl_->torrent_manager)
                {
                    return;
                }
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (!handle.is_valid())
                    {
                        continue;
                    }
                    auto status = handle.status();
                    // Remove from Libtorrent session
                    impl_->torrent_manager->remove_torrent(handle, delete_data);

                    // Remove from Database
                    if (impl_->persistence)
                    {
                        impl_->persistence->remove_torrent(
                            info_hash_to_hex(status.info_hashes));
                    }

                    if (auto metadata_path = impl_->metadata_file_path(
                            info_hash_to_hex(status.info_hashes));
                        !metadata_path.empty())
                    {
                        std::error_code ec;
                        std::filesystem::remove(metadata_path, ec);
                    }
                }
            })
        .get();
}
void Core::reannounce_torrents(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.force_reannounce();
                    }
                }
            })
        .get();
}

void Core::queue_move_top(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.queue_position_top();
                    }
                }
            })
        .get();
}

void Core::queue_move_bottom(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.queue_position_bottom();
                    }
                }
            })
        .get();
}

void Core::queue_move_up(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.queue_position_up();
                    }
                }
            })
        .get();
}

void Core::queue_move_down(std::vector<int> ids)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids)]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        handle.queue_position_down();
                    }
                }
            })
        .get();
}

void Core::toggle_file_selection(std::vector<int> ids,
                                 std::vector<int> file_indexes, bool wanted)
{
    if (!impl_ || ids.empty() || file_indexes.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids), file_indexes = std::move(file_indexes),
             wanted]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (!handle.is_valid())
                    {
                        continue;
                    }
                    for (int index : file_indexes)
                    {
                        libtorrent::file_index_t file_index(index);
                        auto priority = wanted ? libtorrent::default_priority
                                               : libtorrent::dont_download;
                        handle.file_priority(file_index, priority);
                    }
                }
            })
        .get();
}

void Core::set_sequential(std::vector<int> ids, bool enabled)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids), enabled]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        auto flag =
                            libtorrent::torrent_flags::sequential_download;
                        if (enabled)
                        {
                            handle.set_flags(flag);
                        }
                        else
                        {
                            handle.unset_flags(flag);
                        }
                    }
                }
            })
        .get();
}

void Core::set_super_seeding(std::vector<int> ids, bool enabled)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    impl_
        ->run_task(
            [this, ids = std::move(ids), enabled]()
            {
                auto handles = impl_->resolve_handles(ids);
                for (auto &handle : handles)
                {
                    if (handle.is_valid())
                    {
                        auto flag = libtorrent::torrent_flags::super_seeding;
                        if (enabled)
                        {
                            handle.set_flags(flag);
                        }
                        else
                        {
                            handle.unset_flags(flag);
                        }
                    }
                }
            })
        .get();
}

void Core::move_torrent_location(int id, std::string path, bool move)
{
    if (!impl_)
    {
        return;
    }
    impl_
        ->run_task(
            [this, id, path = std::move(path), move]()
            {
                if (auto handle = impl_->handle_for_id(id); handle)
                {
                    auto hash = info_hash_to_hex(handle->status().info_hashes);
                    if (hash.empty())
                    {
                        return;
                    }
                    std::filesystem::path destination(path);
                    impl_->queue_pending_move(hash, destination);
                    if (move)
                    {
                        handle->move_storage(path);
                    }
                    else
                    {
                        handle->move_storage(
                            path, libtorrent::move_flags_t::reset_save_path);
                    }
                }
            })
        .get();
}

void Core::set_download_path(std::filesystem::path path)
{
    if (!impl_)
    {
        return;
    }
    try
    {
        impl_
            ->run_task([this, path = std::move(path)]() mutable
                       { impl_->update_download_path(std::move(path)); })
            .get();
    }
    catch (...)
    {
    }
}

bool Core::set_listen_port(std::uint16_t port)
{
    if (!impl_)
    {
        return false;
    }
    try
    {
        return impl_
            ->run_task([this, port]()
                       { return impl_->update_listen_port(port); })
            .get();
    }
    catch (...)
    {
        return false;
    }
}

bool Core::rename_torrent_path(int id, std::string const &path,
                               std::string const &name)
{
    if (!impl_ || path.empty() || name.empty())
    {
        return false;
    }
    try
    {
        auto current = path;
        auto target = name;
        return impl_
            ->run_task([this, id, current = std::move(current),
                        target = std::move(target)]() mutable
                       { return impl_->rename_path(id, current, target); })
            .get();
    }
    catch (...)
    {
        return false;
    }
}

void Core::set_speed_limits(std::optional<int> download_kbps,
                            std::optional<bool> download_enabled,
                            std::optional<int> upload_kbps,
                            std::optional<bool> upload_enabled)
{
    if (!impl_)
    {
        return;
    }
    try
    {
        impl_
            ->run_task(
                [this, download_kbps, download_enabled, upload_kbps,
                 upload_enabled]()
                {
                    impl_->apply_speed_limits(download_kbps, download_enabled,
                                              upload_kbps, upload_enabled);
                })
            .get();
    }
    catch (...)
    {
    }
}

void Core::set_peer_limits(std::optional<int> global_limit,
                           std::optional<int> per_torrent_limit)
{
    if (!impl_)
    {
        return;
    }
    try
    {
        impl_
            ->run_task(
                [this, global_limit, per_torrent_limit]()
                { impl_->apply_peer_limits(global_limit, per_torrent_limit); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::update_session_settings(SessionUpdate update)
{
    if (!impl_)
    {
        return;
    }
    try
    {
        impl_
            ->run_task([this, update = std::move(update)]() mutable
                       { impl_->apply_session_update(std::move(update)); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::add_trackers(std::vector<int> ids,
                        std::vector<TrackerEntry> const &entries)
{
    if (!impl_ || ids.empty() || entries.empty())
    {
        return;
    }
    try
    {
        auto entries_copy = entries;
        impl_
            ->run_task([this, ids = std::move(ids),
                        entries = std::move(entries_copy)]() mutable
                       { impl_->add_torrent_trackers(ids, entries); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::remove_trackers(std::vector<int> ids,
                           std::vector<std::string> const &announces)
{
    if (!impl_ || ids.empty() || announces.empty())
    {
        return;
    }
    try
    {
        auto announces_copy = announces;
        impl_
            ->run_task([this, ids = std::move(ids),
                        announces = std::move(announces_copy)]() mutable
                       { impl_->remove_torrent_trackers(ids, announces); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::replace_trackers(std::vector<int> ids,
                            std::vector<TrackerEntry> const &entries)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    try
    {
        auto entries_copy = entries;
        impl_
            ->run_task([this, ids = std::move(ids),
                        entries = std::move(entries_copy)]() mutable
                       { impl_->replace_torrent_trackers(ids, entries); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::set_torrent_bandwidth_priority(std::vector<int> ids, int priority)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    try
    {
        impl_
            ->run_task(
                [this, ids = std::move(ids), priority]() mutable
                { impl_->set_torrent_bandwidth_priority(ids, priority); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::set_torrent_bandwidth_limits(std::vector<int> ids,
                                        std::optional<int> download_limit_kbps,
                                        std::optional<bool> download_limited,
                                        std::optional<int> upload_limit_kbps,
                                        std::optional<bool> upload_limited)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    try
    {
        impl_
            ->run_task(
                [this, ids = std::move(ids), download_limit_kbps,
                 download_limited, upload_limit_kbps, upload_limited]() mutable
                {
                    impl_->set_torrent_bandwidth_limits(
                        ids, download_limit_kbps, download_limited,
                        upload_limit_kbps, upload_limited);
                })
            .get();
    }
    catch (...)
    {
    }
}

void Core::set_torrent_seed_limits(std::vector<int> ids,
                                   TorrentSeedLimit limits)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    try
    {
        impl_
            ->run_task([this, ids = std::move(ids),
                        limits = std::move(limits)]() mutable
                       { impl_->set_torrent_seed_limits(ids, limits); })
            .get();
    }
    catch (...)
    {
    }
}

void Core::set_torrent_labels(std::vector<int> ids,
                              std::vector<std::string> const &labels)
{
    if (!impl_ || ids.empty())
    {
        return;
    }
    try
    {
        auto labels_copy = labels;
        impl_
            ->run_task([this, ids = std::move(ids),
                        labels = std::move(labels_copy)]() mutable
                       { impl_->set_torrent_labels(ids, labels); })
            .get();
    }
    catch (...)
    {
    }
}

bool Core::request_blocklist_reload()
{
    if (!impl_)
    {
        return false;
    }
    try
    {
        return impl_->schedule_blocklist_reload();
    }
    catch (...)
    {
        return false;
    }
}

std::size_t Core::blocklist_entry_count() const noexcept
{
    return impl_ ? impl_->blocklist_entries : 0;
}

std::optional<std::chrono::system_clock::time_point>
Core::blocklist_last_update() const noexcept
{
    if (!impl_)
    {
        return std::nullopt;
    }
    return impl_->blocklist_last_update;
}

std::string Core::listen_error() const
{
    if (!impl_)
    {
        return {};
    }
    return impl_->listen_error_impl();
}

HistoryConfig Core::history_config() const
{
    if (!impl_)
    {
        return {};
    }
    return impl_->history_config_impl();
}

std::vector<HistoryBucket> Core::history_data(std::int64_t start,
                                              std::int64_t end,
                                              std::int64_t step) const
{
    if (!impl_)
    {
        return {};
    }
    try
    {
        return impl_
            ->run_task([this, start, end, step]()
                       { return impl_->history_query(start, end, step); })
            .get();
    }
    catch (...)
    {
        return {};
    }
}

bool Core::history_clear(std::optional<std::int64_t> older_than)
{
    if (!impl_)
    {
        return false;
    }
    try
    {
        return impl_
            ->run_task([this, older_than]()
                       { return impl_->history_clear(older_than); })
            .get();
    }
    catch (...)
    {
        return false;
    }
}

} // namespace tt::engine
