import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import i18n from "@/i18n";
import { DEFAULT_SETTINGS_CONFIG } from "@/modules/settings/data/config";
import {
    applyTheme,
    getInitialTheme,
    persistTheme,
    type ThemeMode,
} from "@/shared/utils/theme";
import {
    getInitialLanguage,
    persistLanguage,
    sanitizeLanguage,
    SUPPORTED_LANGUAGE_CODES,
    type LanguageCode,
} from "@/app/preferences/language";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import type { VisibilityState, SortingState } from "@tanstack/react-table";
import type { AddTorrentCommitMode } from "@/modules/torrent-add/types";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import type { SpeedChartLayoutMode } from "@/app/types/dashboard/speedChart";

export type WorkspaceStyle = "classic" | "immersive";

export type CloseAction = "minimize" | "quit";

export interface SystemPreferences {
    preventSleep: boolean;
    autoUpdate: boolean;
    closeAction: CloseAction;
}

export interface AddTorrentDefaultsState {
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
}

export interface TorrentTablePersistenceState {
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    sorting: SortingState;
}

const PREFERENCES_STORAGE_KEY = "tiny-torrent.preferences.v1";
const CURRENT_PREFERENCES_VERSION = 1;
const LEGACY_USER_PREFERENCES_KEY = "tiny-torrent.user-preferences";
const LEGACY_WORKBENCH_SCALE_KEY = "tiny-torrent.workbench.scale";
const LEGACY_WORKSPACE_STYLE_KEY = "tiny-torrent.workspace-style";
const LEGACY_HUD_DISMISSED_KEY = "tiny-torrent.hud-dismissed";
const SYSTEM_POWER_KEY = "tiny-torrent.system.prevent-sleep";
const SYSTEM_UPDATE_KEY = "tiny-torrent.system.auto-update";
const SYSTEM_CLOSE_ACTION_KEY = "tiny-torrent.system.close-action";
const DETAIL_TAB_KEY = "tt.inspector.active_tab";
const TABLE_STATE_KEY = "tiny-torrent.table-state.v2.8";
const SPEED_CHART_LAYOUT_KEY = "speed_chart_layout_pref";
const ADD_TORRENT_DEFAULTS_KEY = "tt-add-torrent-defaults";
const ADD_TORRENT_LEGACY_DOWNLOAD_KEY = "tt-add-last-download-dir";
const ADD_TORRENT_HISTORY_KEY = "tt-add-save-history";
const CONNECTION_PROFILES_KEY = "tiny-torrent.connection.profiles";
const CONNECTION_ACTIVE_PROFILE_KEY = "tiny-torrent.connection.active";

export const ZOOM_EVENT_NAME = "tt-zoom-change";

const clampScale = (value: number) => Math.max(0.7, Math.min(1.5, value));
export { clampScale };

const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
    preventSleep: true,
    autoUpdate: true,
    closeAction: "minimize",
};

const DEFAULT_INSPECTOR_TAB: DetailTab = "general";
const DEFAULT_TORRENT_TABLE_STATE: TorrentTablePersistenceState | null = null;
const DEFAULT_SPEED_CHART_LAYOUT: SpeedChartLayoutMode | null = null;
const DEFAULT_ADD_TORRENT_DEFAULTS: AddTorrentDefaultsState = {
    downloadDir: "",
    commitMode: "paused",
};
const DEFAULT_ADD_TORRENT_HISTORY: string[] = [];
const DEFAULT_CONNECTION_PROFILES: ConnectionProfile[] = [];
const DEFAULT_ACTIVE_CONNECTION_PROFILE_ID = "";

// Final PreferencesState shape (must cover every persisted preference managed by the provider):
//   version, refreshIntervalMs, requestTimeoutMs, tableWatermarkEnabled,
//   workbenchScale, workspaceStyle, dismissedHudCardIds,
//   theme, language,
//   systemPreferences (preventSleep, autoUpdate, closeAction),
//   inspectorTab, torrentTableState, speedChartLayoutMode,
//   addTorrentDefaults, addTorrentHistory,
//   connectionProfiles, activeConnectionProfileId.
// This contract should never shrink without a documented migration path.
export interface PreferencesState {
    version: number;
    refreshIntervalMs: number;
    requestTimeoutMs: number;
    tableWatermarkEnabled: boolean;
    workbenchScale: number;
    workspaceStyle: WorkspaceStyle;
    dismissedHudCardIds: string[];
    theme: ThemeMode;
    language: LanguageCode;
    systemPreferences: SystemPreferences;
    inspectorTab: DetailTab;
    torrentTableState: TorrentTablePersistenceState | null;
    speedChartLayoutMode: SpeedChartLayoutMode | null;
    addTorrentDefaults: AddTorrentDefaultsState;
    addTorrentHistory: string[];
    connectionProfiles: ConnectionProfile[];
    activeConnectionProfileId: string;
}

