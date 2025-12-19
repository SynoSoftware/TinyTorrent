#include "engine/SettingsManager.hpp"

#include "libtorrent/partfile_extension.hpp"
#include "utils/Log.hpp"
#include "utils/Version.hpp"
#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <libtorrent/alert.hpp>
#include <libtorrent/settings_pack.hpp>
#include <string>

namespace tt::engine
{

namespace
{
__declspec(noinline) void set_user_agent(libtorrent::settings_pack &pack)
{
    static std::string const user_agent = tt::version::kUserAgentVersion;
    pack.set_str(libtorrent::settings_pack::user_agent, user_agent);
}

constexpr char const kPartfileExtension[] = ".!tt";
constexpr char const kDefaultPartfileExtension[] = ".part";
} // namespace

libtorrent::settings_pack
SettingsManager::build_settings_pack(CoreSettings const &s)
{
#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
    std::fprintf(stderr,
                 "[D diag] listen_interface.len=%zu proxy_hostname.len=%zu "
                 "proxy_username.len=%zu\n",
                 s.listen_interface.size(), s.proxy_hostname.size(),
                 s.proxy_username.size());
#endif
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::alert_mask,
                 libtorrent::alert::all_categories);
    set_user_agent(pack);
    pack.set_str(libtorrent::settings_pack::listen_interfaces,
                 s.listen_interface);
    pack.set_int(libtorrent::settings_pack::download_rate_limit,
                 kbps_to_bytes(s.download_rate_limit_kbps,
                               s.download_rate_limit_enabled));
    pack.set_int(
        libtorrent::settings_pack::upload_rate_limit,
        kbps_to_bytes(s.upload_rate_limit_kbps, s.upload_rate_limit_enabled));
    if (s.peer_limit > 0)
    {
        pack.set_int(libtorrent::settings_pack::connections_limit,
                     s.peer_limit);
    }
    if (s.peer_limit_per_torrent > 0)
    {
        pack.set_int(libtorrent::settings_pack::unchoke_slots_limit,
                     s.peer_limit_per_torrent);
    }
    apply_encryption(s, pack);
    apply_network(s, pack);
    pack.set_int(libtorrent::settings_pack::alert_queue_size, 8192);
    pack.set_int(libtorrent::settings_pack::hashing_threads,
                 std::max(1, s.hashing_threads));
#if TORRENT_ABI_VERSION <= 1
    pack.set_int(libtorrent::settings_pack::cache_size,
                 std::max(0, s.disk_cache_mb) * 1024 * 1024);
#else
    pack.set_int(libtorrent::settings_pack::deprecated_cache_size,
                 std::max(0, s.disk_cache_mb) * 1024 * 1024);
#endif
    if (s.download_queue_size > 0)
    {
        pack.set_int(libtorrent::settings_pack::active_downloads,
                     s.download_queue_size);
    }
    if (s.seed_queue_size > 0)
    {
        pack.set_int(libtorrent::settings_pack::active_seeds,
                     s.seed_queue_size);
    }
    {
        int active_downloads =
            s.download_queue_size > 0 ? s.download_queue_size : 0;
        int active_seeds = s.seed_queue_size > 0 ? s.seed_queue_size : 0;
        int active_limit = active_downloads + active_seeds;
        if (active_limit > 0)
        {
            pack.set_int(libtorrent::settings_pack::active_limit, active_limit);
        }
    }
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  s.queue_stalled_enabled);

    apply_proxy(s, pack);
    apply_partfile(s, pack);

    return pack;
}

int SettingsManager::kbps_to_bytes(int limit_kbps, bool enabled)
{
    if (!enabled || limit_kbps <= 0)
    {
        return 0;
    }
    return static_cast<int>(limit_kbps * 1024);
}

