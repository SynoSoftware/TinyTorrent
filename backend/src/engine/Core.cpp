#include "engine/Core.hpp"

#include "engine/AlertRouter.hpp"
#include "engine/AsyncTaskService.hpp"
#include "engine/AutomationAgent.hpp"
#include "engine/BlocklistManager.hpp"
#include "engine/BlocklistService.hpp"
#include "engine/ConfigurationService.hpp"
#include "engine/EventBus.hpp"
#include "engine/Events.hpp"
#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/ResumeDataService.hpp"
#include "engine/SchedulerService.hpp"
#include "engine/SessionService.hpp"
#include "engine/SettingsManager.hpp"
#include "engine/StateService.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"
#include "utils/Endpoint.hpp"
#include "utils/Log.hpp"
#include "utils/OutboundRoute.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <format>
#include <fstream>
#include <iterator>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <system_error>
#include <thread>
#include <vector>

// Libtorrent includes for tracker manipulation
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include <libtorrent/session_handle.hpp>
#include <libtorrent/session_params.hpp>
#include <libtorrent/span.hpp>
#include <libtorrent/torrent_handle.hpp>

namespace tt::engine
{

namespace
{
constexpr auto kShutdownTimeout = std::chrono::seconds(10);

std::string to_utf8(std::filesystem::path const &p)
{
    auto u8 = p.u8string();
    return std::string(u8.begin(), u8.end());
}
} // namespace

enum class EngineState
{
    Running,
    ShuttingDown_SaveResume,
    ShuttingDown_Flush,
    Stopped
};

struct Core::Impl
{
    // Infrastructure
    AsyncTaskService task_service;
    std::unique_ptr<EventBus> event_bus;

    // Services
    std::unique_ptr<PersistenceManager> persistence;
    std::shared_ptr<ConfigurationService> config_service;
    std::unique_ptr<StateService> state_service;
    std::unique_ptr<HistoryAgent> history_agent;
    std::unique_ptr<TorrentManager> torrent_manager;
    std::unique_ptr<SessionService> session_service;
    std::unique_ptr<AutomationAgent> automation_agent;
    std::unique_ptr<ResumeDataService> resume_service;
    std::unique_ptr<SchedulerService> scheduler_service;
    std::unique_ptr<AlertRouter> alert_router;
    BlocklistManager blocklist_manager;
    std::unique_ptr<BlocklistService> blocklist_service;

    // Initialization synchronization: signal when constructor finished
    // initializing the services that other threads may depend on.
    std::mutex init_mtx;
    std::condition_variable init_cv;
    bool initialized_{false};

    // State
    std::atomic<EngineState> state{EngineState::Running};
    std::atomic_bool shutdown_requested{false};
    std::chrono::steady_clock::time_point shutdown_start;
    std::filesystem::path dht_state_path;
    std::vector<char> dht_state_buffer;
    CoreSettings settings_;
    std::string listen_error;
    mutable std::shared_mutex listen_error_mutex;
    std::atomic_bool listen_port_auto_retry_attempted{false};
    bool listen_fallback_attempted = false;