type PreferencesPatch = Partial<Omit<PreferencesState, "version">>;

const DEFAULT_PREFERENCES: PreferencesState = {
    version: CURRENT_PREFERENCES_VERSION,
    refreshIntervalMs: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
    requestTimeoutMs: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
    tableWatermarkEnabled: DEFAULT_SETTINGS_CONFIG.table_watermark_enabled,
    workbenchScale: 1,
    workspaceStyle: "classic",
    dismissedHudCardIds: [],
    theme: getInitialTheme(),
    language: getInitialLanguage(),
    systemPreferences: DEFAULT_SYSTEM_PREFERENCES,
    inspectorTab: DEFAULT_INSPECTOR_TAB,
    torrentTableState: DEFAULT_TORRENT_TABLE_STATE,
    speedChartLayoutMode: DEFAULT_SPEED_CHART_LAYOUT,
    addTorrentDefaults: DEFAULT_ADD_TORRENT_DEFAULTS,
    addTorrentHistory: DEFAULT_ADD_TORRENT_HISTORY,
    connectionProfiles: DEFAULT_CONNECTION_PROFILES,
    activeConnectionProfileId: DEFAULT_ACTIVE_CONNECTION_PROFILE_ID,
};

const persistPreferences = (payload: PreferencesState) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(payload)
        );
    } catch {
        /* ignore */
    }
};

const parseNumber = (value: string | null) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
};

const parseJson = <T,>(value: string | null): T | undefined => {
    if (!value) return undefined;
    try {
        return JSON.parse(value) as T;
    } catch {
        return undefined;
    }
};

const isDetailTabValue = (value: unknown): value is DetailTab =>
    value === "general" ||
    value === "content" ||
    value === "pieces" ||
    value === "speed" ||
    value === "peers" ||
    value === "trackers";

const isSpeedChartLayoutMode = (
    value: unknown
): value is SpeedChartLayoutMode =>
    value === "combined" || value === "split";

const isValidCommitMode = (
    value: unknown
): value is AddTorrentCommitMode =>
    value === "start" || value === "paused" || value === "top";

const isConnectionProfileValue = (
    value: unknown
): value is ConnectionProfile => {
    if (!value || typeof value !== "object") return false;
    const profile = value as ConnectionProfile;
    if (typeof profile.id !== "string" || profile.id.trim() === "") return false;
    if (typeof profile.label !== "string") return false;
    if (profile.scheme !== "http" && profile.scheme !== "https") return false;
    if (typeof profile.host !== "string") return false;
    if (typeof profile.port !== "string") return false;
    if (typeof profile.username !== "string") return false;
    if (typeof profile.password !== "string") return false;
    return true;
};

const isTorrentTableState = (
    value: unknown
): value is TorrentTablePersistenceState => {
    if (!value || typeof value !== "object") return false;
    const record = value as TorrentTablePersistenceState;
    if (!Array.isArray(record.columnOrder)) return false;
    if (
        !record.columnVisibility ||
        typeof record.columnVisibility !== "object"
    )
        return false;
    if (
        !record.columnSizing ||
        typeof record.columnSizing !== "object" ||
        Array.isArray(record.columnSizing)
    )
        return false;
    if (!Array.isArray(record.sorting)) return false;
    return true;
};

