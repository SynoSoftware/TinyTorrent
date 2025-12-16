#include "engine/SettingsManager.hpp"

#include <algorithm>
#include <libtorrent/alert.hpp>
#include <libtorrent/settings_pack.hpp>

namespace tt::engine
{

libtorrent::settings_pack
SettingsManager::build_settings_pack(CoreSettings const &s)
{
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::alert_mask,
                 libtorrent::alert::all_categories);
    pack.set_str(libtorrent::settings_pack::user_agent, "TinyTorrent/0.1.0");
    pack.set_str(libtorrent::settings_pack::listen_interfaces,
                 s.listen_interface);
    auto kbps_to_bytes = [](int limit_kbps, bool enabled) -> int
    {
        if (!enabled || limit_kbps <= 0)
            return 0;
        // libtorrent expects bytes/sec
        return static_cast<int>(limit_kbps * 1024 / 8);
    };
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
    // encryption
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

    pack.set_bool(libtorrent::settings_pack::enable_dht, s.dht_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_lsd, s.lpd_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                  s.utp_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                  s.utp_enabled);
    pack.set_int(libtorrent::settings_pack::alert_queue_size, 8192);
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
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  s.queue_stalled_enabled);

    // proxy
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

    return pack;
}

} // namespace tt::engine
