#include "engine/PersistenceManager.hpp"
#include "engine/AsyncTaskService.hpp"

#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

#include <fstream>
#include <iterator>

namespace
{

tt::engine::TorrentAddRequest
make_add_request(tt::storage::PersistedTorrent const &entry,
                 tt::engine::CoreSettings const &settings)
{
    tt::engine::TorrentAddRequest request;

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

} // namespace

namespace tt::engine
{

PersistenceManager::PersistenceManager(std::filesystem::path path,
                                       AsyncTaskService *task_service)
    : database_(std::make_shared<storage::Database>(std::move(path))),
      task_service_(task_service)
{
}

PersistenceManager::~PersistenceManager() = default;

bool PersistenceManager::is_valid() const noexcept
{
    return database_ != nullptr && database_->is_valid();
}

std::vector<storage::PersistedTorrent> PersistenceManager::load_torrents()
{
    if (!is_valid())
    {
        return {};
    }

    auto loaded = database_->load_torrents();

    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        torrents_.clear();
        labels_.clear();

        for (auto const &entry : loaded)
        {
            if (entry.hash.empty())
            {
                continue;
            }

            auto cached = entry;
            cached.resume_data.clear();
            cached.metainfo.clear();

            torrents_[entry.hash] = cached;

            if (!entry.labels.empty())
            {
                labels_[entry.hash] =
                    storage::deserialize_label_list(entry.labels);
            }
        }
    }

    return loaded;
}

std::vector<PersistenceManager::ReplayTorrent>
PersistenceManager::load_replay_torrents(CoreSettings const &settings)
{
    auto persisted = load_torrents();
    std::vector<ReplayTorrent> result;
    result.reserve(persisted.size());

    for (auto const &entry : persisted)
    {
        if (entry.hash.empty())
        {
            continue;
        }

        auto request = make_add_request(entry, settings);
        if (request.metainfo.empty() && !request.uri)
        {
            continue;
        }

        ReplayTorrent replay;
        replay.hash = entry.hash;
        replay.rpc_id = entry.rpc_id;
        replay.request = std::move(request);
        result.push_back(std::move(replay));
    }

    return result;
}

std::vector<std::pair<std::string, int>>
PersistenceManager::persisted_rpc_mappings() const
{
    std::vector<std::pair<std::string, int>> mappings;
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    mappings.reserve(torrents_.size());
    for (auto const &entry : torrents_)
    {
        if (entry.second.rpc_id > 0)
        {
            mappings.emplace_back(entry.first, entry.second.rpc_id);
        }
    }
    return mappings;
}
SessionStatistics PersistenceManager::load_session_statistics()
{
    SessionStatistics stats{};
    if (!is_valid())
    {
        ++stats.session_count;
        return stats;
    }
    stats.uploaded_bytes = read_uint64_setting("uploadedBytes");
    stats.downloaded_bytes = read_uint64_setting("downloadedBytes");
    stats.seconds_active = read_uint64_setting("secondsActive");
    stats.session_count = read_uint64_setting("sessionCount");
    ++stats.session_count;
    if (is_valid())
    {
        auto db = database_;
        auto val = std::to_string(stats.session_count);
        if (task_service_)
        {
            task_service_->submit([db, val]()
                                  { db->set_setting("sessionCount", val); });
        }
        else
        {
            db->set_setting("sessionCount", val);
        }
    }
    return stats;
}

bool PersistenceManager::persist_session_stats(SessionStatistics const &stats)
{
    if (!is_valid())
        return false;
    auto db = database_;
    auto seconds = std::to_string(stats.seconds_active);
    auto uploaded = std::to_string(stats.uploaded_bytes);
    auto downloaded = std::to_string(stats.downloaded_bytes);
    if (task_service_)
    {
        task_service_->submit(
            [db, seconds, uploaded, downloaded]()
            {
                db->set_setting("secondsActive", seconds);
                db->set_setting("uploadedBytes", uploaded);
                db->set_setting("downloadedBytes", downloaded);
            });
        return true;
    }
    bool success = true;
    success &= db->set_setting("secondsActive", seconds);
    success &= db->set_setting("uploadedBytes", uploaded);
    success &= db->set_setting("downloadedBytes", downloaded);
    return success;
}

bool PersistenceManager::persist_settings(CoreSettings const &settings)
{
    if (!is_valid())
        return false;
    auto db = database_;
    // Prepare copies for lambda capture
    auto s = settings;
    if (task_service_)
    {
        task_service_->submit([this, db, s]()
                              { persist_settings_impl(db, s); });
        return true;
    }
    return persist_settings_impl(db, settings);
}

bool PersistenceManager::persist_settings_impl(
    std::shared_ptr<storage::Database> db, CoreSettings const &s)
{
    if (!db || !db->is_valid())
        return false;
    if (!db->begin_transaction())
        return false;

    bool success = true;
    auto set_bool = [&](char const *key, bool value)
    { success = success && db->set_setting(key, value ? "1" : "0"); };
    auto set_int = [&](char const *key, int value)
    { success = success && db->set_setting(key, std::to_string(value)); };
    auto set_double = [&](char const *key, double value)
    { success = success && db->set_setting(key, std::to_string(value)); };
    auto set_string = [&](char const *key, std::string const &value)
    { success = success && db->set_setting(key, value); };

    set_string("listenInterface", s.listen_interface);
    set_int("listenPort", 0);
    set_bool("historyEnabled", s.history_enabled);
    set_int("historyInterval", s.history_interval_seconds);
    set_int("historyRetentionDays", s.history_retention_days);
    set_bool("altSpeedEnabled", s.alt_speed_enabled);
    set_bool("altSpeedTime", s.alt_speed_time_enabled);
    set_int("altSpeedTimeBegin", s.alt_speed_time_begin);
    set_int("altSpeedTimeEnd", s.alt_speed_time_end);
    set_int("altSpeedTimeDay", s.alt_speed_time_day);
    set_double("altSpeedDownload", s.alt_download_rate_limit_kbps);
    set_double("altSpeedUpload", s.alt_upload_rate_limit_kbps);
    set_double("seedRatioLimit", s.seed_ratio_limit);
    set_bool("seedRatioEnabled", s.seed_ratio_enabled);
    set_bool("seedIdleEnabled", s.seed_idle_enabled);
    set_int("seedIdleLimit", s.seed_idle_limit_minutes);
    set_int("peerLimit", s.peer_limit);
    set_int("peerLimitPerTorrent", s.peer_limit_per_torrent);
    set_bool("dhtEnabled", s.dht_enabled);
    set_bool("pexEnabled", s.pex_enabled);
    set_bool("lpdEnabled", s.lpd_enabled);
    set_bool("utpEnabled", s.utp_enabled);
    set_int("downloadQueueSize", s.download_queue_size);
    set_int("seedQueueSize", s.seed_queue_size);
    set_bool("queueStalledEnabled", s.queue_stalled_enabled);
    set_bool("renamePartialFiles", s.rename_partial_files);
    set_string("downloadPath", s.download_path.string());
    set_string("incompleteDir", s.incomplete_dir.string());
    set_bool("incompleteDirEnabled", s.incomplete_dir_enabled);
    set_string("watchDir", s.watch_dir.string());
    set_bool("watchDirEnabled", s.watch_dir_enabled);
    set_int("proxyType", s.proxy_type);
    set_string("proxyHost", s.proxy_hostname);
    set_int("proxyPort", s.proxy_port);
    set_bool("proxyAuthEnabled", s.proxy_auth_enabled);
    set_string("proxyUsername", s.proxy_username);
    set_string("proxyPassword", s.proxy_password);
    set_bool("proxyPeerConnections", s.proxy_peer_connections);
    set_int("engineDiskCache", s.disk_cache_mb);
    set_int("engineHashingThreads", s.hashing_threads);
    set_int("queueStalledMinutes", s.queue_stalled_minutes);
    if (!success)
    {
        db->rollback_transaction();
        return false;
    }
    return db->commit_transaction();
}

void PersistenceManager::add_or_update_torrent(
    storage::PersistedTorrent torrent)
{
    if (torrent.hash.empty())
    {
        return;
    }

    // 1. Sanitize for memory cache (don't store massive buffers in RAM)
    auto copy_for_cache = torrent;
    copy_for_cache.resume_data.clear();
    copy_for_cache.metainfo.clear();

    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        torrents_[torrent.hash] = copy_for_cache;

        if (!torrent.labels.empty())
        {
            labels_[torrent.hash] =
                storage::deserialize_label_list(torrent.labels);
        }
        else
        {
            labels_.erase(torrent.hash);
        }
    }

