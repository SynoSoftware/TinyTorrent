import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { status } from "@/shared/status";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/contracts";
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type { CommandPaletteContext } from "@/app/components/CommandPalette";
import {
    buildCommandPaletteActions,
    buildContextCommandActions,
} from "@/app/commandRegistry";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { AddTorrentModalProps } from "@/modules/torrent-add/components/AddTorrentModal";
import {
    useDashboardViewModel,
    useDeletionViewModel,
    useHudViewModel,
    useNavbarViewModel,
    useSettingsModalViewModel,
    useStatusBarViewModel,
    useWorkspaceShellModel,
} from "@/app/viewModels/workspaceShell/shellViewModelBuilders";
import {
    dashboardFilters,
    type DashboardFilter,
} from "@/modules/dashboard/types/dashboardFilter";
import type {
    StatusBarViewModel,
    StatusBarTransportStatus,
    WorkspaceShellViewModel,
} from "@/app/viewModels/useAppViewModel";
import { useCommandPalette } from "@/app/hooks/useCommandPalette";
import { useWorkspaceModals } from "@/app/context/AppShellStateContext";
import { useSettingsFlow } from "@/app/hooks/useSettingsFlow";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSession, useSessionTelemetry } from "@/app/context/SessionContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { shellAgent } from "@/app/agents/shell-agent";
import { useHudCards } from "@/app/hooks/useHudCards";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import {
    commandOutcome,
    type TorrentCommandOutcome,
} from "@/app/context/AppCommandContext";
import type {
    TorrentIntentExtended,
} from "@/app/intents/torrentIntents";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { useWorkspaceTorrentDomain } from "@/app/orchestrators/useWorkspaceTorrentDomain";
import { bindEngineCheckFreeSpace } from "@/services/rpc/engine-adapter";
import { useSetDownloadLocationFlow } from "@/modules/dashboard/hooks/useSetDownloadLocationFlow";

export interface WorkspaceShellController {
    shell: {
        workspace: WorkspaceShellViewModel;
        statusBar: StatusBarViewModel;
    };
    commands: {
        dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
        commandApi: {
            handleTorrentAction: (
                action: TorrentTableAction,
                torrent: Torrent,
            ) => Promise<TorrentCommandOutcome>;
            handleBulkAction: (
                action: TorrentTableAction,
            ) => Promise<TorrentCommandOutcome>;
            setDownloadLocation: (params: { torrent: Torrent; path: string }) => Promise<TorrentCommandOutcome>;
            setSequentialDownload: (
                torrent: Torrent,
                enabled: boolean,
            ) => Promise<TorrentCommandOutcome>;
            checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
            openAddMagnet: (
                magnetLink?: string,
            ) => Promise<TorrentCommandOutcome>;
            openAddTorrentPicker: () => Promise<TorrentCommandOutcome>;
        };
        commandPaletteState: {
            isOpen: boolean;
            setIsOpen: (value: boolean) => void;
        };
        globalHotkeys: {
            torrents: Torrent[];
            selectedTorrents: Torrent[];
            detailData: TorrentDetail | null;
            handleRequestDetails: (torrent: Torrent) => Promise<void>;
            handleCloseDetail: () => void;
        };
    };
    addTorrent: {
        addTorrentModalProps: AddTorrentModalProps | null;
    };
}

