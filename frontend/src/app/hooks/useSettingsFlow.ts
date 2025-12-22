import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";

import type { RpcStatus } from "../../shared/types/rpc";
import type { TransmissionSessionSettings } from "../../services/rpc/types";
import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import {
    DEFAULT_SETTINGS_CONFIG,
    type SettingsConfig,
} from "../../modules/settings/data/config";

const USER_PREFERENCES_KEY = "tiny-torrent.user-preferences";
type PreferencePayload = Pick<
    SettingsConfig,
    "refresh_interval_ms" | "request_timeout_ms" | "table_watermark_enabled"
>;

const padTime = (value: number) => String(value).padStart(2, "0");
const minutesToTimeString = (time: number | undefined, fallback: string) => {
    if (time === undefined || time === null) return fallback;
    const hours = Math.floor(time / 60);
    const minutes = time % 60;
    return `${padTime(hours)}:${padTime(minutes)}`;
};
const timeStringToMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map((part) => Number(part));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return 0;
    }
    return hours * 60 + minutes;
};

const readUserPreferences = (): Partial<PreferencePayload> => {
    if (typeof window === "undefined") return {};
    try {
        const stored = window.localStorage.getItem(USER_PREFERENCES_KEY);
        if (!stored) return {};
        return JSON.parse(stored) as Partial<PreferencePayload>;
    } catch {
        return {};
    }
};

const mergeWithUserPreferences = (config: SettingsConfig): SettingsConfig => ({
    ...config,
    ...readUserPreferences(),
});

const persistUserPreferences = (config: SettingsConfig) => {
    if (typeof window === "undefined") return;
    const payload: PreferencePayload = {
        refresh_interval_ms: config.refresh_interval_ms,
        request_timeout_ms: config.request_timeout_ms,
        table_watermark_enabled: config.table_watermark_enabled,
    };
    window.localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(payload));
};

