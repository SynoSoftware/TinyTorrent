#include "engine/Core.hpp"
#include "engine/AlertRouter.hpp"
#include "engine/AsyncTaskService.hpp"
#include "engine/AutomationAgent.hpp"
#include "engine/BlocklistManager.hpp"
#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/ResumeDataService.hpp"
#include "engine/SnapshotBuilder.hpp"
#include "engine/StateService.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <functional>
#include <future>
#include <iterator>
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
#include <limits>
#include <string>
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
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <system_error>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>

#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

#include <span>

namespace tt::engine
{

namespace
{

constexpr auto kHousekeepingInterval = std::chrono::seconds(2);
constexpr auto kStateFlushInterval = std::chrono::seconds(5);
constexpr auto kShutdownTimeout = std::chrono::seconds(10);
constexpr int kMinHistoryIntervalSeconds = 60;
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
    localtime_r(&result, &value);
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
    return SettingsManager::should_use_alt_speed(
        settings, std::chrono::system_clock::now());
}

void configure_encryption(libtorrent::settings_pack &pack, EncryptionMode mode)
{
    SettingsManager::apply_encryption(CoreSettings{.encryption = mode}, pack);
}

void configure_proxy_settings(libtorrent::settings_pack &pack,
                              CoreSettings const &settings)
{
    SettingsManager::apply_proxy(settings, pack);
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
    std::unique_ptr<StateService> state_service;
    std::unique_ptr<PersistenceManager> persistence;
    std::unique_ptr<SnapshotBuilder> snapshot_builder;
    std::unique_ptr<HistoryAgent> history_agent;
    std::unique_ptr<AutomationAgent> automation_agent;
    std::unique_ptr<ResumeDataService> resume_service;
    std::unique_ptr<AlertRouter> alert_router;
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
    bool resume_save_requested = false;
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
        state_service = std::make_unique<StateService>(persistence.get());

        if (persistence && persistence->is_valid())
        {
            state_service->load_persisted_stats();
        }
        else
        {
            TT_LOG_INFO("sqlite state database unavailable; falling back to "
                        "ephemeral state");
            state_service->set_session_count(1);
        }

        snapshot_builder = std::make_unique<SnapshotBuilder>(
            persistence.get(), torrent_priorities,
            [this](int id) { return ensure_torrent_revision(id); },
            [this](std::string const &hash)
            { return torrent_error_string(hash); });

        // Initialize Agents
        automation_agent = std::make_unique<AutomationAgent>(
            [this](std::function<void()> task)
            { task_service.submit(std::move(task)); },
            [this](std::function<void()> task)
            { enqueue_task(std::move(task)); },
            [this](TorrentAddRequest request)
            { return enqueue_torrent(std::move(request)); },
            [this](std::string const &hash, std::filesystem::path const &path)
            { queue_pending_move(hash, path); },
            [this](std::string const &hash) { cancel_pending_move(hash); },
            [this](std::string const &hash, std::filesystem::path const &path)
            { finalize_pending_move(hash, path); });
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

        resume_service = std::make_unique<ResumeDataService>(
            torrent_manager.get(), persistence.get());
        AlertRouter::Callbacks router_callbacks;
        router_callbacks.mark_torrent_dirty = [this](int id)
        { mark_torrent_dirty(id); };
        router_callbacks.record_torrent_error =
            [this](std::string const &hash, std::string message)
        { record_torrent_error(hash, std::move(message)); };
        router_callbacks.set_listen_error = [this](std::string value)
        { set_listen_error(std::move(value)); };
        router_callbacks.set_listen_interface = [this](std::string value)
        { set_listen_interface(std::move(value)); };
        router_callbacks.metadata_path = [this](std::string const &hash)
        { return metadata_file_path(hash); };
        router_callbacks.finalize_pending_move =
            [this](std::string const &hash, std::filesystem::path const &path)
        { finalize_pending_move(hash, path); };
        router_callbacks.cancel_pending_move = [this](std::string const &hash)
        { cancel_pending_move(hash); };
        alert_router = std::make_unique<AlertRouter>(
            torrent_manager.get(), automation_agent.get(), persistence.get(),
            history_agent.get(), resume_service.get(),
            std::move(router_callbacks));

        // Load and Start Torrents (Linear Startup)
        if (torrent_manager && persistence && persistence->is_valid())
        {
            auto replays = persistence->load_replay_torrents(this->settings);
            for (auto &replay : replays)
            {
                if (replay.hash.empty())
                {
                    continue;
                }

                if (!replay.request.metainfo.empty() || replay.request.uri)
                {
                    enqueue_torrent(std::move(replay.request));
                }
            }

            auto persisted_ids = persistence->persisted_rpc_mappings();
            if (!persisted_ids.empty())
            {
                torrent_manager->recover_rpc_mappings(persisted_ids);
            }
        }

        if (torrent_manager && state_service)
        {
            auto totals = torrent_manager->capture_session_totals();
            state_service->initialize_session_statistics(totals);
            state_service->mark_dirty();
        }

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
        if (alert_router)
        {
            alert_router->wire_callbacks();
        }
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

        alert_router.reset();
        resume_service.reset();

        // Explicitly reset services in controlled order to prevent
        // any potential use-after-free during destruction
        // Order: TorrentManager (has session) -> AutomationAgent ->
        // HistoryAgent -> Persistence
        torrent_manager.reset();
        automation_agent.reset();
        history_agent.reset();
        persistence.reset();
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
                    resume_service && !resume_save_requested)
                {
                    resume_save_requested = resume_service->request_save_all();
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
                    auto waiting_on_resume = resume_save_requested &&
                                             resume_service &&
                                             resume_service->in_progress(now);
                    if (!waiting_on_resume)
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
        if (state_service)
        {
            state_service->persist_now();
        }
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

    void set_listen_interface(std::string interface_value)
    {
        std::lock_guard<std::shared_mutex> guard(settings_mutex);
        settings.listen_interface = std::move(interface_value);
        mark_settings_dirty();
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
        {
            persistence->update_save_path(hash, to_utf8_string(destination));
        }
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
        if (state_service)
        {
            state_service->flush_if_due(now);
        }
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
        std::uint64_t downloaded_delta = 0;
        std::uint64_t uploaded_delta = 0;
        SessionStatistics cumulative_stats{};
        SessionStatistics current_stats{};
        if (state_service)
        {
            auto deltas = state_service->record_session_totals(totals, now);
            downloaded_delta = deltas.first;
            uploaded_delta = deltas.second;
            cumulative_stats = state_service->cumulative_stats();
            current_stats = state_service->current_session_stats(totals, now);
        }
        else
        {
            current_stats.session_count = 1;
        }
        if (history_agent)
        {
            history_agent->record(now, downloaded_delta, uploaded_delta);
        }

        TorrentManager::SnapshotBuildCallbacks callbacks;

        callbacks.on_torrent_visit =
            [this](int id, libtorrent::torrent_handle const &handle,
                   libtorrent::torrent_status const &status)
        { enforce_torrent_seed_limits(id, handle, status); };

        callbacks.build_snapshot_entry =
            [this](int id, libtorrent::torrent_status const &status,
                   std::uint64_t revision)
        {
            if (!snapshot_builder)
            {
                return TorrentSnapshot{};
            }
            return snapshot_builder->build_snapshot(id, status, revision);
        };

        callbacks.labels_for_torrent =
            [this](int /*id*/, std::string const &hash)
        {
            if (persistence)
            {
                return persistence->get_labels(hash);
            }
            return std::vector<std::string>{};
        };

        callbacks.priority_for_torrent = [this](int id)
        {
            if (auto it = torrent_priorities.find(id);
                it != torrent_priorities.end())
            {
                return it->second;
            }
            return 0;
        };

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
        SettingsManager::apply_rate_limits(download_kbps, download_enabled,
                                           upload_kbps, upload_enabled, pack,
                                           &current_settings);
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
        auto result = SettingsManager::apply_update(settings_copy(), update);
        {
            std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
            settings = result.settings;
        }

        if (history_agent)
        {
            history_agent->update_config(result.history_config,
                                         result.flush_history_after,
                                         result.configure_history_after);
        }
        if (automation_agent)
        {
            automation_agent->configure(
                settings.watch_dir, settings.watch_dir_enabled,
                settings.download_path, settings.incomplete_dir,
                settings.incomplete_dir_enabled);
        }
        if (result.encryption_changed)
        {
            apply_encryption_settings();
        }
        if (result.network_changed)
        {
            apply_network_settings();
        }
        if (result.queue_changed)
        {
            apply_queue_settings();
        }
        if (result.alt_changed)
        {
            refresh_active_speed_limits(true);
        }
        if (result.proxy_changed)
        {
            apply_proxy_settings();
        }
        if (result.pex_changed)
        {
            apply_pex_flags();
        }
        if (result.persist)
        {
            mark_settings_dirty();
        }
    }

    void apply_encryption_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        SettingsManager::apply_encryption(snapshot, pack, &current_settings);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_network_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        SettingsManager::apply_network(snapshot, pack, &current_settings);
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
        SettingsManager::apply_proxy(snapshot, pack, &current_settings);
        if (torrent_manager)
        {
            torrent_manager->apply_settings(pack);
        }
    }

    void apply_queue_settings()
    {
        CoreSettings snapshot = settings_copy();
        libtorrent::settings_pack pack;
        SettingsManager::apply_queue(snapshot, pack, &current_settings);
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

        for (int id : ids)
        {
            if (auto handle = handle_for_id(id); handle)
            {
                auto hash = info_hash_to_hex(handle->status().info_hashes);
                if (!hash.empty())
                {
                    persistence->set_labels(hash, labels);
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
    TorrentDetail collect_detail(int rpc_id,
                                 libtorrent::torrent_handle const &handle,
                                 libtorrent::torrent_status const &status)
    {
        if (!snapshot_builder)
        {
            return {};
        }
        return snapshot_builder->collect_detail(rpc_id, handle, status);
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