void SettingsManager::apply_encryption(CoreSettings const &s,
                                       libtorrent::settings_pack &pack,
                                       libtorrent::settings_pack *current)
{
    using namespace libtorrent;
    settings_pack::enc_policy policy = settings_pack::enc_policy::pe_enabled;
    settings_pack::enc_level level = settings_pack::enc_level::pe_both;
    bool prefer_rc4 = false;
    switch (s.encryption)
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
    if (current)
    {
        current->set_int(settings_pack::out_enc_policy,
                         static_cast<int>(policy));
        current->set_int(settings_pack::in_enc_policy,
                         static_cast<int>(policy));
        current->set_int(settings_pack::allowed_enc_level,
                         static_cast<int>(level));
        current->set_bool(settings_pack::prefer_rc4, prefer_rc4);
    }
}

void SettingsManager::apply_network(CoreSettings const &s,
                                    libtorrent::settings_pack &pack,
                                    libtorrent::settings_pack *current)
{
    pack.set_bool(libtorrent::settings_pack::enable_dht, s.dht_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_lsd, s.lpd_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                  s.utp_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                  s.utp_enabled);
    if (current)
    {
        current->set_bool(libtorrent::settings_pack::enable_dht, s.dht_enabled);
        current->set_bool(libtorrent::settings_pack::enable_lsd, s.lpd_enabled);
        current->set_bool(libtorrent::settings_pack::enable_incoming_utp,
                          s.utp_enabled);
        current->set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                          s.utp_enabled);
    }
}

void SettingsManager::apply_proxy(CoreSettings const &s,
                                  libtorrent::settings_pack &pack,
                                  libtorrent::settings_pack *current)
{
    pack.set_int(libtorrent::settings_pack::proxy_type, s.proxy_type);
    pack.set_str(libtorrent::settings_pack::proxy_hostname, s.proxy_hostname);
    pack.set_int(libtorrent::settings_pack::proxy_port, s.proxy_port);
    pack.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                  s.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                  s.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_hostnames,
                  !s.proxy_hostname.empty());
    pack.set_str(libtorrent::settings_pack::proxy_username,
                 s.proxy_auth_enabled ? s.proxy_username : "");
    pack.set_str(libtorrent::settings_pack::proxy_password,
                 s.proxy_auth_enabled ? s.proxy_password : "");

    if (current)
    {
        current->set_int(libtorrent::settings_pack::proxy_type, s.proxy_type);
        current->set_str(libtorrent::settings_pack::proxy_hostname,
                         s.proxy_hostname);
        current->set_int(libtorrent::settings_pack::proxy_port, s.proxy_port);
        current->set_bool(libtorrent::settings_pack::proxy_peer_connections,
                          s.proxy_peer_connections);
        current->set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                          s.proxy_peer_connections);
        current->set_bool(libtorrent::settings_pack::proxy_hostnames,
                          !s.proxy_hostname.empty());
        current->set_str(libtorrent::settings_pack::proxy_username,
                         s.proxy_auth_enabled ? s.proxy_username : "");
        current->set_str(libtorrent::settings_pack::proxy_password,
                         s.proxy_auth_enabled ? s.proxy_password : "");
    }
}

void SettingsManager::apply_partfile(CoreSettings const &s,
                                     libtorrent::settings_pack &pack,
                                     libtorrent::settings_pack *current)
{
    auto const extension =
        s.rename_partial_files ? kPartfileExtension : kDefaultPartfileExtension;
    (void)current;
    libtorrent::tt::set_partfile_extension(extension);
}

void SettingsManager::apply_queue(CoreSettings const &s,
                                  libtorrent::settings_pack &pack,
                                  libtorrent::settings_pack *current)
{
    pack.set_int(libtorrent::settings_pack::active_downloads,
                 s.download_queue_size);
    pack.set_int(libtorrent::settings_pack::active_seeds, s.seed_queue_size);
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  s.queue_stalled_enabled);
    if (current)
    {
        current->set_int(libtorrent::settings_pack::active_downloads,
                         s.download_queue_size);
        current->set_int(libtorrent::settings_pack::active_seeds,
                         s.seed_queue_size);
        current->set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                          s.queue_stalled_enabled);
        int active_downloads =
            s.download_queue_size > 0 ? s.download_queue_size : 0;
        int active_seeds = s.seed_queue_size > 0 ? s.seed_queue_size : 0;
        int active_limit = active_downloads + active_seeds;
        if (active_limit > 0)
        {
            current->set_int(libtorrent::settings_pack::active_limit,
                             active_limit);
        }
    }
}

