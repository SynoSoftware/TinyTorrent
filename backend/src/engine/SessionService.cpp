#include "engine/SessionService.hpp"
#include "engine/ConfigurationService.hpp"
#include "engine/EventBus.hpp"
#include "engine/Events.hpp"
#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/SettingsManager.hpp"
#include "engine/SnapshotBuilder.hpp"
#include "engine/StateService.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"

#include <algorithm>
#include <filesystem>

#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/session_params.hpp>
#include <libtorrent/torrent_info.hpp>

namespace tt::engine
{

namespace
{
std::string to_utf8(std::filesystem::path const &p)
{
    auto u = p.u8string();
    return std::string(u.begin(), u.end());
}
} // namespace

SessionService::SessionService(TorrentManager *manager,
                               PersistenceManager *persistence,
                               StateService *state, HistoryAgent *history,
                               ConfigurationService *config, EventBus *bus)
    : manager_(manager), persistence_(persistence), state_(state),
      history_(history), config_(config), bus_(bus)
{
    // SnapshotBuilder needs reference to priorities and its mutex for
    // thread-safe reading
    snapshot_builder_ = std::make_unique<SnapshotBuilder>(
        persistence_, priorities_, priority_mutex_,
        [this](int id) { return ensure_revision(id); },
        [this](std::string const &hash)
        {
            std::lock_guard<std::mutex> l(data_mutex_);
            return error_messages_.count(hash) ? error_messages_.at(hash) : "";
        });

    bus_->subscribe<TorrentErrorEvent>(
        [this](auto const &e)
        {
            std::lock_guard<std::mutex> l(data_mutex_);
            error_messages_[e.hash] = e.message;
            if (auto id = manager_->id_for_hash(
                    sha1_from_hex(e.hash).value_or(libtorrent::sha1_hash{})))
            {
                mark_dirty(*id);
            }
        });

    bus_->subscribe<TorrentAddFailedEvent>(
        [this](auto const &e)
        {
            TT_LOG_INFO("removing failed torrent {} from persistence", e.hash);
            if (persistence_)
            {
                persistence_->remove_torrent(e.hash);
            }
        });

    // IMPORTANT: Handle settings changes on the Engine Thread to avoid racing
    // with tick(). When settings change we must FORCE re-application of
    // speed limits because the limits themselves may have changed even when
    // the "active" scheduler state did not toggle.
    bus_->subscribe<SettingsChangedEvent>(
        [this](auto const &)
        {
            if (manager_)
            {
                manager_->enqueue_task([this] { check_speed_limits(true); });
            }
        });
}

SessionService::~SessionService() = default;

void SessionService::start(libtorrent::v2::session_params params)
{
    manager_->start_session(std::move(params));
    check_speed_limits(true);
}

void SessionService::tick(std::chrono::steady_clock::time_point now)
{
    if (!manager_->session())
        return;

    manager_->process_tasks();
    manager_->process_alerts();
    check_speed_limits();
    update_snapshot(now);
}

Core::AddTorrentStatus SessionService::add_torrent(TorrentAddRequest request)
{
    libtorrent::add_torrent_params params;
    libtorrent::error_code ec;

    if (!request.metainfo.empty())
    {
        libtorrent::span<char const> span(
            reinterpret_cast<char const *>(request.metainfo.data()),
            request.metainfo.size());
        auto node = libtorrent::bdecode(span, ec);
        if (ec)
            return Core::AddTorrentStatus::InvalidUri;
        auto ti = std::make_shared<libtorrent::torrent_info>(node, ec);
        if (ec)
            return Core::AddTorrentStatus::InvalidUri;
        params.ti = std::move(ti);
    }
    else if (request.uri)
    {
        libtorrent::parse_magnet_uri(*request.uri, params, ec);
        if (ec)
            return Core::AddTorrentStatus::InvalidUri;
    }
    else
    {
        return Core::AddTorrentStatus::InvalidUri;
    }

    auto settings = config_->get();
    auto download_path = request.download_path.empty() ? settings.download_path
                                                       : request.download_path;
    if (download_path.empty())
    {
        download_path = tt::utils::data_root() / "downloads";
    }
    request.download_path = download_path;

    std::filesystem::path ensure_path = download_path;
    if (settings.incomplete_dir_enabled && !settings.incomplete_dir.empty())
    {
        ensure_path = settings.incomplete_dir;
    }
    std::error_code mkdir_ec;
    std::filesystem::create_directories(ensure_path, mkdir_ec);
    if (mkdir_ec)
    {
        TT_LOG_ERROR("failed to ensure save path {}: {}", ensure_path.string(),
                     mkdir_ec.message());
        return Core::AddTorrentStatus::InvalidPath;
    }

    if (settings.incomplete_dir_enabled && !settings.incomplete_dir.empty())
    {
        params.save_path = settings.incomplete_dir.string();
    }
    else
    {
        params.save_path = download_path.string();
    }

    params.flags = libtorrent::torrent_flags::auto_managed;
    if (request.paused)
        params.flags |= libtorrent::torrent_flags::paused;

    if (auto hash = info_hash_from_params(params); hash)
    {
        if (persistence_)
        {
            tt::storage::PersistedTorrent entry;
            entry.hash = *hash;

            // Ensure the path stored in persistence exactly matches the
            // `save_path` given to libtorrent. Use an absolute u8-encoded
            // path when possible so both persistence and libtorrent agree.
            try
            {
                std::error_code ec;
                auto p = std::filesystem::u8path(params.save_path);
                auto abs = std::filesystem::absolute(p, ec);
                if (!ec)
                {
                    entry.save_path = to_utf8(abs);
                }
                else
                {
                    entry.save_path = params.save_path;
                }
            }
            catch (...)
            {
                entry.save_path = params.save_path;
            }

            entry.paused = request.paused;
            if (request.uri)
                entry.magnet_uri = *request.uri;
            entry.metainfo = request.metainfo;
            entry.resume_data = request.resume_data;
            entry.added_at = std::chrono::system_clock::to_time_t(
                std::chrono::system_clock::now());
            if (auto previous_added = persistence_->get_added_at(*hash);
                previous_added)
            {
                if (*previous_added > 0)
                {
                    entry.added_at = *previous_added;
                }
            }
            persistence_->add_or_update_torrent(std::move(entry));
        }
    }

    manager_->async_add_torrent(std::move(params));
    return Core::AddTorrentStatus::Ok;
}

void SessionService::remove_torrents(std::vector<int> const &ids,
                                     bool delete_data)
{
    auto handles = manager_->handles_for_ids(ids);
    for (auto &h : handles)
    {
        if (!h.is_valid())
            continue;
        auto status = h.status();
        auto hash = info_hash_to_hex(status.info_hashes);

        manager_->remove_torrent(h, delete_data);
        if (persistence_)
            persistence_->remove_torrent(hash);
    }
}

void SessionService::perform_action(
    std::vector<int> const &ids,
    std::function<void(libtorrent::torrent_handle &)> action)
{
    auto handles = manager_->handles_for_ids(ids);
    for (auto &h : handles)
    {
        if (h.is_valid())
            action(h);
    }
}

void SessionService::perform_action_all(
    std::function<void(libtorrent::torrent_handle &)> action)
{
    if (!manager_)
        return;
    auto handles = manager_->torrent_handles();
    for (auto &h : handles)
    {
        if (h.is_valid())
            action(h);
    }
}

std::shared_ptr<SessionSnapshot> SessionService::snapshot() const
{
    return manager_->snapshot_copy();
}

std::optional<TorrentDetail> SessionService::get_detail(int id)
{
    if (auto h = manager_->handle_for_id(id))
    {
        auto status = h->status();
        return snapshot_builder_->collect_detail(id, *h, status);
    }
    return std::nullopt;
}

void SessionService::apply_seed_limits(std::vector<int> const &ids,
                                       TorrentSeedLimit const &limits)
{
    std::lock_guard<std::mutex> l(data_mutex_);
    for (int id : ids)
    {
        auto &s = seed_limits_[id];
        if (limits.ratio_limit)
            s.ratio_limit = limits.ratio_limit;
        if (limits.ratio_enabled)
            s.ratio_enabled = *limits.ratio_enabled;
        if (limits.idle_limit)
            s.idle_limit = limits.idle_limit;
        if (limits.idle_enabled)
            s.idle_enabled = *limits.idle_enabled;
        if (limits.ratio_mode)
            s.ratio_mode = limits.ratio_mode;
        if (limits.idle_mode)
            s.idle_mode = limits.idle_mode;

        s.last_activity = std::chrono::steady_clock::now();
        mark_dirty(id);
    }
}

void SessionService::apply_bandwidth_priority(std::vector<int> const &ids,
                                              int priority)
{
    std::unique_lock<std::shared_mutex> lock(priority_mutex_);
    for (int id : ids)
    {
        priorities_[id] = priority;
        mark_dirty(id);
    }
}

void SessionService::apply_bandwidth_limits(std::vector<int> const &ids,
                                            std::optional<int> dl,
                                            std::optional<bool> dl_en,
                                            std::optional<int> ul,
                                            std::optional<bool> ul_en)
{
    manager_->set_torrent_bandwidth_limits(ids, dl, dl_en, ul, ul_en);
}

void SessionService::update_snapshot(std::chrono::steady_clock::time_point now)
{
    auto totals = manager_->capture_session_totals();
    std::uint64_t down = 0, up = 0;

    SessionStatistics cumulative{}, current{};

    if (state_)
    {
        auto delta = state_->record_session_totals(totals, now);
        down = delta.first;
        up = delta.second;
        cumulative = state_->cumulative_stats();
        current = state_->current_session_stats(totals, now);
    }
    else
    {
        current.session_count = 1;
    }

    if (history_)
        history_->record(now, down, up);

    std::vector<int> pending_pause_ids;
    TorrentManager::SnapshotBuildCallbacks cb;
    cb.on_torrent_visit =
        [this, &pending_pause_ids](int id, auto const &h, auto const &s)
    { enforce_limits(id, h, s, &pending_pause_ids); };

    cb.build_snapshot_entry = [this](int id, auto const &s, uint64_t r,
                                     std::optional<std::int64_t> prev)
    { return snapshot_builder_->build_snapshot(id, s, r, prev); };

    cb.ensure_revision = [this](int id) { return ensure_revision(id); };

    cb.labels_for_torrent = [this](int, std::string const &h)
    {
        return persistence_ ? persistence_->get_labels(h)
                            : std::vector<std::string>{};
    };

    cb.priority_for_torrent = [this](int id)
    {
        std::shared_lock<std::shared_mutex> lock(priority_mutex_);
        auto it = priorities_.find(id);
        return it != priorities_.end() ? it->second : 0;
    };

    auto result = manager_->build_snapshot(cb);
    if (auto snap = result.snapshot)
    {
        snap->cumulative_stats = cumulative;
        snap->current_stats = current;

        auto const &seen = result.seen_ids;
        // Prune internal caches
        for (auto it = revisions_.begin(); it != revisions_.end();)
        {
            if (!seen.contains(it->first))
                it = revisions_.erase(it);
            else
                ++it;
        }

        std::lock_guard<std::mutex> l(data_mutex_);
        for (auto it = seed_limits_.begin(); it != seed_limits_.end();)
        {
            if (!seen.contains(it->first))
                it = seed_limits_.erase(it);
            else
                ++it;
        }
    }

    if (!pending_pause_ids.empty())
    {
        std::sort(pending_pause_ids.begin(), pending_pause_ids.end());
        pending_pause_ids.erase(
            std::unique(pending_pause_ids.begin(), pending_pause_ids.end()),
            pending_pause_ids.end());
        perform_action(pending_pause_ids, [](auto &handle) { handle.pause(); });
    }
}

void SessionService::check_speed_limits(bool force)
{
    // Reconfigure the running libtorrent session with the current settings.
    // This applies rate limits (respecting Alt Speed schedule) as well as
    // network, proxy, queue and encryption settings so RPC-driven changes
    // are applied immediately when called with `force=true`.
    auto settings = config_->get();
    bool active = SettingsManager::should_use_alt_speed(
        settings, std::chrono::system_clock::now());

    if (!force && active == alt_speed_active_)
        return;
    alt_speed_active_ = active;

    libtorrent::settings_pack pack;

    // Rate limits (alt vs normal)
    SettingsManager::apply_rate_limits(
        active ? settings.alt_download_rate_limit_kbps
               : settings.download_rate_limit_kbps,
        active ? true : settings.download_rate_limit_enabled,
        active ? settings.alt_upload_rate_limit_kbps
               : settings.upload_rate_limit_kbps,
        active ? true : settings.upload_rate_limit_enabled, pack);

    // Apply other categories so changes via RPC take effect immediately
    SettingsManager::apply_network(settings, pack);
    SettingsManager::apply_queue(settings, pack);
    SettingsManager::apply_encryption(settings, pack);
    SettingsManager::apply_proxy(settings, pack);
    SettingsManager::apply_partfile(settings, pack);

    manager_->apply_settings(pack);
}

void SessionService::enforce_limits(int id, libtorrent::torrent_handle const &h,
                                    libtorrent::v2::torrent_status const &s,
                                    std::vector<int> *pending_pause_ids)
{
    std::lock_guard<std::mutex> l(data_mutex_);
    auto it = seed_limits_.find(id);
    if (it == seed_limits_.end())
        return;
    auto &lim = it->second;

    if (s.download_rate > 0 || s.upload_rate > 0)
        lim.last_activity = std::chrono::steady_clock::now();

    bool finished =
        (s.state == libtorrent::v2::torrent_status::state_t::finished ||
         s.state == libtorrent::v2::torrent_status::state_t::seeding);
    if (!finished)
        return;

    auto mark_pause = [id, pending_pause_ids]()
    {
        if (!pending_pause_ids)
            return;
        auto exists =
            std::find(pending_pause_ids->begin(), pending_pause_ids->end(), id);
        if (exists == pending_pause_ids->end())
            pending_pause_ids->push_back(id);
    };

    if (lim.ratio_enabled && lim.ratio_limit && *lim.ratio_limit > 0.0)
    {
        double dl =
            static_cast<double>(std::max<std::int64_t>(s.all_time_download, 1));
        double ul = static_cast<double>(s.all_time_upload);
        if ((ul / dl) >= *lim.ratio_limit)
        {
            mark_pause();
            return;
        }
    }

    if (lim.idle_enabled && lim.idle_limit && *lim.idle_limit > 0)
    {
        auto now = std::chrono::steady_clock::now();
        auto idle_for = std::chrono::duration_cast<std::chrono::minutes>(
            now - lim.last_activity);
        if (idle_for.count() >= *lim.idle_limit)
        {
            mark_pause();
        }
    }
}

void SessionService::mark_dirty(int id)
{
    if (id > 0)
        revisions_[id] = next_revision_++;
}

std::uint64_t SessionService::ensure_revision(int id)
{
    if (!revisions_.count(id))
        revisions_[id] = next_revision_++;
    return revisions_[id];
}

int SessionService::get_rpc_id(std::string const &hash)
{
    if (auto id = manager_->id_for_hash(
            sha1_from_hex(hash).value_or(libtorrent::sha1_hash{})))
        return *id;
    return 0;
}

std::string SessionService::get_hash(int id)
{
    if (auto h = manager_->handle_for_id(id))
    {
        if (auto hash = tt::engine::hash_from_handle(*h))
            return *hash;
    }
    return std::string{};
}

} // namespace tt::engine
