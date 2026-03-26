import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { status } from "@/shared/status";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { isRpcCommandError } from "@/services/rpc/errors";
import {
    DEFAULT_SETTINGS_CONFIG,
    type SettingsConfig,
} from "@/modules/settings/data/config";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";
import type { EngineTestPortOutcome } from "@/app/providers/engineDomains";
import { infraLogger } from "@/shared/utils/infraLogger";
import {
    getVersionGatedSessionValue,
    getVersionGatedSettingsSupport,
    removeUnsupportedVersionGatedSettings,
} from "@/services/rpc/version-support";

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

const applyPreferencesToConfig = (
    config: SettingsConfig,
    preferences: {
        refreshIntervalMs: number;
        requestTimeoutMs: number;
        tableWatermarkEnabled: boolean;
    },
): SettingsConfig => ({
    ...config,
    refresh_interval_ms: preferences.refreshIntervalMs,
    request_timeout_ms: preferences.requestTimeoutMs,
    table_watermark_enabled: preferences.tableWatermarkEnabled,
});

type PreferencePayload = Partial<
    Pick<
        SettingsConfig,
        "refresh_interval_ms" | "request_timeout_ms" | "table_watermark_enabled"
    >
>;

const mapSessionToConfig = (
    session: TransmissionSessionSettings,
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
        DEFAULT_SETTINGS_CONFIG.alt_speed_begin,
    ),
    alt_speed_end: minutesToTimeString(
        session["alt-speed-time-end"],
        DEFAULT_SETTINGS_CONFIG.alt_speed_end,
    ),
    alt_speed_time_day:
        session["alt-speed-time-day"] ??
        DEFAULT_SETTINGS_CONFIG.alt_speed_time_day,
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
        session["blocklist-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.blocklist_enabled,
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
        session["start-added-torrents"] ??
        DEFAULT_SETTINGS_CONFIG.start_added_torrents,
    sequential_download:
        getVersionGatedSessionValue(session, "sequential_download") ??
        DEFAULT_SETTINGS_CONFIG.sequential_download,
    torrent_complete_verify_enabled:
        getVersionGatedSessionValue(session, "torrent_complete_verify_enabled") ??
        DEFAULT_SETTINGS_CONFIG.torrent_complete_verify_enabled,
    auto_open_ui: session.ui?.autoOpen ?? DEFAULT_SETTINGS_CONFIG.auto_open_ui,
    autorun_hidden:
        session.ui?.autorunHidden ?? DEFAULT_SETTINGS_CONFIG.autorun_hidden,
    show_splash: session.ui?.showSplash ?? DEFAULT_SETTINGS_CONFIG.show_splash,
    splash_message:
        session.ui?.splashMessage ?? DEFAULT_SETTINGS_CONFIG.splash_message,
    seedRatioLimit:
        session.seedRatioLimit ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimit,
    seedRatioLimited:
        session.seedRatioLimited ?? DEFAULT_SETTINGS_CONFIG.seedRatioLimited,
    idleSeedingLimit:
        session["idle-seeding-limit"] ??
        DEFAULT_SETTINGS_CONFIG.idleSeedingLimit,
    idleSeedingLimited:
        session["idle-seeding-limit-enabled"] ??
        DEFAULT_SETTINGS_CONFIG.idleSeedingLimited,
    refresh_interval_ms: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
    request_timeout_ms: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
});