    Impl(CoreSettings settings) : settings_(std::move(settings))
    {
        auto root = tt::utils::data_root();
        auto state_path = settings_.state_path.empty() ? root / "tinytorrent.db"
                                                       : settings_.state_path;
        dht_state_path = state_path;
        dht_state_path.replace_extension(".dht");

        task_service.start();
        event_bus = std::make_unique<EventBus>();
        persistence = std::make_unique<PersistenceManager>(state_path);

        // Initialize Configuration
        config_service = std::make_shared<ConfigurationService>(
            persistence.get(), event_bus.get(), settings);

        // Initialize State & History
        state_service = std::make_unique<StateService>(persistence.get());
        if (persistence->is_valid())
            state_service->load_persisted_stats();
        else
            state_service->set_session_count(1);

        HistoryConfig hconf;
        hconf.enabled = settings_.history_enabled;
        hconf.interval_seconds = settings_.history_interval_seconds;
        hconf.retention_days = settings_.history_retention_days;
        history_agent = std::make_unique<HistoryAgent>(state_path, hconf);
        history_agent->start();

        // Initialize Session
        torrent_manager = std::make_unique<TorrentManager>();
        session_service = std::make_unique<SessionService>(
            torrent_manager.get(), persistence.get(), state_service.get(),
            history_agent.get(), config_service.get(), event_bus.get());

        // Initialize Aux Services
        automation_agent = std::make_unique<AutomationAgent>(
            [this](auto t) { task_service.submit(t); },
            [this](auto t) { torrent_manager->enqueue_task(t); }, [this](auto r)
            { return session_service->add_torrent(r); }, [this](auto h, auto p)
            { torrent_manager->queue_pending_move(h, p); },
            [this](auto h) { torrent_manager->cancel_pending_move(h); },
            [this](auto h, auto p)
            {
                torrent_manager->cancel_pending_move(h);
                persistence->update_save_path(h, to_utf8(p));
            });
        automation_agent->configure(
            settings_.watch_dir, settings_.watch_dir_enabled,
            settings_.download_path, settings_.incomplete_dir,
            settings_.incomplete_dir_enabled);

        resume_service = std::make_unique<ResumeDataService>(
            torrent_manager.get(), persistence.get());

        // 1. Create the generic scheduler
        scheduler_service = std::make_unique<SchedulerService>();

        // 2. Pass it to services or register tasks directly here

        // Automation: "Scan every 2 seconds"
        scheduler_service->schedule(std::chrono::seconds(2),
                                    [this]()
                                    {
                                        if (automation_agent)
                                            automation_agent->scan();
                                    });

        // History: "Check retention every hour"
        scheduler_service->schedule(
            std::chrono::hours(1),
            [this]()
            {
                if (history_agent)
                    history_agent->perform_retention(
                        std::chrono::steady_clock::now());
            });

        // State: "Flush stats every 5 seconds"
        scheduler_service->schedule(
            std::chrono::seconds(5),
            [this]()
            {
                if (state_service)
                    state_service->flush_if_due(
                        std::chrono::steady_clock::now());
            });

        // Config: "Flush settings every 500ms if dirty"
        scheduler_service->schedule(std::chrono::milliseconds(500),
                                    [this]()
                                    {
                                        if (config_service)
                                            config_service->persist_if_dirty();
                                    });

        // DHT persistence: run periodically but offload file I/O to the
        // AsyncTaskService to avoid blocking the engine main loop.
        scheduler_service->schedule(
            std::chrono::minutes(5), [this]()
            { task_service.submit([this]() { persist_dht_state(); }); });

        alert_router = std::make_unique<AlertRouter>(
            torrent_manager.get(), event_bus.get(),
            [](auto hash)
            {
                return tt::utils::data_root() / "metadata" /
                       (hash + ".torrent");
            });

        event_bus->subscribe<ListenSucceededEvent>(
            [this](auto const &event)
            {
                // Do not persist the listen-succeeded endpoint back into
                // configuration. Libtorrent reports the concrete bound address
                // (e.g. a specific adapter IP), which can inadvertently lock
                // subsequent runs to a VPN/virtual adapter.
                (void)event;
                listen_port_auto_retry_attempted.store(
                    false, std::memory_order_release);
                clear_listen_error();
            });
        event_bus->subscribe<ListenFailedEvent>(
            [this](auto const &event)
            {
                set_listen_error(event.message);
                handle_listen_failure(event);
            });
        event_bus->subscribe<StorageMovedEvent>(
            [this](auto const &event)
            {
                if (automation_agent)
                {
                    automation_agent->handle_storage_moved(event.hash,
                                                           event.path);
                }
            });
        event_bus->subscribe<StorageMoveFailedEvent>(
            [this](auto const &event)
            {
                if (automation_agent)
                {
                    automation_agent->handle_storage_move_failed(event.hash);
                }
            });

        // Load State
        auto replays = persistence->load_replay_torrents(settings_);
        for (auto &r : replays)
            session_service->add_torrent(std::move(r.request));

        auto mappings = persistence->persisted_rpc_mappings();
        if (!mappings.empty())
            torrent_manager->recover_rpc_mappings(mappings);

        // Start
        blocklist_manager.set_path(settings_.blocklist_path);
        blocklist_service = std::make_unique<BlocklistService>(
            &blocklist_manager, &task_service, torrent_manager.get());

        auto dht_state = load_dht_state();
        auto pack = SettingsManager::build_settings_pack(settings_);

        // Lock the outbound interface to a single routable IPv4 candidate so
        // we can fail over cleanly while libtorrent infers the actual
        // announce IP.
        auto outbound_candidates = tt::net::ranked_outbound_ipv4_candidates();
        if (!outbound_candidates.empty())
        {
            auto const &selected = outbound_candidates.front();
            pack.set_str(libtorrent::settings_pack::outgoing_interfaces,
                         selected);

            // libtorrent binds UDP tracker/DHT sockets to listen sockets.
            // To keep the configured port stable across failovers while still
            // listening on the wildcard address, capture it for the manager.
            std::string listen_port;
            if (auto pos = settings_.listen_interface.rfind(':');
                pos != std::string::npos &&
                pos + 1 < settings_.listen_interface.size())
            {
                listen_port = settings_.listen_interface.substr(pos + 1);
            }
            if (listen_port.empty())
            {
                listen_port = "6881";
            }
            torrent_manager->set_outbound_announce_candidates(
                std::move(outbound_candidates), std::move(listen_port));
        }
        else
        {
            TT_LOG_INFO("no outbound IPv4 candidates found; tracker announces "
                        "may fail");
        }
        libtorrent::v2::session_params params(pack);
        if (dht_state)
            params.dht_state = std::move(*dht_state);

        session_service->start(std::move(params));
        alert_router->wire_callbacks();

        // React to settings changes (automation path/watch updates)
        event_bus->subscribe<SettingsChangedEvent>(
            [this](auto const &)
            {
                auto s = config_service->get();
                if (automation_agent)
                {
                    automation_agent->set_download_path(s.download_path);
                    automation_agent->configure(
                        s.watch_dir, s.watch_dir_enabled, s.download_path,
                        s.incomplete_dir, s.incomplete_dir_enabled);
                }
            });

        // Mark initialization complete and notify any waiters.
        {
            std::lock_guard<std::mutex> lock(init_mtx);
            initialized_ = true;
        }
        init_cv.notify_all();
    }

