#include "engine/PersistenceManager.hpp"

#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

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

std::vector<storage::PersistedTorrent> PersistenceManager::load_torrents() const
{
    if (!is_valid())
    {
        return {};
    }
    return database_->load_torrents();
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
    {
        return false;
    }
    bool success = true;
    success =
        success && database_->set_setting("secondsActive",
                                          std::to_string(stats.seconds_active));
    success =
        success && database_->set_setting("uploadedBytes",
                                          std::to_string(stats.uploaded_bytes));
    success = success &&
              database_->set_setting("downloadedBytes",
                                     std::to_string(stats.downloaded_bytes));
    return success;
}

bool PersistenceManager::persist_settings(CoreSettings const &settings)
{
    if (!is_valid())
    {
        return false;
    }
    if (!database_->begin_transaction())
    {
        TT_LOG_INFO("failed to begin settings transaction");
        return false;
    }
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

bool PersistenceManager::upsert_torrent(
    storage::PersistedTorrent const &torrent)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->upsert_torrent(torrent);
}

bool PersistenceManager::delete_torrent(std::string const &hash)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->delete_torrent(hash);
}

bool PersistenceManager::update_save_path(std::string const &hash,
                                          std::string const &path)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->update_save_path(hash, path);
}

bool PersistenceManager::update_rpc_id(std::string const &hash, int rpc_id)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->update_rpc_id(hash, rpc_id);
}

bool PersistenceManager::update_metadata(
    std::string const &hash, std::string const &path,
    std::vector<std::uint8_t> const &metadata)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->update_metadata(hash, path, metadata);
}

bool PersistenceManager::update_resume_data(
    std::string const &hash, std::vector<std::uint8_t> const &data)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->update_resume_data(hash, data);
}

std::optional<std::vector<std::uint8_t>>
PersistenceManager::resume_data(std::string const &hash) const
{
    if (!is_valid())
    {
        return std::nullopt;
    }
    return database_->resume_data(hash);
}

bool PersistenceManager::update_labels(std::string const &hash,
                                       std::string const &labels)
{
    if (!is_valid())
    {
        return false;
    }
    return database_->update_labels(hash, labels);
}

std::uint64_t
PersistenceManager::read_uint64_setting(std::string const &key) const
{
    if (!is_valid())
    {
        return 0;
    }
    if (auto value = database_->get_setting(key); value)
    {
        try
        {
            return static_cast<std::uint64_t>(std::stoull(*value));
        }
        catch (...)
        {
            return 0;
        }
    }
    return 0;
}

} // namespace tt::engine