const mapConfigToSession = (
    config: SettingsConfig,
    sessionSettings?: TransmissionSessionSettings | null,
): Partial<TransmissionSessionSettings> => {
    let settings: Partial<TransmissionSessionSettings> = {
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
        "sequential_download": config.sequential_download,
        "torrent_complete_verify_enabled":
            config.torrent_complete_verify_enabled,
        seedRatioLimit: config.seedRatioLimit,
        seedRatioLimited: config.seedRatioLimited,
        "idle-seeding-limit": config.idleSeedingLimit,
        "idle-seeding-limit-enabled": config.idleSeedingLimited,
    };

    const blocklistSupported =
        !sessionSettings ||
        "blocklist-enabled" in sessionSettings ||
        "blocklist-url" in sessionSettings;

    if (!blocklistSupported) {
        delete settings["blocklist-enabled"];
        delete settings["blocklist-url"];
    }

    settings = removeUnsupportedVersionGatedSettings(
        settings,
        getVersionGatedSettingsSupport(sessionSettings),
    );

    if (config.download_dir.trim()) {
        settings["download-dir"] = config.download_dir;
    }

    if (config.incomplete_dir.trim()) {
        settings["incomplete-dir"] = config.incomplete_dir;
        settings["incomplete-dir-enabled"] = config.incomplete_dir_enabled;
    } else if (!config.incomplete_dir_enabled) {
        settings["incomplete-dir-enabled"] = false;
    }

    settings.ui = {
        autoOpen: config.auto_open_ui,
        autorunHidden: config.autorun_hidden,
        showSplash: config.show_splash,
        splashMessage: config.splash_message,
    };

    return settings;
};

interface UseSettingsFlowParams {
    torrentClient: EngineAdapter;
    isSettingsOpen: boolean;
    isMountedRef: MutableRefObject<boolean>;
}

export type UseSettingsFlowResult = ReturnType<typeof useSettingsFlow>;