    void wait_until_initialized()
    {
        std::unique_lock<std::mutex> lock(init_mtx);
        init_cv.wait(lock, [this]() { return initialized_; });
    }

    ~Impl()
    {
        // 1. Save state synchronously
        persist_dht_state();

        // 2. Cut off incoming alerts from libtorrent
        if (torrent_manager)
            torrent_manager->set_alert_callbacks({});

        // 3. STOP WORKERS FIRST (Fixes Use-After-Free)
        // This processes all pending tasks while the Services (Blocklist,
        // Automation) are still alive. If we destroyed services first, these
        // tasks would crash.
        task_service.stop();

        // 4. Now safe to destroy services
        blocklist_service.reset();
        automation_agent.reset();

        if (history_agent)
            history_agent->stop();
    }

    void run()
    {
        while (state.load() != EngineState::Stopped)
        {
            auto now = std::chrono::steady_clock::now();

            if (state.load() == EngineState::Running)
            {
                if (shutdown_requested.load())
                {
                    state.store(EngineState::ShuttingDown_SaveResume);
                    shutdown_start = now;
                    if (resume_service)
                        resume_service->request_save_all();
                }
            }
            else if (state.load() == EngineState::ShuttingDown_SaveResume)
            {
                if (now - shutdown_start > kShutdownTimeout ||
                    (resume_service && !resume_service->in_progress(now)))
                {
                    state.store(EngineState::ShuttingDown_Flush);
                }
            }
            else if (state.load() == EngineState::ShuttingDown_Flush)
            {
                if (history_agent)
                    history_agent->flush_if_due(now, true);
                if (state_service)
                    state_service->persist_now();
                if (config_service)
                    config_service->persist_now();
                state.store(EngineState::Stopped);
                break;
            }

            session_service->tick(now);
            if (scheduler_service)
                scheduler_service->tick(now);
            if (config_service)
                config_service->persist_if_dirty();

            auto sched_wait =
                scheduler_service
                    ? scheduler_service->time_until_next_task(now)
                    : std::chrono::milliseconds(settings_.idle_sleep_ms);
            auto wait_limit = std::min<long long>(
                static_cast<long long>(settings_.idle_sleep_ms),
                static_cast<long long>(sched_wait.count()));
            auto wait_ms =
                static_cast<unsigned>(std::max<long long>(1, wait_limit));
            torrent_manager->wait_for_work(wait_ms, shutdown_requested);
        }
        persist_dht_state();
    }

