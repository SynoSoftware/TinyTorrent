#pragma once

#include "engine/Core.hpp"

#include <libtorrent/settings_pack.hpp>

namespace tt::engine
{

class SettingsManager
{
  public:
    struct ApplyResult
    {
        CoreSettings settings;
        bool encryption_changed = false;
        bool network_changed = false;
        bool queue_changed = false;
        bool alt_changed = false;
        bool proxy_changed = false;
        bool pex_changed = false;
        bool persist = false;
        bool flush_history_after = false;
        bool configure_history_after = false;
        HistoryConfig history_config{};
    };

    // Build a libtorrent settings_pack from CoreSettings
    static libtorrent::settings_pack build_settings_pack(CoreSettings const &s);

    static void apply_encryption(CoreSettings const &s,
                                 libtorrent::settings_pack &pack,
                                 libtorrent::settings_pack *current = nullptr);

    static void apply_network(CoreSettings const &s,
                              libtorrent::settings_pack &pack,
                              libtorrent::settings_pack *current = nullptr);

    static void apply_proxy(CoreSettings const &s,
                            libtorrent::settings_pack &pack,
                            libtorrent::settings_pack *current = nullptr);

    static void apply_partfile(CoreSettings const &s,
                               libtorrent::settings_pack &pack,
                               libtorrent::settings_pack *current = nullptr);

    static void apply_queue(CoreSettings const &s,
                            libtorrent::settings_pack &pack,
                            libtorrent::settings_pack *current = nullptr);

    static int kbps_to_bytes(int limit_kbps, bool enabled);

    static bool should_use_alt_speed(CoreSettings const &settings,
                                     std::chrono::system_clock::time_point now);

    static void apply_rate_limits(int download_kbps, bool download_enabled,
                                  int upload_kbps, bool upload_enabled,
                                  libtorrent::settings_pack &pack,
                                  libtorrent::settings_pack *current = nullptr);

    // Apply an incremental SessionUpdate to settings and report side effects
    static ApplyResult apply_update(CoreSettings settings,
                                    SessionUpdate const &update);
};

} // namespace tt::engine