export function useWorkspaceShellViewModel(): WorkspaceShellController {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const {
        rpcStatus,
        reconnect,
        markTransportConnected,
        uiCapabilities,
        engineInfo,
        isDetectingEngine,
        reportCommandError,
    } = useSession();
    const { sessionStats, liveTransportStatus, refreshSessionStatsData } =
        useSessionTelemetry();
    const commandPalette = useCommandPalette();
    const focusSearchInput = useCallback(() => {
        if (typeof document === "undefined") return;
        const searchInput = document.querySelector(
            'input[data-command-search="true"]',
        ) as HTMLInputElement | null;
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
    }, []);
    const canUseShell = uiCapabilities.uiMode === "Full";

    const addTorrentCheckFreeSpace = useMemo(() => {
        const rpcCheckFreeSpace = bindEngineCheckFreeSpace(torrentClient);
        if (!rpcCheckFreeSpace) return undefined;
        if (!canUseShell) {
            return rpcCheckFreeSpace;
        }
        return async (path: string): Promise<TransmissionFreeSpace> => {
            try {
                return await shellAgent.checkFreeSpace(path);
            } catch {
                return rpcCheckFreeSpace(path);
            }
        };
    }, [canUseShell, torrentClient]);

    const { isSettingsOpen, openSettings, closeSettings } = useWorkspaceModals();
    const settingsMountedRef = useRef(false);
    useEffect(() => {
        settingsMountedRef.current = true;
        return () => {
            settingsMountedRef.current = false;
        };
    }, []);

    const capabilities = useMemo<CapabilityStore>(
        () => ({
            sequentialDownload: engineInfo?.capabilities.sequentialDownload
                ? "supported"
                : engineInfo == null || isDetectingEngine
                  ? "unknown"
                  : "unsupported",
            superSeeding: torrentClient?.setSuperSeeding
                ? "supported"
                : "unsupported",
        }),
        [
            engineInfo,
            isDetectingEngine,
            torrentClient,
        ],
    );

    const settingsFlow = useSettingsFlow({
        torrentClient,
        isSettingsOpen,
        isMountedRef: settingsMountedRef,
    });

    const pollingIntervalMs = settingsFlow.settingsConfig.refresh_interval_ms;

    const torrentDomain = useWorkspaceTorrentDomain({
        torrentClient,
        settingsConfig: settingsFlow.settingsConfig,
        rpcStatus,
        pollingIntervalMs,
        markTransportConnected,
        refreshSessionStatsData,
        reportCommandError,
        capabilities,
    });

    const {
        torrents,
        ghostTorrents,
        runtimeSummary,
        isInitialLoadFinished,
        detailData,
        refreshTorrents,
        dispatch,
        selectedIds,
        selectedTorrents,
        addTorrent,
        workflow,
        handlers,
    } = torrentDomain;

    const {
        addModalState,
        openAddTorrentPicker,
        openAddMagnet,
        addSource,
        addTorrentDefaults,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
    } = addTorrent;

    const {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        handleTorrentAction,
        handleBulkAction,
        handleSetDownloadLocation,
        handleSetSequentialDownload,
        removedIds,
    } = workflow;

    const {
        handleRequestDetails,
        handleCloseDetail,
        handleFileSelectionChange,
        handleFilePriorityChange,
        handleSequentialToggle,
    } = handlers;

    const { getRootProps, getInputProps, isDragActive } = addModalState;

    const commandApi = useMemo(
        () => ({
            handleTorrentAction,
            handleBulkAction,
            setDownloadLocation: handleSetDownloadLocation,
            setSequentialDownload: handleSetSequentialDownload,
            checkFreeSpace: addTorrentCheckFreeSpace,
            openAddMagnet: async (magnetLink?: string) => {
                const outcome = openAddMagnet(magnetLink);
                if (outcome.status === "blocked_in_flight") {
                    return commandOutcome.success("queued");
                }
                return commandOutcome.success();
            },
            openAddTorrentPicker: async () => {
                const outcome = openAddTorrentPicker();
                if (outcome.status === "blocked_in_flight") {
                    return commandOutcome.success("queued");
                }
                return commandOutcome.success();
            },
        }),
        [
            handleTorrentAction,
            handleBulkAction,
            handleSetDownloadLocation,
            handleSetSequentialDownload,
            addTorrentCheckFreeSpace,
            openAddMagnet,
            openAddTorrentPicker,
        ],
    );

    const detailSetLocationFlow = useSetDownloadLocationFlow({
        torrent: detailData,
        setDownloadLocation: handleSetDownloadLocation,
    });

    const executeTrackerMutation = useCallback(
        async (intent: TorrentIntentExtended) => {
            const outcome = await dispatch(intent);
            if (outcome.status === "applied") {
                return { status: "applied" } as const;
            }
            if (outcome.status === "unsupported") {
                return { status: "unsupported" } as const;
            }
            return { status: "failed" } as const;
        },
        [dispatch],
    );

    const addTrackers = useCallback(
        (torrentId: string | number, trackers: string[]) =>
            executeTrackerMutation(
                TorrentIntents.torrentAddTracker([torrentId], trackers),
            ),
        [executeTrackerMutation],
    );

    const removeTrackers = useCallback(
        (torrentId: string | number, trackerIds: number[]) =>
            executeTrackerMutation(
                TorrentIntents.torrentRemoveTracker([torrentId], trackerIds),
            ),
        [executeTrackerMutation],
    );

    const setTrackerList = useCallback(
        (torrentId: string | number, trackerList: string) =>
            executeTrackerMutation(
                TorrentIntents.torrentSetTrackerList(torrentId, trackerList),
            ),
        [executeTrackerMutation],
    );

    const reannounceTrackers = useCallback(
        (torrentId: string | number) =>
            executeTrackerMutation(TorrentIntents.torrentReannounce(torrentId)),
        [executeTrackerMutation],
    );

    const handleEnsureSelectionActive = useCallback(() => {
        void handleBulkAction("resume");
    }, [handleBulkAction]);
    const handleEnsureSelectionPaused = useCallback(() => {
        void handleBulkAction("pause");
    }, [handleBulkAction]);
    const handleEnsureSelectionValid = useCallback(() => {
        void handleBulkAction("recheck");
    }, [handleBulkAction]);
    const handleEnsureSelectionRemoved = useCallback(() => {
        void handleBulkAction("remove");
    }, [handleBulkAction]);

    const handleWindowCommand = useCallback(
        (command: "minimize" | "maximize" | "close") => {
            if (!canUseShell) {
                return;
            }
            void shellAgent.sendWindowCommand(command);
        },
        [canUseShell],
    );

    const {
        preferences: {
            workspaceStyle,
            dismissedHudCardIds,
            addTorrentDefaults: addTorrentPreferenceDefaults,
        },
        toggleWorkspaceStyle,
        dismissHudCard,
        restoreHudCards,
        setAddTorrentDefaults,
    } = usePreferences();
    const dismissedHudCardSet = useMemo(
        () => new Set(dismissedHudCardIds),
        [dismissedHudCardIds],
    );
    const hasDismissedInsights = Boolean(dismissedHudCardSet.size);
    const hudCards = useHudCards({
        isDragActive,
        dismissedHudCardSet,
    });
    const visibleHudCards = hudCards.visibleHudCards;

    const tableWatermarkEnabled = useMemo(
        () => Boolean(settingsFlow.settingsConfig.table_watermark_enabled),
        [settingsFlow.settingsConfig.table_watermark_enabled],
    );

    const rehashStatus = useMemo(() => {
        if (!runtimeSummary.verifyingCount) {
            return undefined;
        }
        const value = runtimeSummary.verifyingAverageProgress * 100;
        const label =
            runtimeSummary.verifyingCount === 1
                ? t("toolbar.rehash_progress.single", {
                      name: runtimeSummary.singleVerifyingName ?? "",
                  })
                : t("toolbar.rehash_progress.multiple", {
                      count: runtimeSummary.verifyingCount,
                  });
        return {
            active: true,
            value: Math.min(Math.max(value, 0), 100),
            label,
        };
    }, [
        runtimeSummary.singleVerifyingName,
        runtimeSummary.verifyingAverageProgress,
        runtimeSummary.verifyingCount,
        t,
    ]);

    const transportStatus: StatusBarTransportStatus =
        rpcStatus === status.connection.connected
            ? liveTransportStatus
            : status.connection.offline;

    const emphasizeActions = useMemo(
        () => ({
            pause: false,
            reannounce: false,
            changeLocation: false,
            openFolder: false,
            forceRecheck: false,
        }),
        [],
    );

    const [filter, setFilter] = useState<DashboardFilter>(dashboardFilters.all);
    const [searchQuery, setSearchQuery] = useState("");
    const [peerSortStrategy, setPeerSortStrategy] =
        useState<PeerSortStrategy>("none");
    const [inspectorTabCommand, setInspectorTabCommand] =
        useState<DetailTab | null>(null);

    const dashboardViewModel = useDashboardViewModel({
        workspaceStyle,
        filter,
        searchQuery,
        isDragActive,
        tableWatermarkEnabled,
        torrents,
        ghostTorrents,
        isInitialLoadFinished,
        optimisticStatuses,
        removedIds,
        detailData,
        peerSortStrategy,
        inspectorTabCommand,
        handleRequestDetails,
        closeDetail: handleCloseDetail,
        generalTab: {
            handleTorrentAction,
            handleSequentialToggle,
            setLocation: detailSetLocationFlow,
        },
        handleFileSelectionChange,
        handleFilePriorityChange,
        trackerCommands: {
            addTrackers,
            removeTrackers,
            setTrackerList,
            reannounce: reannounceTrackers,
        },
        setInspectorTabCommand,
        capabilities,
    });

    const statusBarViewModel = useStatusBarViewModel({
        workspaceStyle,
        sessionStats,
        liveTransportStatus,
        transportStatus,
        rpcStatus,
        uiCapabilities,
        reconnect,
        selectedCount: selectedIds.length,
        activeDownloadCount: runtimeSummary.activeDownloadCount,
        activeDownloadRequiredBytes: runtimeSummary.activeDownloadRequiredBytes,
    });

    const navbarSelectionActions = useMemo(
        () => ({
            ensureActive: handleEnsureSelectionActive,
            ensurePaused: handleEnsureSelectionPaused,
            ensureValid: handleEnsureSelectionValid,
            ensureRemoved: handleEnsureSelectionRemoved,
        }),
        [
            handleEnsureSelectionActive,
            handleEnsureSelectionPaused,
            handleEnsureSelectionValid,
            handleEnsureSelectionRemoved,
        ],
    );

    const navbarViewModel = useNavbarViewModel({
        filter,
        searchQuery,
        setFilter,
        setSearchQuery,
        hasSelection: selectedIds.length > 0,
        emphasizeActions,
        selectionActions: navbarSelectionActions,
        rehashStatus,
        openAddTorrentPicker,
        openAddMagnet,
        openSettings,
        workspaceStyle,
        handleWindowCommand,
    });

    const settingsModalViewModel = useSettingsModalViewModel({
        config: settingsFlow.settingsConfig,
        isSaving: settingsFlow.isSettingsSaving,
        loadError: settingsFlow.settingsLoadError,
        capabilities: {
            blocklistSupported: settingsFlow.blocklistSupported,
            versionGatedSettings: settingsFlow.versionGatedSettings,
        },
        handleSave: settingsFlow.handleSaveSettings,
        handleTestPort: settingsFlow.handleTestPort,
        applyUserPreferencesPatch: settingsFlow.applyUserPreferencesPatch,
        isSettingsOpen,
        closeSettings,
        toggleWorkspaceStyle,
        workspaceStyle,
        hasDismissedInsights,
        showAddTorrentDialog: addTorrentPreferenceDefaults.showAddDialog,
        setShowAddTorrentDialog: (value: boolean) =>
            setAddTorrentDefaults({
                ...addTorrentPreferenceDefaults,
                showAddDialog: value,
            }),
        openSettings,
        restoreHudCards,
    });

    const hudViewModel = useHudViewModel({
        visibleHudCards,
        dismissHudCard,
        hasDismissedInsights,
    });

    const deletionViewModel = useDeletionViewModel({
        pendingDelete,
        clearPendingDelete,
        confirmDelete,
    });

    const commandPaletteDeps = useMemo(
        () => ({
            t,
            focusSearchInput,
            openAddTorrentPicker: commandApi.openAddTorrentPicker,
            openAddMagnet: () => commandApi.openAddMagnet(),
            openSettings,
            refreshTorrents,
            setFilter,
            selectedTorrents,
            detailData,
            handleBulkAction,
            handleRequestDetails,
            handleFileSelectionChange,
            setInspectorTabCommand,
            peerSortStrategy,
            setPeerSortStrategy,
        }),
        [
            t,
            focusSearchInput,
            commandApi,
            openSettings,
            refreshTorrents,
            setFilter,
            selectedTorrents,
            detailData,
            handleBulkAction,
            handleRequestDetails,
            handleFileSelectionChange,
            setInspectorTabCommand,
            peerSortStrategy,
            setPeerSortStrategy,
        ],
    );

    const getContextActions = useCallback(
        ({ activePart }: CommandPaletteContext) =>
            buildContextCommandActions(commandPaletteDeps, activePart),
        [commandPaletteDeps],
    );
    const commandPaletteActions = useMemo(
        () => buildCommandPaletteActions(commandPaletteDeps),
        [commandPaletteDeps],
    );
    const commandPaletteModel = useMemo(
        () => ({
            actions: commandPaletteActions,
            getContextActions,
        }),
        [commandPaletteActions, getContextActions],
    );

    const workspaceShellModel = useWorkspaceShellModel({
        dragDrop: {
            getRootProps,
            getInputProps,
            isDragActive,
        },
        workspaceStyle,
        isNativeHost: uiCapabilities.shellAgentAvailable,
        toggleWorkspaceStyle,
        settingsModal: settingsModalViewModel,
        dashboard: dashboardViewModel,
        hud: hudViewModel,
        deletion: deletionViewModel,
        navbar: navbarViewModel,
        commandPalette: commandPaletteModel,
    });

    const addTorrentModalProps = useMemo<AddTorrentModalProps | null>(() => {
        if (!addSource) {
            return null;
        }

        return {
            isOpen: true,
            source: addSource,
            downloadDir: addTorrentDefaults.downloadDir,
            commitMode: addTorrentDefaults.commitMode,
            sequentialDownload: addTorrentDefaults.sequentialDownload,
            showAddDialog: addTorrentDefaults.showAddDialog,
            sequentialDownloadCapability: capabilities.sequentialDownload,
            onCommitModeChange: addTorrentDefaults.setCommitMode,
            onSequentialDownloadChange: addTorrentDefaults.setSequentialDownload,
            onShowAddDialogChange: addTorrentDefaults.setShowAddDialog,
            onCancel: closeAddTorrentWindow,
            onConfirm: handleTorrentWindowConfirm,
        };
    }, [
        addSource,
        addTorrentDefaults,
        capabilities.sequentialDownload,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
    ]);

    return {
        shell: {
            workspace: workspaceShellModel,
            statusBar: statusBarViewModel,
        },
        commands: {
            dispatch,
            commandApi,
            commandPaletteState: {
                isOpen: commandPalette.isOpen,
                setIsOpen: commandPalette.setIsOpen,
            },
            globalHotkeys: {
                torrents,
                selectedTorrents,
                detailData,
                handleRequestDetails,
                handleCloseDetail,
            },
        },
        addTorrent: {
            addTorrentModalProps,
        },
    };
}


