/* eslint-disable react-refresh/only-export-components */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
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
import { registry } from "@/config/logic";
import type { DetailTab } from "@/modules/dashboard/types/contracts";
import type { SettingsTab } from "@/modules/settings/data/settings-tabs";
import type { VisibilityState, SortingState } from "@tanstack/react-table";
import type { AddTorrentCommitMode } from "@/modules/torrent-add/types";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import { sanitizeDownloadPathHistory } from "@/shared/domain/downloadPathHistory";

type SpeedChartLayoutMode = "combined" | "split";

export type WorkspaceStyle = "classic" | "immersive";

export type CloseAction = "minimize" | "quit";

export interface SystemPreferences {
    preventSleep: boolean;
    autoUpdate: boolean;
    closeAction: CloseAction;
}

export interface AddTorrentDefaultsState {
    commitMode: AddTorrentCommitMode;
    showAddDialog: boolean;
}

export interface RemoveTorrentDefaultsState {
    deleteData: boolean;
}

export interface TorrentTablePersistenceState {
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    sorting: SortingState;
}

const PREFERENCES_STORAGE_KEY = "tiny-torrent.preferences.v1";
const CURRENT_PREFERENCES_VERSION = 1;

export const ZOOM_EVENT_NAME = "tt-zoom-change";

const clampScale = (value: number) => Math.max(0.7, Math.min(1.5, value));
export { clampScale };
export const DEFAULT_WORKBENCH_SCALE = clampScale(registry.ui.scaleBases.zoom);
const downloadPathHistoryLimit = registry.defaults.downloadPathHistoryLimit;

const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
    preventSleep: true,
    autoUpdate: true,
    closeAction: "minimize",
};

const DEFAULT_INSPECTOR_TAB: DetailTab = "general";
const DEFAULT_SETTINGS_TAB: SettingsTab = "speed";
const DEFAULT_TORRENT_TABLE_STATE: TorrentTablePersistenceState | null = null;
const DEFAULT_SPEED_CHART_LAYOUT: SpeedChartLayoutMode | null = null;
const DEFAULT_ADD_TORRENT_DEFAULTS: AddTorrentDefaultsState = {
    commitMode: "paused",
    showAddDialog: true,
};
const DEFAULT_ADD_TORRENT_HISTORY: string[] = [];
const DEFAULT_REMOVE_TORRENT_DEFAULTS: RemoveTorrentDefaultsState = {
    deleteData: false,
};
const DEFAULT_CONNECTION_PROFILES: ConnectionProfile[] = [];
const DEFAULT_ACTIVE_CONNECTION_PROFILE_ID = "";

// Final PreferencesState shape (must cover every persisted preference managed by the provider):
//   version, refreshIntervalMs, requestTimeoutMs, tableWatermarkEnabled,
//   showTorrentServerSetup,
//   workbenchScale, workspaceStyle, dismissedHudCardIds,
//   theme, language,
//   systemPreferences (preventSleep, autoUpdate, closeAction),
//   inspectorTab, settingsTab, generalDetailsAdvanced, torrentTableState, speedChartLayoutMode,
//   addTorrentDefaults, addTorrentHistory, removeTorrentDefaults,
//   connectionProfiles, activeConnectionProfileId.
// This contract is the only persisted preferences shape.
export interface PreferencesState {
    version: number;
    refreshIntervalMs: number;
    requestTimeoutMs: number;
    tableWatermarkEnabled: boolean;
    showTorrentServerSetup: boolean;
    workbenchScale: number;
    workspaceStyle: WorkspaceStyle;
    dismissedHudCardIds: string[];
    theme: ThemeMode;
    language: LanguageCode;
    systemPreferences: SystemPreferences;
    inspectorTab: DetailTab;
    settingsTab: SettingsTab;
    generalDetailsAdvanced: boolean;
    torrentTableState: TorrentTablePersistenceState | null;
    speedChartLayoutMode: SpeedChartLayoutMode | null;
    addTorrentDefaults: AddTorrentDefaultsState;
    addTorrentHistory: string[];
    removeTorrentDefaults: RemoveTorrentDefaultsState;
    connectionProfiles: ConnectionProfile[];
    activeConnectionProfileId: string;
}

type PreferencesPatch = Partial<Omit<PreferencesState, "version">>;

const DEFAULT_PREFERENCES: PreferencesState = {
    version: CURRENT_PREFERENCES_VERSION,
    refreshIntervalMs: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
    requestTimeoutMs: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
    tableWatermarkEnabled: DEFAULT_SETTINGS_CONFIG.table_watermark_enabled,
    showTorrentServerSetup: DEFAULT_SETTINGS_CONFIG.show_torrent_server_setup,
    workbenchScale: DEFAULT_WORKBENCH_SCALE,
    workspaceStyle: "classic",
    dismissedHudCardIds: [],
    theme: getInitialTheme(),
    language: getInitialLanguage(),
    systemPreferences: DEFAULT_SYSTEM_PREFERENCES,
    inspectorTab: DEFAULT_INSPECTOR_TAB,
    settingsTab: DEFAULT_SETTINGS_TAB,
    generalDetailsAdvanced: false,
    torrentTableState: DEFAULT_TORRENT_TABLE_STATE,
    speedChartLayoutMode: DEFAULT_SPEED_CHART_LAYOUT,
    addTorrentDefaults: DEFAULT_ADD_TORRENT_DEFAULTS,
    addTorrentHistory: DEFAULT_ADD_TORRENT_HISTORY,
    removeTorrentDefaults: DEFAULT_REMOVE_TORRENT_DEFAULTS,
    connectionProfiles: DEFAULT_CONNECTION_PROFILES,
    activeConnectionProfileId: DEFAULT_ACTIVE_CONNECTION_PROFILE_ID,
};