const readLegacyPreferences = (): PreferencesState => {
    if (typeof window === "undefined") {
        return DEFAULT_PREFERENCES;
    }
    const next: PreferencesState = { ...DEFAULT_PREFERENCES };

    try {
        const storedUser = window.localStorage.getItem(
            LEGACY_USER_PREFERENCES_KEY
        );
        if (storedUser) {
            const parsed = JSON.parse(storedUser) as {
                refresh_interval_ms?: number;
                request_timeout_ms?: number;
                table_watermark_enabled?: boolean;
            };
            if (typeof parsed.refresh_interval_ms === "number") {
                next.refreshIntervalMs = parsed.refresh_interval_ms;
            }
            if (typeof parsed.request_timeout_ms === "number") {
                next.requestTimeoutMs = parsed.request_timeout_ms;
            }
            if (typeof parsed.table_watermark_enabled === "boolean") {
                next.tableWatermarkEnabled = parsed.table_watermark_enabled;
            }
        }
    } catch {
        /* ignore */
    }

    const legacyScale = parseNumber(
        window.localStorage.getItem(LEGACY_WORKBENCH_SCALE_KEY)
    );
    if (typeof legacyScale === "number") {
        next.workbenchScale = clampScale(legacyScale);
    }

    const legacyStyle = window.localStorage.getItem(
        LEGACY_WORKSPACE_STYLE_KEY
    );
    if (legacyStyle === "immersive") {
        next.workspaceStyle = "immersive";
    }

    try {
        const legacyHud = window.localStorage.getItem(LEGACY_HUD_DISMISSED_KEY);
        if (legacyHud) {
            next.dismissedHudCardIds = JSON.parse(legacyHud) as string[];
        }
    } catch {
        /* ignore */
    }

    const storedPreventSleep = parseJson<boolean>(
        window.localStorage.getItem(SYSTEM_POWER_KEY)
    );
    if (typeof storedPreventSleep === "boolean") {
        next.systemPreferences.preventSleep = storedPreventSleep;
    }

    const storedAutoUpdate = parseJson<boolean>(
        window.localStorage.getItem(SYSTEM_UPDATE_KEY)
    );
    if (typeof storedAutoUpdate === "boolean") {
        next.systemPreferences.autoUpdate = storedAutoUpdate;
    }

    const storedCloseAction = parseJson<CloseAction>(
        window.localStorage.getItem(SYSTEM_CLOSE_ACTION_KEY)
    );
    if (storedCloseAction === "minimize" || storedCloseAction === "quit") {
        next.systemPreferences.closeAction = storedCloseAction;
    }

    const storedInspectorTab = window.localStorage.getItem(DETAIL_TAB_KEY);
    if (isDetailTabValue(storedInspectorTab)) {
        next.inspectorTab = storedInspectorTab;
    }

    const storedTableState = parseJson<TorrentTablePersistenceState>(
        window.localStorage.getItem(TABLE_STATE_KEY)
    );
    if (storedTableState) {
        next.torrentTableState = storedTableState;
    }

    const storedLayout = window.localStorage.getItem(SPEED_CHART_LAYOUT_KEY);
    if (isSpeedChartLayoutMode(storedLayout)) {
        next.speedChartLayoutMode = storedLayout;
    }

    const storedAddTorrentDefaults = parseJson<
        Partial<AddTorrentDefaultsState>
    >(window.localStorage.getItem(ADD_TORRENT_DEFAULTS_KEY));
    if (storedAddTorrentDefaults) {
        if (typeof storedAddTorrentDefaults.downloadDir === "string") {
            next.addTorrentDefaults.downloadDir =
                storedAddTorrentDefaults.downloadDir;
        }
        if (isValidCommitMode(storedAddTorrentDefaults.commitMode)) {
            next.addTorrentDefaults.commitMode =
                storedAddTorrentDefaults.commitMode;
        }
    }

    const legacyAddDir = window.localStorage.getItem(
        ADD_TORRENT_LEGACY_DOWNLOAD_KEY
    );
    if (legacyAddDir && !next.addTorrentDefaults.downloadDir) {
        next.addTorrentDefaults.downloadDir = legacyAddDir;
    }

    const storedHistory = parseJson<unknown[]>(
        window.localStorage.getItem(ADD_TORRENT_HISTORY_KEY)
    );
    if (Array.isArray(storedHistory)) {
        next.addTorrentHistory = storedHistory.filter(
            (entry): entry is string => typeof entry === "string"
        );
    }

    const storedProfiles = parseJson<unknown[]>(
        window.localStorage.getItem(CONNECTION_PROFILES_KEY)
    );
    if (Array.isArray(storedProfiles)) {
        next.connectionProfiles = storedProfiles.filter(
            (entry): entry is ConnectionProfile =>
                isConnectionProfileValue(entry)
        );
    }

    const storedActiveProfile = window.localStorage.getItem(
        CONNECTION_ACTIVE_PROFILE_KEY
    );
    if (storedActiveProfile) {
        next.activeConnectionProfileId = storedActiveProfile;
    }

    return next;
};