    std::optional<libtorrent::dht::dht_state> load_dht_state()
    {
        if (dht_state_path.empty() || !std::filesystem::exists(dht_state_path))
            return std::nullopt;
        std::ifstream input(dht_state_path, std::ios::binary);
        if (!input)
            return std::nullopt;
        dht_state_buffer.assign((std::istreambuf_iterator<char>(input)),
                                std::istreambuf_iterator<char>());
        if (dht_state_buffer.empty())
            return std::nullopt;
        try
        {
            auto params = libtorrent::read_session_params(
                libtorrent::span<char const>(dht_state_buffer.data(),
                                             dht_state_buffer.size()),
                libtorrent::session_handle::save_dht_state);
            return params.dht_state;
        }
        catch (...)
        {
            TT_LOG_INFO("failed to load DHT state from {}",
                        dht_state_path.string());
            return std::nullopt;
        }
    }

    void persist_dht_state()
    {
        if (!torrent_manager || dht_state_path.empty())
            return;
        auto buffer = torrent_manager->write_session_params(
            libtorrent::session_handle::save_dht_state);
        if (buffer.empty())
            return;
        std::error_code ec;
        auto parent = dht_state_path.parent_path();
        if (!parent.empty() && !std::filesystem::exists(parent, ec))
            std::filesystem::create_directories(parent, ec);
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
        std::shared_lock lock(listen_error_mutex);
        return listen_error;
    }

    void set_listen_error(std::string message)
    {
        std::unique_lock lock(listen_error_mutex);
        listen_error = std::move(message);
    }

    void clear_listen_error()
    {
        std::unique_lock lock(listen_error_mutex);
        listen_error.clear();
    }