const persistPreferences = (payload: PreferencesState) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(payload),
        );
    } catch {
        /* ignore */
    }
};

const isDetailTabValue = (value: unknown): value is DetailTab =>
    value === "general" ||
    value === "content" ||
    value === "pieces" ||
    value === "speed" ||
    value === "peers" ||
    value === "trackers";

const isSettingsTabValue = (value: unknown): value is SettingsTab =>
    value === "speed" ||
    value === "network" ||
    value === "connection" ||
    value === "peers" ||
    value === "storage" ||
    value === "privacy" ||
    value === "gui" ||
    value === "system";

const isSpeedChartLayoutMode = (
    value: unknown,
): value is SpeedChartLayoutMode => value === "combined" || value === "split";

const isValidCommitMode = (value: unknown): value is AddTorrentCommitMode =>
    value === "start" || value === "paused" || value === "top";

const sanitizePathHistory = (paths: unknown[]): string[] => {
    return sanitizeDownloadPathHistory(paths, downloadPathHistoryLimit);
};

const sanitizeAddTorrentDefaults = (
    defaults?: Partial<AddTorrentDefaultsState> | null,
): AddTorrentDefaultsState => ({
    commitMode: isValidCommitMode(defaults?.commitMode)
        ? defaults.commitMode
        : DEFAULT_ADD_TORRENT_DEFAULTS.commitMode,
    showAddDialog:
        typeof defaults?.showAddDialog === "boolean"
            ? defaults.showAddDialog
            : DEFAULT_ADD_TORRENT_DEFAULTS.showAddDialog,
});

const sanitizeRemoveTorrentDefaults = (
    defaults?: Partial<RemoveTorrentDefaultsState> | null,
): RemoveTorrentDefaultsState => ({
    deleteData:
        typeof defaults?.deleteData === "boolean"
            ? defaults.deleteData
            : DEFAULT_REMOVE_TORRENT_DEFAULTS.deleteData,
});

const isConnectionProfileValue = (
    value: unknown,
): value is ConnectionProfile => {
    if (!value || typeof value !== "object") return false;
    const profile = value as ConnectionProfile;
    if (typeof profile.id !== "string" || profile.id.trim() === "")
        return false;
    if (typeof profile.label !== "string") return false;
    if (profile.scheme !== "http" && profile.scheme !== "https") return false;
    if (typeof profile.host !== "string") return false;
    if (typeof profile.port !== "string") return false;
    if (typeof profile.username !== "string") return false;
    if (typeof profile.password !== "string") return false;
    return true;
};