const sanitizePreferences = (
    value: Partial<PreferencesState> | null
): PreferencesState => {
    if (!value) {
        return DEFAULT_PREFERENCES;
    }
    return {
        version: CURRENT_PREFERENCES_VERSION,
        refreshIntervalMs:
            typeof value.refreshIntervalMs === "number"
                ? value.refreshIntervalMs
                : DEFAULT_PREFERENCES.refreshIntervalMs,
        requestTimeoutMs:
            typeof value.requestTimeoutMs === "number"
                ? value.requestTimeoutMs
                : DEFAULT_PREFERENCES.requestTimeoutMs,
        tableWatermarkEnabled:
            typeof value.tableWatermarkEnabled === "boolean"
                ? value.tableWatermarkEnabled
                : DEFAULT_PREFERENCES.tableWatermarkEnabled,
        workbenchScale:
            typeof value.workbenchScale === "number"
                ? clampScale(value.workbenchScale)
                : DEFAULT_PREFERENCES.workbenchScale,
        workspaceStyle:
            value.workspaceStyle === "immersive"
                ? "immersive"
                : DEFAULT_PREFERENCES.workspaceStyle,
        dismissedHudCardIds: Array.isArray(value.dismissedHudCardIds)
            ? value.dismissedHudCardIds
            : DEFAULT_PREFERENCES.dismissedHudCardIds,
        theme:
            value.theme === "dark" || value.theme === "light"
                ? value.theme
                : DEFAULT_PREFERENCES.theme,
        language:
            typeof value.language === "string"
                ? sanitizeLanguage(value.language)
                : DEFAULT_PREFERENCES.language,
        systemPreferences: {
            preventSleep:
                typeof value.systemPreferences?.preventSleep === "boolean"
                    ? value.systemPreferences.preventSleep
                    : DEFAULT_SYSTEM_PREFERENCES.preventSleep,
            autoUpdate:
                typeof value.systemPreferences?.autoUpdate === "boolean"
                    ? value.systemPreferences.autoUpdate
                    : DEFAULT_SYSTEM_PREFERENCES.autoUpdate,
            closeAction:
                value.systemPreferences?.closeAction === "quit" ||
                value.systemPreferences?.closeAction === "minimize"
                    ? value.systemPreferences.closeAction
                    : DEFAULT_SYSTEM_PREFERENCES.closeAction,
        },
        inspectorTab: isDetailTabValue(value.inspectorTab)
            ? value.inspectorTab
            : DEFAULT_INSPECTOR_TAB,
        torrentTableState: isTorrentTableState(value.torrentTableState)
            ? value.torrentTableState
            : DEFAULT_TORRENT_TABLE_STATE,
        speedChartLayoutMode: isSpeedChartLayoutMode(
            value.speedChartLayoutMode
        )
            ? value.speedChartLayoutMode
            : DEFAULT_SPEED_CHART_LAYOUT,
        addTorrentDefaults: {
            downloadDir:
                typeof value.addTorrentDefaults?.downloadDir === "string"
                    ? value.addTorrentDefaults.downloadDir
                    : DEFAULT_ADD_TORRENT_DEFAULTS.downloadDir,
            commitMode:
                isValidCommitMode(value.addTorrentDefaults?.commitMode)
                    ? value.addTorrentDefaults?.commitMode
                    : DEFAULT_ADD_TORRENT_DEFAULTS.commitMode,
        },
        addTorrentHistory: Array.isArray(value.addTorrentHistory)
            ? value.addTorrentHistory.filter(
                  (entry): entry is string => typeof entry === "string"
              )
            : DEFAULT_ADD_TORRENT_HISTORY,
        connectionProfiles: Array.isArray(value.connectionProfiles)
            ? value.connectionProfiles.filter(
                  (entry): entry is ConnectionProfile =>
                      isConnectionProfileValue(entry)
              )
            : DEFAULT_CONNECTION_PROFILES,
        activeConnectionProfileId:
            typeof value.activeConnectionProfileId === "string"
                ? value.activeConnectionProfileId
                : DEFAULT_ACTIVE_CONNECTION_PROFILE_ID,
    };
};