bool SettingsManager::should_use_alt_speed(
    CoreSettings const &settings, std::chrono::system_clock::time_point now)
{
    auto to_local = [](std::chrono::system_clock::time_point tp) -> std::tm
    {
        std::time_t t = std::chrono::system_clock::to_time_t(tp);
        std::tm out{};
#if defined(_WIN32)
        localtime_s(&out, &t);
#else
        localtime_r(&t, &out);
#endif
        return out;
    };

    if (settings.alt_speed_enabled)
    {
        return true;
    }
    if (!settings.alt_speed_time_enabled)
    {
        return false;
    }
    int begin = std::clamp(settings.alt_speed_time_begin, 0, 24 * 60 - 1);
    int end = std::clamp(settings.alt_speed_time_end, 0, 24 * 60 - 1);
    auto tm = to_local(now);
    int mask = settings.alt_speed_time_day;
    if (mask == 0)
    {
        mask = 0x7F;
    }
    if ((mask & (1 << tm.tm_wday)) == 0)
    {
        return false;
    }
    int minute = tm.tm_hour * 60 + tm.tm_min;
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

void SettingsManager::apply_rate_limits(int download_kbps,
                                        bool download_enabled, int upload_kbps,
                                        bool upload_enabled,
                                        libtorrent::settings_pack &pack,
                                        libtorrent::settings_pack *current)
{
    int download_bytes = kbps_to_bytes(download_kbps, download_enabled);
    int upload_bytes = kbps_to_bytes(upload_kbps, upload_enabled);
    pack.set_int(libtorrent::settings_pack::download_rate_limit,
                 download_bytes);
    pack.set_int(libtorrent::settings_pack::upload_rate_limit, upload_bytes);
    if (current)
    {
        current->set_int(libtorrent::settings_pack::download_rate_limit,
                         download_bytes);
        current->set_int(libtorrent::settings_pack::upload_rate_limit,
                         upload_bytes);
    }
}

SettingsManager::ApplyResult
SettingsManager::apply_update(CoreSettings settings,
                              SessionUpdate const &update)
{
    ApplyResult result{};
    auto &s = settings;

    if (update.alt_speed_down_kbps)
    {
        s.alt_download_rate_limit_kbps = *update.alt_speed_down_kbps;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_up_kbps)
    {
        s.alt_upload_rate_limit_kbps = *update.alt_speed_up_kbps;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_enabled)
    {
        s.alt_speed_enabled = *update.alt_speed_enabled;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_time_enabled)
    {
        s.alt_speed_time_enabled = *update.alt_speed_time_enabled;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_time_begin)
    {
        s.alt_speed_time_begin = *update.alt_speed_time_begin;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_time_end)
    {
        s.alt_speed_time_end = *update.alt_speed_time_end;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.alt_speed_time_day)
    {
        s.alt_speed_time_day = *update.alt_speed_time_day;
        result.alt_changed = true;
        result.persist = true;
    }
    if (update.disk_cache_mb)
    {
        s.disk_cache_mb = std::max(1, *update.disk_cache_mb);
        result.persist = true;
    }
    if (update.hashing_threads)
    {
        s.hashing_threads = std::max(1, *update.hashing_threads);
        result.persist = true;
    }
    if (update.encryption)
    {
        s.encryption = *update.encryption;
        result.encryption_changed = true;
        result.persist = true;
    }
    if (update.dht_enabled)
    {
        s.dht_enabled = *update.dht_enabled;
        result.network_changed = true;
        result.persist = true;
    }
    if (update.lpd_enabled)
    {
        s.lpd_enabled = *update.lpd_enabled;
        result.network_changed = true;
        result.persist = true;
    }
    if (update.utp_enabled)
    {
        s.utp_enabled = *update.utp_enabled;
        result.network_changed = true;
        result.persist = true;
    }
    if (update.pex_enabled)
    {
        s.pex_enabled = *update.pex_enabled;
        result.pex_changed = true;
        result.persist = true;
    }
    if (update.download_queue_size)
    {
        s.download_queue_size = *update.download_queue_size;
        result.queue_changed = true;
        result.persist = true;
    }
    if (update.seed_queue_size)
    {
        s.seed_queue_size = *update.seed_queue_size;
        result.queue_changed = true;
        result.persist = true;
    }
    if (update.queue_stalled_enabled)
    {
        s.queue_stalled_enabled = *update.queue_stalled_enabled;
        result.queue_changed = true;
        result.persist = true;
    }
    if (update.queue_stalled_minutes)
    {
        s.queue_stalled_minutes = std::max(0, *update.queue_stalled_minutes);
        result.queue_changed = true;
        result.persist = true;
    }
    if (update.incomplete_dir)
    {
        s.incomplete_dir = *update.incomplete_dir;
        result.persist = true;
    }
    if (update.incomplete_dir_enabled)
    {
        s.incomplete_dir_enabled = *update.incomplete_dir_enabled;
        result.persist = true;
    }
    if (update.watch_dir)
    {
        s.watch_dir = *update.watch_dir;
        result.persist = true;
        if (s.watch_dir_enabled && !s.watch_dir.empty())
        {
            std::filesystem::create_directories(s.watch_dir);
        }
    }
    if (update.watch_dir_enabled)
    {
        s.watch_dir_enabled = *update.watch_dir_enabled;
        result.persist = true;
        if (s.watch_dir_enabled && !s.watch_dir.empty())
        {
            std::filesystem::create_directories(s.watch_dir);
        }
    }
    if (update.rename_partial_files)
    {
        s.rename_partial_files = *update.rename_partial_files;
        result.persist = true;
    }
    if (update.seed_ratio_limit)
    {
        s.seed_ratio_limit = *update.seed_ratio_limit;
        result.persist = true;
    }
    if (update.seed_ratio_enabled)
    {
        s.seed_ratio_enabled = *update.seed_ratio_enabled;
        result.persist = true;
    }
    if (update.seed_idle_limit)
    {
        s.seed_idle_limit_minutes = *update.seed_idle_limit;
        result.persist = true;
    }
    if (update.seed_idle_enabled)
    {
        s.seed_idle_enabled = *update.seed_idle_enabled;
        result.persist = true;
    }
    if (update.proxy_type)
    {
        s.proxy_type = *update.proxy_type;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_hostname)
    {
        s.proxy_hostname = *update.proxy_hostname;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_port)
    {
        s.proxy_port = *update.proxy_port;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_auth_enabled)
    {
        s.proxy_auth_enabled = *update.proxy_auth_enabled;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_username)
    {
        s.proxy_username = *update.proxy_username;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_password)
    {
        s.proxy_password = *update.proxy_password;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.proxy_peer_connections)
    {
        s.proxy_peer_connections = *update.proxy_peer_connections;
        result.proxy_changed = true;
        result.persist = true;
    }
    if (update.history_enabled)
    {
        bool new_value = *update.history_enabled;
        if (s.history_enabled != new_value)
        {
            result.flush_history_after = !new_value;
            result.configure_history_after =
                new_value && s.history_interval_seconds > 0;
            s.history_enabled = new_value;
            result.persist = true;
        }
    }
    if (update.history_interval_seconds)
    {
        int interval = std::max(60, *update.history_interval_seconds);
        if (s.history_interval_seconds != interval)
        {
            result.flush_history_after = true;
            result.configure_history_after = true;
            s.history_interval_seconds = interval;
            result.persist = true;
        }
    }
    if (update.history_retention_days)
    {
        int retention = std::max(0, *update.history_retention_days);
        if (s.history_retention_days != retention)
        {
            s.history_retention_days = retention;
            result.persist = true;
        }
    }

    result.history_config.enabled = s.history_enabled;
    result.history_config.interval_seconds =
        std::max(60, s.history_interval_seconds);
    result.history_config.retention_days = s.history_retention_days;

    result.settings = s;
    return result;
}

} // namespace tt::engine