    // 2. Persist to DB
    if (is_valid())
    {
        auto db = database_;
        auto copy_for_db = torrent;
        if (task_service_)
        {
            TT_LOG_DEBUG(
                "persistence: enqueue upsert_torrent hash={} offload=1",
                copy_for_db.hash);
            task_service_->submit([db, copy_for_db]()
                                  { db->upsert_torrent(copy_for_db); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: upsert_torrent hash={} offload=0",
                         copy_for_db.hash);
            db->upsert_torrent(copy_for_db);
        }
    }
}
void PersistenceManager::remove_torrent(std::string const &hash)
{
    if (hash.empty())
        return;
    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        torrents_.erase(hash);
        labels_.erase(hash);
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        if (task_service_)
        {
            TT_LOG_DEBUG(
                "persistence: enqueue delete_torrent hash={} offload=1", h);
            task_service_->submit([db, h]() { db->delete_torrent(h); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: delete_torrent hash={} offload=0", h);
            db->delete_torrent(h);
        }
    }
}

void PersistenceManager::update_save_path(std::string const &hash,
                                          std::string const &path)
{
    if (hash.empty())
        return;
    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        if (auto it = torrents_.find(hash); it != torrents_.end())
        {
            it->second.save_path = path;
        }
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        auto p = path;
        if (task_service_)
        {
            TT_LOG_DEBUG(
                "persistence: enqueue update_save_path hash={} offload=1", h);
            task_service_->submit([db, h, p]() { db->update_save_path(h, p); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: update_save_path hash={} offload=0", h);
            db->update_save_path(h, p);
        }
    }
}

void PersistenceManager::update_rpc_id(std::string const &hash, int rpc_id)
{
    if (hash.empty())
        return;
    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        if (auto it = torrents_.find(hash); it != torrents_.end())
        {
            it->second.rpc_id = rpc_id;
        }
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        auto id = rpc_id;
        if (task_service_)
        {
            TT_LOG_DEBUG(
                "persistence: enqueue update_rpc_id hash={} id={} offload=1", h,
                id);
            task_service_->submit([db, h, id]() { db->update_rpc_id(h, id); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: update_rpc_id hash={} id={} offload=0",
                         h, id);
            db->update_rpc_id(h, id);
        }
    }
}

void PersistenceManager::update_metadata(
    std::string const &hash, std::string const &path,
    std::vector<std::uint8_t> const &metadata)
{
    if (hash.empty())
        return;
    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        if (auto it = torrents_.find(hash); it != torrents_.end())
        {
            it->second.metadata_path = path;
        }
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        auto p = path;
        auto m = metadata;
        if (task_service_)
        {
            TT_LOG_DEBUG("persistence: enqueue update_metadata hash={} path={} "
                         "offload=1",
                         h, p);
            task_service_->submit([db, h, p, m]()
                                  { db->update_metadata(h, p, m); });
        }
        else
        {
            TT_LOG_DEBUG(
                "persistence: update_metadata hash={} path={} offload=0", h, p);
            db->update_metadata(h, p, m);
        }
    }
}

void PersistenceManager::update_resume_data(
    std::string const &hash, std::vector<std::uint8_t> const &data)
{
    if (hash.empty())
    {
        return;
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        auto d = data;
        if (task_service_)
        {
            TT_LOG_DEBUG(
                "persistence: enqueue update_resume_data hash={} offload=1", h);
            task_service_->submit([db, h, d]()
                                  { db->update_resume_data(h, d); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: update_resume_data hash={} offload=0",
                         h);
            db->update_resume_data(h, d);
        }
    }
}

void PersistenceManager::update_labels(std::string const &hash,
                                       std::string const &labels)
{
    if (hash.empty())
        return;
    {
        std::unique_lock<std::shared_mutex> lock(cache_mutex_);
        if (auto it = torrents_.find(hash); it != torrents_.end())
        {
            it->second.labels = labels;
        }
        if (!labels.empty())
        {
            labels_[hash] = storage::deserialize_label_list(labels);
        }
        else
        {
            labels_.erase(hash);
        }
    }
    if (is_valid())
    {
        auto db = database_;
        auto h = hash;
        auto l = labels;
        if (task_service_)
        {
            TT_LOG_DEBUG("persistence: enqueue update_labels hash={} offload=1",
                         h);
            task_service_->submit([db, h, l]() { db->update_labels(h, l); });
        }
        else
        {
            TT_LOG_DEBUG("persistence: update_labels hash={} offload=0", h);
            db->update_labels(h, l);
        }
    }
}

void PersistenceManager::set_labels(std::string const &hash,
                                    std::vector<std::string> const &labels)
{
    if (hash.empty())
    {
        return;
    }

    auto serialized =
        labels.empty() ? std::string{} : storage::serialize_label_list(labels);
    update_labels(hash, serialized);
}

std::vector<std::string>
PersistenceManager::get_labels(std::string const &hash) const
{
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    if (auto it = labels_.find(hash); it != labels_.end())
    {
        return it->second;
    }
    return {};
}

std::filesystem::path PersistenceManager::get_save_path(
    std::string const &hash, std::filesystem::path const &default_path) const
{
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    if (auto it = torrents_.find(hash); it != torrents_.end())
    {
        if (it->second.save_path.has_value())
        {
            return std::filesystem::u8path(*it->second.save_path);
        }
    }
    return default_path;
}

std::optional<std::filesystem::path>
PersistenceManager::cached_save_path(std::string const &hash) const
{
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    if (auto it = torrents_.find(hash); it != torrents_.end())
    {
        if (it->second.save_path)
        {
            return std::filesystem::u8path(*it->second.save_path);
        }
    }
    return std::nullopt;
}

std::optional<int> PersistenceManager::get_rpc_id(std::string const &hash) const
{
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    if (auto it = torrents_.find(hash); it != torrents_.end())
    {
        return it->second.rpc_id;
    }
    return std::nullopt;
}

std::optional<std::uint64_t>
PersistenceManager::get_added_at(std::string const &hash) const
{
    if (hash.empty())
    {
        return std::nullopt;
    }
    std::shared_lock<std::shared_mutex> lock(cache_mutex_);
    if (auto it = torrents_.find(hash); it != torrents_.end())
    {
        if (it->second.added_at > 0)
        {
            return it->second.added_at;
        }
    }
    return std::nullopt;
}

std::uint64_t
PersistenceManager::read_uint64_setting(std::string const &key) const
{
    if (!is_valid())
        return 0;
    if (auto value = database_->get_setting(key); value)
    {
        try
        {
            return static_cast<std::uint64_t>(std::stoull(*value));
        }
        catch (...)
        {
        }
    }
    return 0;
}

} // namespace tt::engine