const readStoredPreferences = (): PreferencesState => {
    if (typeof window === "undefined") return DEFAULT_PREFERENCES;
    try {
        const serialized = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (serialized) {
            const parsed = JSON.parse(serialized) as Partial<PreferencesState>;
            return sanitizePreferences(parsed);
        }
    } catch {
        /* ignore */
    }
    const legacy = readLegacyPreferences();
    persistPreferences(legacy);
    return legacy;
};

export interface PreferencesContextValue {
    preferences: PreferencesState;
    supportedLanguages: readonly LanguageCode[];
    updatePreferences: (patch: PreferencesPatch) => void;
    toggleWorkspaceStyle: () => void;
    setWorkspaceStyle: (style: WorkspaceStyle) => void;
    dismissedHudCardIds: string[];
    dismissHudCard: (cardId: string) => void;
    restoreHudCards: () => void;
    setWorkbenchScale: (value: number) => void;
    increaseWorkbenchScale: () => void;
    decreaseWorkbenchScale: () => void;
    resetWorkbenchScale: () => void;
    setTheme: (mode: ThemeMode) => void;
    toggleTheme: () => void;
    setLanguage: (code: LanguageCode) => void;
    setSystemPreferences: (patch: Partial<SystemPreferences>) => void;
    setInspectorTab: (tab: DetailTab) => void;
    setTorrentTableState: (state: TorrentTablePersistenceState) => void;
    setSpeedChartLayoutMode: (mode: SpeedChartLayoutMode | null) => void;
    setAddTorrentDefaults: (defaults: AddTorrentDefaultsState) => void;
    setAddTorrentHistory: (history: string[]) => void;
    setConnectionProfiles: (profiles: ConnectionProfile[]) => void;
    setActiveConnectionProfileId: (id: string) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState<PreferencesState>(
        readStoredPreferences
    );

    const updatePreferences = useCallback((patch: PreferencesPatch) => {
        setPreferences((prev) => {
            const next = { ...prev, ...patch, version: CURRENT_PREFERENCES_VERSION };
            persistPreferences(next);
            return next;
        });
    }, []);

    const modifyPreferences = useCallback(
        (updater: (prev: PreferencesState) => PreferencesPatch) => {
            setPreferences((prev) => {
                const nextPatch = updater(prev);
                const next = {
                    ...prev,
                    ...nextPatch,
                    version: CURRENT_PREFERENCES_VERSION,
                };
                persistPreferences(next);
                return next;
            });
        },
        []
    );

    const toggleWorkspaceStyle = useCallback(() => {
        modifyPreferences((prev) => ({
            workspaceStyle:
                prev.workspaceStyle === "immersive" ? "classic" : "immersive",
        }));
    }, [modifyPreferences]);

    const setWorkspaceStyle = useCallback(
        (style: WorkspaceStyle) => {
            updatePreferences({ workspaceStyle: style });
        },
        [updatePreferences]
    );

    const dismissHudCard = useCallback(
        (cardId: string) => {
            modifyPreferences((prev) => {
                if (prev.dismissedHudCardIds.includes(cardId)) {
                    return {};
                }
                return {
                    dismissedHudCardIds: [...prev.dismissedHudCardIds, cardId],
                };
            });
        },
        [modifyPreferences]
    );

    const restoreHudCards = useCallback(() => {
        updatePreferences({ dismissedHudCardIds: [] });
    }, [updatePreferences]);

    const setWorkbenchScale = useCallback(
        (value: number) => {
            updatePreferences({ workbenchScale: clampScale(value) });
        },
        [updatePreferences]
    );

    const increaseWorkbenchScale = useCallback(() => {
        modifyPreferences((prev) => ({
            workbenchScale: clampScale(prev.workbenchScale + 0.05),
        }));
    }, [modifyPreferences]);

    const decreaseWorkbenchScale = useCallback(() => {
        modifyPreferences((prev) => ({
            workbenchScale: clampScale(prev.workbenchScale - 0.05),
        }));
    }, [modifyPreferences]);

