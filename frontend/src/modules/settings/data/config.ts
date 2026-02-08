import defaultSettingsConfig from "@/modules/settings/data/default-settings.json";

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
    auto_open_ui: boolean;
    autorun_hidden: boolean;
    show_splash: boolean;
    splash_message: string;
    seedRatioLimit: number;
    seedRatioLimited: boolean;
    idleSeedingLimit: number;
    idleSeedingLimited: boolean;
    table_watermark_enabled: boolean;
    refresh_interval_ms: number;
    request_timeout_ms: number;
}

export type ConfigKey = keyof SettingsConfig;

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig =
    defaultSettingsConfig as SettingsConfig;