    void handle_listen_failure(ListenFailedEvent const &event)
    {
        // Prevent recursive fallbacks (fail -> apply settings -> fail).
        if (listen_fallback_attempted)
        {
            return;
        }
        auto current = config_service->get().listen_interface;
        auto parts = tt::net::parse_host_port(current);
        if (parts.port.empty() || parts.port == "0")
        {
            return;
        }
        bool expected = false;
        if (!listen_port_auto_retry_attempted.compare_exchange_strong(
                expected, true, std::memory_order_acq_rel))
        {
            return;
        }

        // mark that we've attempted the fallback so subsequent listen_failed
        // alerts triggered by applying the fallback do not recurse.
        listen_fallback_attempted = true;
        TT_LOG_INFO(
            "listen port {} failed ({}); falling back to ephemeral port",
            event.port, event.message);
        set_listen_error(
            std::format("{} (falling back to ephemeral port)", event.message));
        if (parts.host.empty())
        {
            parts.host = "0.0.0.0";
            parts.bracketed = false;
        }
        parts.port = "0";
        auto updated = tt::net::format_host_port(parts);
        if (auto pending_config = config_service)
        {
            pending_config->set_listen_interface(updated);
            if (event_bus)
            {
                event_bus->publish(SettingsChangedEvent{});
            }
            if (torrent_manager)
            {
                torrent_manager->notify();
            }
        }
    }
};

// --- Proxy Methods ---

Core::~Core() = default;
Core::Core(CoreSettings s) : impl_(std::make_unique<Impl>(std::move(s)))
{
    if (impl_)
        impl_->wait_until_initialized();
}
std::unique_ptr<Core> Core::create(CoreSettings s)
{
    return std::make_unique<Core>(std::move(s));
}

void Core::run()
{
    if (impl_)
        impl_->run();
}
void Core::stop() noexcept
{
    if (impl_)
        impl_->shutdown_requested = true;
    if (impl_->torrent_manager)
        impl_->torrent_manager->notify();
}
bool Core::is_running() const noexcept
{
    return impl_ && impl_->state.load() != EngineState::Stopped;
}

Core::AddTorrentStatus Core::enqueue_add_torrent(TorrentAddRequest r)
{
    return impl_->session_service->add_torrent(std::move(r));
}
std::shared_ptr<SessionSnapshot> Core::snapshot() const noexcept
{
    return impl_->session_service->snapshot();
}
CoreSettings Core::settings() const noexcept
{
    return impl_->config_service->get();
}

std::vector<TorrentSnapshot> Core::torrent_list() const
{
    auto s = impl_->session_service->snapshot();
    return s ? s->torrents : std::vector<TorrentSnapshot>{};
}

std::optional<TorrentDetail> Core::torrent_detail(int id)
{
    return impl_->session_service->get_detail(id);
}

void Core::start_torrents(std::vector<int> ids, bool now)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, now]
        {
            impl_->session_service->perform_action(
                ids,
                [now](auto &h)
                {
                    h.resume();
                    if (now)
                        h.set_flags(libtorrent::torrent_flags::auto_managed);
                });
        });
}

void Core::stop_torrents(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(ids,
                                                   [](auto &h) { h.pause(); });
        });
}

void Core::pause_all()
{
    impl_->torrent_manager->enqueue_task(
        [this]()
        {
            impl_->session_service->perform_action_all([](auto &h)
                                                       { h.pause(); });
        });
}

void Core::resume_all()
{
    impl_->torrent_manager->enqueue_task(
        [this]()
        {
            impl_->session_service->perform_action_all([](auto &h)
                                                       { h.resume(); });
        });
}

void Core::remove_torrents(std::vector<int> ids, bool delete_data)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, delete_data]
        { impl_->session_service->remove_torrents(ids, delete_data); });
}

void Core::verify_torrents(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(ids, [](auto &h)
                                                   { h.force_recheck(); });
        });
}

void Core::reannounce_torrents(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(ids, [](auto &h)
                                                   { h.force_reannounce(); });
        });
}

void Core::queue_move_top(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(ids, [](auto &h)
                                                   { h.queue_position_top(); });
        });
}
void Core::queue_move_bottom(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(
                ids, [](auto &h) { h.queue_position_bottom(); });
        });
}
void Core::queue_move_up(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(ids, [](auto &h)
                                                   { h.queue_position_up(); });
        });
}
void Core::queue_move_down(std::vector<int> ids)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids]
        {
            impl_->session_service->perform_action(
                ids, [](auto &h) { h.queue_position_down(); });
        });
}

void Core::set_download_path(std::filesystem::path path)
{
    impl_->torrent_manager->enqueue_task(
        [this, path] { impl_->config_service->set_download_path(path); });
}

bool Core::set_listen_port(uint16_t port)
{
    auto current = impl_->config_service->get().listen_interface;
    auto parts = tt::net::parse_host_port(current);
    if (parts.host.empty())
    {
        parts.host = "0.0.0.0";
        parts.bracketed = false;
    }
    parts.port = std::to_string(port);
    auto updated = tt::net::format_host_port(parts);
    impl_->torrent_manager->enqueue_task(
        [this, updated]
        { impl_->config_service->set_listen_interface(updated); });
    return true;
}

void Core::move_torrent_location(int id, std::string path, bool move)
{
    impl_->torrent_manager->enqueue_task(
        [this, id, path, move]
        {
            impl_->session_service->perform_action(
                {id},
                [&](auto &h)
                {
                    auto hash = info_hash_to_hex(h.status().info_hashes);
                    impl_->torrent_manager->queue_pending_move(hash, path);
                    h.move_storage(
                        path,
                        move ? libtorrent::move_flags_t::always_replace_files
                             : libtorrent::move_flags_t::reset_save_path);
                });
        });
}

