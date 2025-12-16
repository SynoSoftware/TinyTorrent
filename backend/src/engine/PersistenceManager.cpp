#include "engine/PersistenceManager.hpp"

#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

#include <fstream>
#include <iterator>

namespace
{

tt::engine::TorrentAddRequest make_add_request(
    tt::storage::PersistedTorrent const &entry,
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

PersistenceManager::PersistenceManager(std::filesystem::path path)
    : database_(std::make_unique<storage::Database>(std::move(path)))
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
    database_->set_setting("sessionCount", std::to_string(stats.session_count));
    return stats;
}

bool PersistenceManager::persist_session_stats(SessionStatistics const &stats)
{
    if (!is_valid())
        return false;
    bool success = true;
    success &= database_->set_setting("secondsActive",
                                      std::to_string(stats.seconds_active));
    success &= database_->set_setting("uploadedBytes",
                                      std::to_string(stats.uploaded_bytes));
    success &= database_->set_setting("downloadedBytes",
                                      std::to_string(stats.downloaded_bytes));
    return success;
}

bool PersistenceManager::persist_settings(CoreSettings const &settings)
{
    if (!is_valid())
        return false;
    if (!database_->begin_transaction())
        return false;

    bool success = true;
    auto set_bool = [&](char const *key, bool value)
    { success = success && database_->set_setting(key, value ? "1" : "0"); };
    auto set_int = [&](char const *key, int value)
    {
        success = success && database_->set_setting(key, std::to_string(value));
    };
    auto set_double = [&](char const *key, double value)
    {
        success = success && database_->set_setting(key, std::to_string(value));
    };
    auto set_string = [&](char const *key, std::string const &value)
    { success = success && database_->set_setting(key, value); };

    set_string("listenInterface", settings.listen_interface);
    set_int("listenPort", 0);
    set_bool("historyEnabled", settings.history_enabled);
    set_int("historyInterval", settings.history_interval_seconds);
    set_int("historyRetentionDays", settings.history_retention_days);
    set_bool("altSpeedEnabled", settings.alt_speed_enabled);
    set_bool("altSpeedTime", settings.alt_speed_time_enabled);
    set_int("altSpeedTimeBegin", settings.alt_speed_time_begin);
    set_int("altSpeedTimeEnd", settings.alt_speed_time_end);
    set_int("altSpeedTimeDay", settings.alt_speed_time_day);
    set_double("altSpeedDownload", settings.alt_download_rate_limit_kbps);
    set_double("altSpeedUpload", settings.alt_upload_rate_limit_kbps);
    set_double("seedRatioLimit", settings.seed_ratio_limit);
    set_bool("seedRatioEnabled", settings.seed_ratio_enabled);
    set_bool("seedIdleEnabled", settings.seed_idle_enabled);
    set_int("seedIdleLimit", settings.seed_idle_limit_minutes);
    set_int("peerLimit", settings.peer_limit);
    set_int("peerLimitPerTorrent", settings.peer_limit_per_torrent);
    set_bool("dhtEnabled", settings.dht_enabled);
    set_bool("pexEnabled", settings.pex_enabled);
    set_bool("lpdEnabled", settings.lpd_enabled);
    set_bool("utpEnabled", settings.utp_enabled);
    set_int("downloadQueueSize", settings.download_queue_size);
    set_int("seedQueueSize", settings.seed_queue_size);
    set_bool("queueStalledEnabled", settings.queue_stalled_enabled);
    set_string("downloadPath", settings.download_path.string());
    set_string("incompleteDir", settings.incomplete_dir.string());
    set_bool("incompleteDirEnabled", settings.incomplete_dir_enabled);
    set_string("watchDir", settings.watch_dir.string());
    set_bool("watchDirEnabled", settings.watch_dir_enabled);
    set_int("proxyType", settings.proxy_type);
    set_string("proxyHost", settings.proxy_hostname);
    set_int("proxyPort", settings.proxy_port);
    set_bool("proxyAuthEnabled", settings.proxy_auth_enabled);
    set_string("proxyUsername", settings.proxy_username);
    set_string("proxyPassword", settings.proxy_password);
    set_bool("proxyPeerConnections", settings.proxy_peer_connections);
    if (!success)
    {
        database_->rollback_transaction();
        return false;
    }
    return database_->commit_transaction();
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
        database_->upsert_torrent(torrent);
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
        database_->delete_torrent(hash);
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
        database_->update_save_path(hash, path);
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
        database_->update_rpc_id(hash, rpc_id);
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
        database_->update_metadata(hash, path, metadata);
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
        database_->update_resume_data(hash, data);
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
        database_->update_labels(hash, labels);
}

void PersistenceManager::set_labels(std::string const &hash,
                                    std::vector<std::string> const &labels)
{
    if (hash.empty())
    {
        return;
    }

    auto serialized = labels.empty() ? std::string{}
                                     : storage::serialize_label_list(labels);
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