const isTorrentTableState = (
    value: unknown,
): value is TorrentTablePersistenceState => {
    if (!value || typeof value !== "object") return false;
    const record = value as TorrentTablePersistenceState;
    if (!Array.isArray(record.columnOrder)) return false;
    if (!record.columnVisibility || typeof record.columnVisibility !== "object")
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

const sanitizePreferences = (
    value: Partial<PreferencesState> | null,
): PreferencesState => {
    if (!value) {
        return DEFAULT_PREFERENCES;
    }
    const addTorrentDefaults = sanitizeAddTorrentDefaults(value.addTorrentDefaults);
    const addTorrentHistory = sanitizePathHistory([
        ...(Array.isArray(value.addTorrentHistory) ? value.addTorrentHistory : []),
    ]);
    const removeTorrentDefaults = sanitizeRemoveTorrentDefaults(
        value.removeTorrentDefaults,
    );

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
        showTorrentServerSetup:
            typeof value.showTorrentServerSetup === "boolean"
                ? value.showTorrentServerSetup
                : DEFAULT_PREFERENCES.showTorrentServerSetup,
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
        settingsTab: isSettingsTabValue(value.settingsTab)
            ? value.settingsTab
            : DEFAULT_SETTINGS_TAB,
        generalDetailsAdvanced:
            typeof value.generalDetailsAdvanced === "boolean"
                ? value.generalDetailsAdvanced
                : DEFAULT_PREFERENCES.generalDetailsAdvanced,
        torrentTableState: isTorrentTableState(value.torrentTableState)
            ? value.torrentTableState
            : DEFAULT_TORRENT_TABLE_STATE,
        speedChartLayoutMode: isSpeedChartLayoutMode(value.speedChartLayoutMode)
            ? value.speedChartLayoutMode
            : DEFAULT_SPEED_CHART_LAYOUT,
        addTorrentDefaults,
        addTorrentHistory,
        removeTorrentDefaults,
        connectionProfiles: Array.isArray(value.connectionProfiles)
            ? value.connectionProfiles.filter(
                  (entry): entry is ConnectionProfile =>
                      isConnectionProfileValue(entry),
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
            const sanitized = sanitizePreferences(parsed);
            if (JSON.stringify(sanitized) !== serialized) {
                persistPreferences(sanitized);
            }
            return sanitized;
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_PREFERENCES;
};

export const readInitialWorkbenchScale = () =>
    readStoredPreferences().workbenchScale;

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
    setSettingsTab: (tab: SettingsTab) => void;
    setTorrentTableState: (state: TorrentTablePersistenceState) => void;
    setSpeedChartLayoutMode: (mode: SpeedChartLayoutMode | null) => void;
    setAddTorrentDefaults: (defaults: AddTorrentDefaultsState) => void;
    setAddTorrentHistory: (history: string[]) => void;
}

interface PreferencesContextInternalValue extends PreferencesContextValue {
    setConnectionProfiles: (profiles: ConnectionProfile[]) => void;
    setActiveProfileId: (id: string) => void;
}

const PreferencesContext = createContext<PreferencesContextInternalValue | null>(
    null,
);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState<PreferencesState>(
        readStoredPreferences,
    );

    const updatePreferences = useCallback((patch: PreferencesPatch) => {
        setPreferences((prev) => {
            const next = {
                ...prev,
                ...patch,
                version: CURRENT_PREFERENCES_VERSION,
            };
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
        [],
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
        [updatePreferences],
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
        [modifyPreferences],
    );

    const restoreHudCards = useCallback(() => {
        updatePreferences({ dismissedHudCardIds: [] });
    }, [updatePreferences]);

    const setWorkbenchScale = useCallback(
        (value: number) => {
            updatePreferences({ workbenchScale: clampScale(value) });
        },
        [updatePreferences],
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
        updatePreferences({ workbenchScale: DEFAULT_WORKBENCH_SCALE });
    }, [updatePreferences]);

    const setSystemPreferences = useCallback(
        (patch: Partial<SystemPreferences>) => {
            modifyPreferences((prev) => ({
                systemPreferences: { ...prev.systemPreferences, ...patch },
            }));
        },
        [modifyPreferences],
    );

    const setInspectorTab = useCallback(
        (tab: DetailTab) => {
            updatePreferences({ inspectorTab: tab });
        },
        [updatePreferences],
    );

    const setSettingsTab = useCallback(
        (tab: SettingsTab) => {
            updatePreferences({ settingsTab: tab });
        },
        [updatePreferences],
    );

    const setTorrentTableState = useCallback(
        (state: TorrentTablePersistenceState) => {
            updatePreferences({ torrentTableState: state });
        },
        [updatePreferences],
    );

    const setSpeedChartLayoutMode = useCallback(
        (mode: SpeedChartLayoutMode | null) => {
            updatePreferences({ speedChartLayoutMode: mode });
        },
        [updatePreferences],
    );

    const setAddTorrentDefaults = useCallback(
        (defaults: AddTorrentDefaultsState) => {
            updatePreferences({ addTorrentDefaults: defaults });
        },
        [updatePreferences],
    );

    const setAddTorrentHistory = useCallback(
        (history: string[]) => {
            updatePreferences({
                addTorrentHistory: sanitizePathHistory(history),
            });
        },
        [updatePreferences],
    );

    const setConnectionProfiles = useCallback(
        (profiles: ConnectionProfile[]) => {
            updatePreferences({ connectionProfiles: profiles });
        },
        [updatePreferences],
    );

    const setActiveProfileId = useCallback(
        (id: string) => {
            updatePreferences({ activeConnectionProfileId: id });
        },
        [updatePreferences],
    );

    const setTheme = useCallback(
        (mode: ThemeMode) => {
            updatePreferences({ theme: mode });
        },
        [updatePreferences],
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
        [updatePreferences],
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
            String(preferences.workbenchScale),
        );
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent(ZOOM_EVENT_NAME, {
                    detail: preferences.workbenchScale,
                }),
            );
        }
    }, [preferences.workbenchScale]);

    const value = useMemo<PreferencesContextInternalValue>(
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
            setSettingsTab,
            setTorrentTableState,
            setSpeedChartLayoutMode,
            setAddTorrentDefaults,
            setAddTorrentHistory,
            setConnectionProfiles,
            setActiveProfileId,
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
            setSettingsTab,
            setTorrentTableState,
            setSpeedChartLayoutMode,
            setAddTorrentDefaults,
            setAddTorrentHistory,
            setConnectionProfiles,
            setActiveProfileId,
        ],
    );

    return (
        <PreferencesContext.Provider value={value}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences(): PreferencesContextValue {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error(
            "usePreferences must be used within PreferencesProvider",
        );
    }
    return context;
}

export function usePreferencesConnectionConfig() {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error(
            "usePreferencesConnectionConfig must be used within PreferencesProvider",
        );
    }
    return {
        preferences: context.preferences,
        setConnectionProfiles: context.setConnectionProfiles,
        setActiveProfileId: context.setActiveProfileId,
    };
}