    const resetWorkbenchScale = useCallback(() => {
        updatePreferences({ workbenchScale: 1 });
    }, [updatePreferences]);

    const setSystemPreferences = useCallback(
        (patch: Partial<SystemPreferences>) => {
            modifyPreferences((prev) => ({
                systemPreferences: { ...prev.systemPreferences, ...patch },
            }));
        },
        [modifyPreferences]
    );

    const setInspectorTab = useCallback(
        (tab: DetailTab) => {
            updatePreferences({ inspectorTab: tab });
        },
        [updatePreferences]
    );

    const setTorrentTableState = useCallback(
        (state: TorrentTablePersistenceState) => {
            updatePreferences({ torrentTableState: state });
        },
        [updatePreferences]
    );

    const setSpeedChartLayoutMode = useCallback(
        (mode: SpeedChartLayoutMode | null) => {
            updatePreferences({ speedChartLayoutMode: mode });
        },
        [updatePreferences]
    );

    const setAddTorrentDefaults = useCallback(
        (defaults: AddTorrentDefaultsState) => {
            updatePreferences({ addTorrentDefaults: defaults });
        },
        [updatePreferences]
    );

    const setAddTorrentHistory = useCallback(
        (history: string[]) => {
            updatePreferences({ addTorrentHistory: history });
        },
        [updatePreferences]
    );

    const setConnectionProfiles = useCallback(
        (profiles: ConnectionProfile[]) => {
            updatePreferences({ connectionProfiles: profiles });
        },
        [updatePreferences]
    );

    const setActiveConnectionProfileId = useCallback(
        (id: string) => {
            updatePreferences({ activeConnectionProfileId: id });
        },
        [updatePreferences]
    );

    const setTheme = useCallback(
        (mode: ThemeMode) => {
            updatePreferences({ theme: mode });
        },
        [updatePreferences]
    );

    const toggleTheme = useCallback(() => {
        modifyPreferences((prev) => ({
            theme: prev.theme === "dark" ? "light" : "dark",
        }));
    }, [modifyPreferences]);

    const setLanguage = useCallback(
        (code: LanguageCode) => {
            updatePreferences({ language: code });
        },
        [updatePreferences]
    );

    useEffect(() => {
        applyTheme(preferences.theme);
        persistTheme(preferences.theme);
    }, [preferences.theme]);

    useEffect(() => {
        persistLanguage(preferences.language);
        void i18n.changeLanguage(preferences.language);
    }, [preferences.language]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.style.setProperty(
            "--tt-zoom-level",
            String(preferences.workbenchScale)
        );
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent(ZOOM_EVENT_NAME, {
                    detail: preferences.workbenchScale,
                })
            );
        }
    }, [preferences.workbenchScale]);

    const value = useMemo(
        () => ({
            preferences,
            supportedLanguages: SUPPORTED_LANGUAGE_CODES,
            updatePreferences,
            toggleWorkspaceStyle,
            setWorkspaceStyle,
            dismissedHudCardIds: preferences.dismissedHudCardIds,
            dismissHudCard,
            restoreHudCards,
            setWorkbenchScale,
            increaseWorkbenchScale,
            decreaseWorkbenchScale,
            resetWorkbenchScale,
            setTheme,
            toggleTheme,
            setLanguage,
            setSystemPreferences,
            setInspectorTab,
            setTorrentTableState,
            setSpeedChartLayoutMode,
            setAddTorrentDefaults,
            setAddTorrentHistory,
            setConnectionProfiles,
            setActiveConnectionProfileId,
        }),
        [
            preferences,
            updatePreferences,
            toggleWorkspaceStyle,
            setWorkspaceStyle,
            dismissHudCard,
            restoreHudCards,
            setWorkbenchScale,
            increaseWorkbenchScale,
            decreaseWorkbenchScale,
            resetWorkbenchScale,
            setTheme,
            toggleTheme,
            setLanguage,
            setSystemPreferences,
            setInspectorTab,
            setTorrentTableState,
            setSpeedChartLayoutMode,
            setAddTorrentDefaults,
            setAddTorrentHistory,
            setConnectionProfiles,
            setActiveConnectionProfileId,
        ]
    );

    return (
        <PreferencesContext.Provider value={value}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error("usePreferences must be used within PreferencesProvider");
    }
    return context;
}