export function useSettingsFlow({
    torrentClient,
    isSettingsOpen,
    isMountedRef,
}: UseSettingsFlowParams) {
    const sessionDomain = useEngineSessionDomain(torrentClient);
    const {
        reportCommandError,
        rpcStatus,
        refreshSessionSettings,
        updateRequestTimeout,
    } = useSession();
    const { preferences, updatePreferences } = usePreferences();
    const [settingsConfigBase, setSettingsConfig] = useState<SettingsConfig>(
        () =>
            applyPreferencesToConfig(
                { ...DEFAULT_SETTINGS_CONFIG },
                preferences,
            ),
    );

    const settingsConfig = useMemo(
        () => applyPreferencesToConfig(settingsConfigBase, preferences),
        [settingsConfigBase, preferences],
    );
    const settingsConfigRef = useRef(settingsConfig);
    const [sessionSettings, setSessionSettings] =
        useState<TransmissionSessionSettings | null>(null);
    const sessionSettingsRef = useRef<TransmissionSessionSettings | null>(null);
    const settingsPatchQueueRef = useRef(Promise.resolve());
    const hasLoadedSettingsForOpenRef = useRef(false);
    const [settingsLoadError, setSettingsLoadError] = useState(false);
    const blocklistSupported = useMemo(() => {
        if (!sessionSettings) return true;
        return (
            "blocklist-enabled" in sessionSettings ||
            "blocklist-url" in sessionSettings
        );
    }, [sessionSettings]);
    const versionGatedSettings = useMemo(
        () => getVersionGatedSettingsSupport(sessionSettings),
        [sessionSettings],
    );

    useEffect(() => {
        updateRequestTimeout(settingsConfig.request_timeout_ms);
    }, [settingsConfig.request_timeout_ms, updateRequestTimeout]);

    useEffect(() => {
        settingsConfigRef.current = settingsConfig;
    }, [settingsConfig]);

    useEffect(() => {
        sessionSettingsRef.current = sessionSettings;
    }, [sessionSettings]);

    useEffect(() => {
        if (isSettingsOpen) {
            return;
        }
        hasLoadedSettingsForOpenRef.current = false;
        setSettingsLoadError(false);
    }, [isSettingsOpen]);

    useEffect(() => {
        if (!isSettingsOpen || rpcStatus !== status.connection.connected)
            return;
        let active = true;
        const shouldSurfaceLoadError = !hasLoadedSettingsForOpenRef.current;
        const loadSettings = async () => {
            if (active && shouldSurfaceLoadError) {
                setSettingsLoadError(false);
            }
            try {
                const session = await refreshSessionSettings();
                setSessionSettings(session);
                hasLoadedSettingsForOpenRef.current = true;
                if (active) {
                    setSettingsConfig(
                        applyPreferencesToConfig(
                            mapSessionToConfig(session),
                            preferences,
                        ),
                    );
                }
            } catch {
                if (active && shouldSurfaceLoadError) {
                    setSettingsLoadError(true);
                }
            }
        };
        void loadSettings();
        return () => {
            active = false;
        };
    }, [isSettingsOpen, refreshSessionSettings, rpcStatus, preferences]);

    const handleTestPort = useCallback(
        async (): Promise<EngineTestPortOutcome> => {
            if (!sessionDomain.canTestPort) {
                return { status: "unsupported" };
            }
            if (rpcStatus !== status.connection.connected) {
                return { status: "offline" };
            }
            const outcome = await sessionDomain.testPort();
            if (outcome.status === "failed" && isMountedRef.current) {
                reportCommandError(new Error("settings.modal.error_test_port"));
            }
            return outcome;
        },
        [isMountedRef, reportCommandError, rpcStatus, sessionDomain],
    );

    const applySettingsPatch = useCallback(
        async (patch: Partial<SettingsConfig>) => {
            const queuedPatch = settingsPatchQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    let sessionPayload: Partial<TransmissionSessionSettings> | null =
                        null;
                    const nextConfig = {
                        ...settingsConfigRef.current,
                        ...patch,
                    };
                    try {
                        sessionPayload = mapConfigToSession(
                            nextConfig,
                            sessionSettingsRef.current,
                        );
                        await sessionDomain.updateSessionSettings(sessionPayload);
                        if (isMountedRef.current) {
                            settingsConfigRef.current = nextConfig;
                            setSettingsConfig(nextConfig);
                            if (sessionPayload) {
                                setSessionSettings((prev) => {
                                    const nextSession = {
                                        ...(prev ?? {}),
                                        ...sessionPayload,
                                    };
                                    sessionSettingsRef.current = nextSession;
                                    return nextSession;
                                });
                            }
                            try {
                                const latest = await refreshSessionSettings();
                                sessionSettingsRef.current = latest;
                                setSessionSettings(latest);
                            } catch {
                                // Keep live settings resilient even if post-apply sync fails.
                            }
                        }
                    } catch (error) {
                        infraLogger.error(
                            {
                                scope: "settings",
                                event: "patch_failed",
                                message: "Failed to persist settings patch",
                                details: {
                                    hasPayload: Boolean(sessionPayload),
                                    patchKeys: Object.keys(patch),
                                },
                            },
                            {
                                error,
                                payload: sessionPayload,
                            },
                        );
                        if (isMountedRef.current && !isRpcCommandError(error)) {
                            reportCommandError(error);
                        }
                        if (error instanceof Error) {
                            throw error;
                        }
                        throw new Error("Unable to apply settings patch");
                    }
                });
            settingsPatchQueueRef.current = queuedPatch;
            return queuedPatch;
        },
        [
            isMountedRef,
            refreshSessionSettings,
            reportCommandError,
            sessionDomain,
        ],
    );

    const applyUserPreferencesPatch = useCallback(
        (patch: Partial<PreferencePayload>) => {
            const preferencePatch: Partial<Parameters<typeof updatePreferences>[0]> =
                {};
            if (patch.refresh_interval_ms !== undefined) {
                preferencePatch.refreshIntervalMs = patch.refresh_interval_ms;
            }
            if (patch.request_timeout_ms !== undefined) {
                preferencePatch.requestTimeoutMs = patch.request_timeout_ms;
            }
            if (patch.table_watermark_enabled !== undefined) {
                preferencePatch.tableWatermarkEnabled =
                    patch.table_watermark_enabled;
            }
            if (Object.keys(preferencePatch).length > 0) {
                updatePreferences(preferencePatch);
            }
        },
        [updatePreferences],
    );

    return {
        settingsConfig,
        handleTestPort,
        applySettingsPatch,
        applyUserPreferencesPatch,
        settingsLoadError,
        blocklistSupported,
        versionGatedSettings,
    };
}
