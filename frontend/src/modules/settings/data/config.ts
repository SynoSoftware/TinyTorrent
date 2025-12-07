export interface SettingsConfig {
    peer_port: number;
    peer_port_random_on_start: boolean;
    port_forwarding_enabled: boolean;
    encryption: "required" | "preferred" | "tolerated";
    speed_limit_down: number;
    speed_limit_down_enabled: boolean;
    speed_limit_up: number;
    speed_limit_up_enabled: boolean;
    alt_speed_down: number;
    alt_speed_up: number;
    alt_speed_time_enabled: boolean;
    alt_speed_begin: string;
    alt_speed_end: string;
    alt_speed_time_day: number;
    peer_limit_global: number;
    peer_limit_per_torrent: number;
    lpd_enabled: boolean;
    dht_enabled: boolean;
    pex_enabled: boolean;
    blocklist_url: string;
    blocklist_enabled: boolean;
    download_dir: string;
    incomplete_dir_enabled: boolean;
    incomplete_dir: string;
    rename_partial_files: boolean;
    start_added_torrents: boolean;
    seedRatioLimit: number;
    seedRatioLimited: boolean;
    idleSeedingLimit: number;
    idleSeedingLimited: boolean;
    refresh_interval_ms: number;
    request_timeout_ms: number;
}

export type ConfigKey = keyof SettingsConfig;

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
    peer_port: 51413,
    peer_port_random_on_start: false,
    port_forwarding_enabled: true,
    encryption: "preferred",
    speed_limit_down: 15000,
    speed_limit_down_enabled: true,
    speed_limit_up: 500,
    speed_limit_up_enabled: false,
    alt_speed_down: 1000,
    alt_speed_up: 50,
    alt_speed_time_enabled: false,
    alt_speed_begin: "08:00",
    alt_speed_end: "17:00",
    alt_speed_time_day: 127,
    peer_limit_global: 200,
    peer_limit_per_torrent: 50,
    lpd_enabled: true,
    dht_enabled: true,
    pex_enabled: true,
    blocklist_url: "http://list.iblocklist.com/?list=bt_level1",
    blocklist_enabled: true,
    download_dir: "/Downloads/Torrents",
    incomplete_dir_enabled: true,
    incomplete_dir: "/Downloads/Incomplete",
    rename_partial_files: true,
    start_added_torrents: true,
    seedRatioLimit: 2.0,
    seedRatioLimited: true,
    idleSeedingLimit: 30,
    idleSeedingLimited: false,
    refresh_interval_ms: 4000,
    request_timeout_ms: 10000,
};