void Core::set_speed_limits(std::optional<int> dl, std::optional<bool> dl_en,
                            std::optional<int> ul, std::optional<bool> ul_en)
{
    impl_->torrent_manager->enqueue_task(
        [=] { impl_->config_service->set_limits(dl, dl_en, ul, ul_en); });
}

void Core::set_peer_limits(std::optional<int> global,
                           std::optional<int> per_torrent)
{
    impl_->torrent_manager->enqueue_task(
        [=] { impl_->config_service->set_peer_limits(global, per_torrent); });
}

void Core::update_session_settings(SessionUpdate update)
{
    impl_->torrent_manager->enqueue_task([this, u = std::move(update)]
                                         { impl_->config_service->update(u); });
}

void Core::add_trackers(std::vector<int> ids,
                        std::vector<TrackerEntry> const &entries)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, entries]
        {
            impl_->session_service->perform_action(
                ids,
                [&](auto &h)
                {
                    for (auto const &e : entries)
                        h.add_tracker(libtorrent::announce_entry(e.announce));
                });
        });
}

void Core::remove_trackers(std::vector<int> ids,
                           std::vector<std::string> const &announces)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, announces]
        {
            impl_->session_service->perform_action(
                ids,
                [announces](auto &h)
                {
                    auto trackers = h.trackers();
                    auto it = std::remove_if(
                        trackers.begin(), trackers.end(),
                        [&](libtorrent::announce_entry const &ae)
                        {
                            return std::find(announces.begin(), announces.end(),
                                             ae.url) != announces.end();
                        });
                    if (it != trackers.end())
                    {
                        trackers.erase(it, trackers.end());
                        h.replace_trackers(trackers);
                    }
                });
        });
}

void Core::replace_trackers(std::vector<int> ids,
                            std::vector<TrackerEntry> const &entries)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, entries]
        {
            impl_->session_service->perform_action(
                ids,
                [entries](auto &h)
                {
                    std::vector<libtorrent::announce_entry> v;
                    v.reserve(entries.size());
                    for (auto const &e : entries)
                    {
                        libtorrent::announce_entry ae(e.announce);
                        ae.tier = e.tier;
                        v.emplace_back(std::move(ae));
                    }
                    h.replace_trackers(v);
                });
        });
}

void Core::set_torrent_bandwidth_priority(std::vector<int> ids, int priority)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, priority]
        { impl_->session_service->apply_bandwidth_priority(ids, priority); });
}

void Core::set_torrent_bandwidth_limits(std::vector<int> ids,
                                        std::optional<int> dl,
                                        std::optional<bool> dl_en,
                                        std::optional<int> ul,
                                        std::optional<bool> ul_en)
{
    impl_->torrent_manager->enqueue_task(
        [=]
        {
            impl_->session_service->apply_bandwidth_limits(ids, dl, dl_en, ul,
                                                           ul_en);
        });
}

void Core::set_torrent_seed_limits(std::vector<int> ids,
                                   TorrentSeedLimit limits)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, limits]
        { impl_->session_service->apply_seed_limits(ids, limits); });
}

void Core::set_torrent_labels(std::vector<int> ids,
                              std::vector<std::string> const &labels)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, labels]
        {
            for (int id : ids)
            {
                if (auto h = impl_->torrent_manager->handle_for_id(id))
                {
                    auto hash = info_hash_to_hex(h->status().info_hashes);
                    impl_->persistence->set_labels(hash, labels);
                }
            }
        });
}