const mapSessionToConfig = (
    session: TransmissionSessionSettings
): SettingsConfig => ({
    ...DEFAULT_SETTINGS_CONFIG,
    peer_port: session["peer-port"] ?? DEFAULT_SETTINGS_CONFIG.peer_port,
    peer_port_random_on_start:
        session["peer-port-random-on-start"] ??
        DEFAULT_SETTINGS_CONFIG.peer_port_random_on_start,
    port_forwarding_enabled:
        session["port-forwarding-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.port_forwarding_enabled,
    encryption: session.encryption ?? DEFAULT_SETTINGS_CONFIG.encryption,
    speed_limit_down:
        session["speed-limit-down"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_down,
    speed_limit_down_enabled:
        session["speed-limit-down-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.speed_limit_down_enabled,
    speed_limit_up:
        session["speed-limit-up"] ?? DEFAULT_SETTINGS_CONFIG.speed_limit_up,
    speed_limit_up_enabled:
        session["speed-limit-up-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.speed_limit_up_enabled,
    alt_speed_down:
        session["alt-speed-down"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_down,
    alt_speed_up:
        session["alt-speed-up"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_up,
    alt_speed_time_enabled:
        session["alt-speed-time-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.alt_speed_time_enabled,
    alt_speed_begin: minutesToTimeString(
        session["alt-speed-time-begin"],
        DEFAULT_SETTINGS_CONFIG.alt_speed_begin
    ),
    alt_speed_end: minutesToTimeString(
        session["alt-speed-time-end"],
        DEFAULT_SETTINGS_CONFIG.alt_speed_end
    ),
    alt_speed_time_day:
        session["alt-speed-time-day"] ?? DEFAULT_SETTINGS_CONFIG.alt_speed_time_day,
    peer_limit_global:
        session["peer-limit-global"] ??
        DEFAULT_SETTINGS_CONFIG.peer_limit_global,
    peer_limit_per_torrent:
        session["peer-limit-per-torrent"] ??
        DEFAULT_SETTINGS_CONFIG.peer_limit_per_torrent,
    lpd_enabled: session["lpd-enabled"] ?? DEFAULT_SETTINGS_CONFIG.lpd_enabled,
    dht_enabled: session["dht-enabled"] ?? DEFAULT_SETTINGS_CONFIG.dht_enabled,
    pex_enabled: session["pex-enabled"] ?? DEFAULT_SETTINGS_CONFIG.pex_enabled,
    blocklist_url:
        session["blocklist-url"] ?? DEFAULT_SETTINGS_CONFIG.blocklist_url,
    blocklist_enabled:
        session["blocklist-enabled"] ?? DEFAULT_SETTINGS_CONFIG.blocklist_enabled,
    download_dir:
        session["download-dir"] ?? DEFAULT_SETTINGS_CONFIG.download_dir,
    incomplete_dir_enabled:
        session["incomplete-dir-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.incomplete_dir_enabled,
    incomplete_dir:
        session["incomplete-dir"] ?? DEFAULT_SETTINGS_CONFIG.incomplete_dir,
    rename_partial_files:
        session["rename-partial-files"] ??
        DEFAULT_SETTINGS_CONFIG.rename_partial_files,
    start_added_torrents:
        session["start-added-torrents"] ?? DEFAULT_SETTINGS_CONFIG.start_added_torrents,
    seedRatioLimit:
        session.seedRatioLimit ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimit,
    seedRatioLimited:
        session.seedRatioLimited ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimited,
    idleSeedingLimit:
        session["idle-seeding-limit"] ?? DEFAULT_SETTINGS_CONFIG.idleSeedingLimit,
    idleSeedingLimited:
        session["idle-seeding-limit-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.idleSeedingLimited,
    refresh_interval_ms: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
    request_timeout_ms: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
});

const mapConfigToSession = (
    config: SettingsConfig
): Partial<TransmissionSessionSettings> => {
    const settings: Partial<TransmissionSessionSettings> = {
        "peer-port": config.peer_port,
        "peer-port-random-on-start": config.peer_port_random_on_start,
        "port-forwarding-enabled": config.port_forwarding_enabled,
        encryption: config.encryption,
        "speed-limit-down": config.speed_limit_down,
        "speed-limit-down-enabled": config.speed_limit_down_enabled,
        "speed-limit-up": config.speed_limit_up,
        "speed-limit-up-enabled": config.speed_limit_up_enabled,
        "alt-speed-down": config.alt_speed_down,
        "alt-speed-up": config.alt_speed_up,
        "alt-speed-time-enabled": config.alt_speed_time_enabled,
        "alt-speed-time-begin": timeStringToMinutes(config.alt_speed_begin),
        "alt-speed-time-end": timeStringToMinutes(config.alt_speed_end),
        "alt-speed-time-day": config.alt_speed_time_day,
        "peer-limit-global": config.peer_limit_global,
        "peer-limit-per-torrent": config.peer_limit_per_torrent,
        "lpd-enabled": config.lpd_enabled,
        "dht-enabled": config.dht_enabled,
        "pex-enabled": config.pex_enabled,
        "blocklist-url": config.blocklist_url,
        "blocklist-enabled": config.blocklist_enabled,
        "rename-partial-files": config.rename_partial_files,
        "start-added-torrents": config.start_added_torrents,
        seedRatioLimit: config.seedRatioLimit,
        seedRatioLimited: config.seedRatioLimited,
        "idle-seeding-limit": config.idleSeedingLimit,
        "idle-seeding-limit-enabled": config.idleSeedingLimited,
    };

    if (config.download_dir.trim()) {
        settings["download-dir"] = config.download_dir;
    }

    if (config.incomplete_dir.trim()) {
        settings["incomplete-dir"] = config.incomplete_dir;
        settings["incomplete-dir-enabled"] = config.incomplete_dir_enabled;
    } else if (!config.incomplete_dir_enabled) {
        settings["incomplete-dir-enabled"] = false;
    }

    return settings;
};

interface UseSettingsFlowParams {
    torrentClient: EngineAdapter;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
    reportRpcStatus: (status: RpcStatus) => void;
    rpcStatus: RpcStatus;
    isSettingsOpen: boolean;
    isMountedRef: MutableRefObject<boolean>;
    updateRequestTimeout: (timeoutMs: number) => void;
}

export function useSettingsFlow({
    torrentClient,
    refreshTorrentsRef,
    refreshSessionStatsDataRef,
    refreshSessionSettings,
    reportRpcStatus,
    rpcStatus,
    isSettingsOpen,
    isMountedRef,
    updateRequestTimeout,
}: UseSettingsFlowParams) {
    const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>(() =>
        mergeWithUserPreferences({ ...DEFAULT_SETTINGS_CONFIG })
    );
    const [isSettingsSaving, setIsSettingsSaving] = useState(false);
    const [settingsLoadError, setSettingsLoadError] = useState(false);

    useEffect(() => {
        updateRequestTimeout(settingsConfig.request_timeout_ms);
    }, [settingsConfig.request_timeout_ms, updateRequestTimeout]);

    useEffect(() => {
        if (!isSettingsOpen || rpcStatus !== "connected") return;
        let active = true;
        const loadSettings = async () => {
            if (active) {
                setSettingsLoadError(false);
            }
            try {
                const session = await refreshSessionSettings();
                if (active) {
                    setSettingsConfig(
                        mergeWithUserPreferences(mapSessionToConfig(session))
                    );
                }
            } catch {
                if (active) {
                    setSettingsLoadError(true);
                }
            }
        };
        void loadSettings();
        return () => {
            active = false;
        };
    }, [isSettingsOpen, refreshSessionSettings, rpcStatus]);

    const handleSaveSettings = useCallback(
        async (config: SettingsConfig) => {
            setIsSettingsSaving(true);
            try {
                if (!torrentClient.updateSessionSettings) {
                    throw new Error(
                        "Session settings not supported by this client"
                    );
                }
                await torrentClient.updateSessionSettings(
                    mapConfigToSession(config)
                );
                if (isMountedRef.current) {
                    setSettingsConfig(config);
                    persistUserPreferences(config);
                    await refreshTorrentsRef.current();
                    await refreshSessionStatsDataRef.current();
                }
            } catch {
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
                throw new Error("Unable to save settings");
            } finally {
                if (isMountedRef.current) {
                    setIsSettingsSaving(false);
                }
            }
        },
        [
            refreshSessionStatsDataRef,
            refreshTorrentsRef,
            reportRpcStatus,
            torrentClient,
            isMountedRef,
        ]
    );

    const handleTestPort = useCallback(async () => {
        try {
            if (!torrentClient.testPort) {
                throw new Error("Port test not supported");
            }
            await torrentClient.testPort();
        } catch {
            if (isMountedRef.current) {
                reportRpcStatus("error");
            }
        }
    }, [reportRpcStatus, torrentClient, isMountedRef]);

    return {
        settingsConfig,
        isSettingsSaving,
        handleSaveSettings,
        handleTestPort,
        setSettingsConfig,
        settingsLoadError,
    };
}