void Core::toggle_file_selection(std::vector<int> ids,
                                 std::vector<int> file_indexes, bool wanted)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, file_indexes, wanted]
        {
            impl_->session_service->perform_action(
                ids,
                [file_indexes, wanted](auto &h)
                {
                    auto prio = wanted ? libtorrent::default_priority
                                       : libtorrent::dont_download;
                    auto const *ti = h.torrent_file().get();
                    if (!ti)
                    {
                        return;
                    }
                    int const file_count = ti->num_files();
                    for (int idx : file_indexes)
                    {
                        if (idx < 0 || idx >= file_count)
                        {
                            TT_LOG_INFO("file priority index {} out of range "
                                        "({} files)",
                                        idx, file_count);
                            continue;
                        }
                        h.file_priority(libtorrent::file_index_t(idx), prio);
                    }
                });
        });
}

void Core::set_sequential(std::vector<int> ids, bool enabled)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, enabled]
        {
            impl_->session_service->perform_action(
                ids,
                [enabled](libtorrent::torrent_handle &h)
                {
                    if (enabled)
                        h.set_flags(
                            libtorrent::torrent_flags::sequential_download);
                    else
                        h.unset_flags(
                            libtorrent::torrent_flags::sequential_download);
                });
        });
}

void Core::set_super_seeding(std::vector<int> ids, bool enabled)
{
    impl_->torrent_manager->enqueue_task(
        [this, ids, enabled]
        {
            impl_->session_service->perform_action(
                ids,
                [enabled](libtorrent::torrent_handle &h)
                {
                    if (enabled)
                        h.set_flags(libtorrent::torrent_flags::super_seeding);
                    else
                        h.unset_flags(libtorrent::torrent_flags::super_seeding);
                });
        });
}

bool Core::rename_torrent_path(int id, std::string const &path,
                               std::string const &name)
{
    if (name.empty())
        return false;

    std::string normalized = path;
    std::replace(normalized.begin(), normalized.end(), '\\', '/');

    auto fut = impl_->torrent_manager->run_task(
        [this, id, normalized, name]
        {
            bool renamed = false;
            impl_->session_service->perform_action(
                std::vector<int>{id},
                [&, normalized, name](libtorrent::torrent_handle &h)
                {
                    auto ti = h.torrent_file();
                    if (!ti)
                        return;
                    auto const &fs = ti->files();
                    for (int i = 0; i < fs.num_files(); ++i)
                    {
                        if (fs.file_path(libtorrent::file_index_t(i)) ==
                            normalized)
                        {
                            h.rename_file(libtorrent::file_index_t(i), name);
                            renamed = true;
                            break;
                        }
                    }
                });
            return renamed;
        });
    return fut.get();
}

bool Core::request_blocklist_reload()
{
    if (!impl_->blocklist_service)
        return false;
    return impl_->blocklist_service->reload_async();
}

size_t Core::blocklist_entry_count() const noexcept
{
    return impl_->blocklist_service ? impl_->blocklist_service->entries() : 0;
}

std::optional<std::chrono::system_clock::time_point>
Core::blocklist_last_update() const noexcept
{
    if (!impl_->blocklist_service)
        return std::nullopt;
    return impl_->blocklist_service->last_update();
}

HistoryConfig Core::history_config() const
{
    return impl_->history_agent->config();
}

void Core::history_data(int64_t start, int64_t end, int64_t step,
                        HistoryCallback callback) const
{
    if (!impl_ || !callback)
    {
        return;
    }
    auto agent = impl_->history_agent.get();
    impl_->task_service.submit(
        [agent, start, end, step, cb = std::move(callback)]() mutable
        {
            std::vector<HistoryBucket> buckets;
            if (agent)
            {
                buckets = agent->query(start, end, step);
            }
            cb(std::move(buckets));
        });
}

void Core::submit_io_task(std::function<void()> task)
{
    if (impl_)
    {
        impl_->task_service.submit(std::move(task));
    }
}

bool Core::history_clear(std::optional<int64_t> older_than)
{
    return impl_->history_agent->clear(older_than);
}

std::string Core::listen_error() const
{
    if (!impl_)
        return {};
    return impl_->listen_error_impl();
}

void Core::set_listen_error_for_testing(std::string message)
{
    if (!impl_)
        return;
    impl_->set_listen_error(std::move(message));
}

} // namespace tt::engine
