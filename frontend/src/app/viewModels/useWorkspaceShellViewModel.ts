import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STATUS } from "@/shared/status";
import Runtime from "@/app/runtime";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { MutableRefObject } from "react";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type {
    CapabilityKey,
    CapabilityState,
    CapabilityStore,
} from "@/app/types/capabilities";
import { DEFAULT_CAPABILITY_STORE } from "@/app/types/capabilities";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { UiMode } from "@/app/utils/uiMode";
import type {
    SessionStats,
    NetworkTelemetry,
} from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import type {
    CommandAction,
    CommandPaletteContext,
} from "@/app/components/CommandPalette";
import type { CommandPaletteDeps } from "@/app/commandRegistry";
import {
    buildCommandPaletteActions,
    buildContextCommandActions,
} from "@/app/commandRegistry";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { RecoveryContextValue } from "@/app/context/RecoveryContext";
import type { TorrentRecoveryModalProps } from "@/modules/dashboard/components/TorrentRecoveryModal";
import type {
    AddTorrentModalProps,
    AddTorrentSource,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import type {
    DashboardViewModel,
    DashboardDetailViewModel,
    NavbarViewModel,
    SettingsModalViewModel,
    StatusBarViewModel,
    StatusBarTransportStatus,
    WorkspaceShellViewModel,
} from "./useAppViewModel";

import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useCommandPalette } from "@/app/hooks/useCommandPalette";
import { useWorkspaceShell } from "@/app/hooks/useWorkspaceShell";
import { useWorkspaceModals } from "@/app/WorkspaceModalContext";
import { useSettingsFlow } from "@/app/hooks/useSettingsFlow";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { useTorrentOrchestrator } from "@/app/orchestrators/useTorrentOrchestrator";
import { useSelection } from "@/app/context/SelectionContext";
import { useTorrentWorkflow } from "@/app/hooks/useTorrentWorkflow";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import {
    dispatchTorrentAction,
    dispatchTorrentSelectionAction,
} from "@/app/utils/torrentActionDispatcher";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { useHudCards } from "@/app/hooks/useHudCards";
import { clearProbe } from "@/services/recovery/missingFilesStore";

export interface WorkspaceShellController {
    workspace: WorkspaceShellViewModel;
    commandApi: {
        handleTorrentAction: (
            action: TorrentTableAction,
            torrent: Torrent,
            options?: { deleteData?: boolean }
        ) => Promise<void>;
        handleBulkAction: (action: TorrentTableAction) => Promise<void>;
        openAddMagnet: () => void;
        openAddTorrentPicker: () => void;
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
    recoveryContext: RecoveryContextValue;
    recoveryModalProps: Pick<
        TorrentRecoveryModalProps,
        | "isOpen"
        | "torrent"
        | "outcome"
        | "onClose"
        | "onRecreate"
        | "onAutoRetry"
        | "isBusy"
    >;
    addMagnetModalProps: AddMagnetModalProps;
    addTorrentModalProps: AddTorrentModalProps | null;
}

export interface UseWorkspaceShellViewModelParams {
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshDetailDataRef: MutableRefObject<() => Promise<void>>;
    torrentClientRef: MutableRefObject<EngineAdapter | null>;
}

export function useWorkspaceShellViewModel({
    refreshSessionStatsDataRef,
    refreshTorrentsRef,
    refreshDetailDataRef,
    torrentClientRef,
}: UseWorkspaceShellViewModelParams): WorkspaceShellController {
    const { t } = useTranslation();
    const torrentClient = useTorrentClient();
    const {
        rpcStatus,
        reportCommandError,
        reportReadError,
        engineInfo,
        isDetectingEngine,
        sessionStats,
        liveTransportStatus,
        refreshSessionStatsData,
        reconnect,
        refreshSessionSettings,
        markTransportConnected,
        uiCapabilities,
        updateRequestTimeout,
    } = useSession();
    const { announceAction, showFeedback } = useActionFeedback();
    const commandPalette = useCommandPalette();
    const focusSearchInput = useCallback(() => {
        if (typeof document === "undefined") return;
        const searchInput = document.querySelector(
            'input[data-command-search="true"]'
        ) as HTMLInputElement | null;
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
    }, []);
    const { shellAgent } = useShellAgent();
    const { isSettingsOpen, openSettings, closeSettings } =
        useWorkspaceModals();
    const [capabilities, setCapabilities] =
        useState<CapabilityStore>(DEFAULT_CAPABILITY_STORE);

    const isMountedRef = useRef(false);

    useEffect(() => {
        torrentClientRef.current = torrentClient;
    }, [torrentClient, torrentClientRef]);

    useEffect(() => {
        refreshSessionStatsDataRef.current = refreshSessionStatsData;
    }, [refreshSessionStatsData, refreshSessionStatsDataRef]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const updateCapabilityState = useCallback(
        (capability: CapabilityKey, state: CapabilityState) => {
            setCapabilities((prev) => {
                if (prev[capability] === state) return prev;
                return { ...prev, [capability]: state };
            });
        },
        []
    );

    useEffect(() => {
        if (!torrentClient.setSequentialDownload) {
            updateCapabilityState("sequentialDownload", "unsupported");
            return;
        }
        if (capabilities.sequentialDownload === "unsupported") {
            updateCapabilityState("sequentialDownload", "unknown");
        }
    }, [
        torrentClient.setSequentialDownload,
        capabilities.sequentialDownload,
        updateCapabilityState,
    ]);

    useEffect(() => {
        if (!torrentClient.setSuperSeeding) {
            updateCapabilityState("superSeeding", "unsupported");
            return;
        }
        if (capabilities.superSeeding === "unsupported") {
            updateCapabilityState("superSeeding", "unknown");
        }
    }, [
        torrentClient.setSuperSeeding,
        capabilities.superSeeding,
        updateCapabilityState,
    ]);

    const settingsFlow = useSettingsFlow({
        torrentClient,
        refreshTorrentsRef,
        refreshSessionStatsDataRef,
        refreshSessionSettings,
        reportCommandError,
        rpcStatus,
        isSettingsOpen,
        isMountedRef,
        updateRequestTimeout,
    });

    const pollingIntervalMs = Math.max(
        1000,
        settingsFlow.settingsConfig.refresh_interval_ms
    );

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        ghostTorrents,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        pollingIntervalMs,
        markTransportConnected,
        reportReadError,
    });

    useEffect(() => {
        refreshTorrentsRef.current = refreshTorrents;
    }, [refreshTorrents, refreshTorrentsRef]);

    const {
        detailData,
        loadDetail,
        refreshDetailData,
        clearDetail,
        mutateDetail,
    } = useTorrentDetail({
        torrentClient,
        reportReadError,
        isMountedRef,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
    });

    useEffect(() => {
        refreshDetailDataRef.current = refreshDetailData;
    }, [refreshDetailData, refreshDetailDataRef]);

    const orchestrator = useTorrentOrchestrator({
        client: torrentClient,
        clientRef: torrentClientRef,
        refreshTorrentsRef,
        refreshSessionStatsDataRef,
        refreshDetailData,
        torrents,
        detailData,
        rpcStatus,
        settingsFlow,
        showFeedback,
        reportCommandError,
        t,
        clearDetail,
    });

    const {
        addModalState,
        openAddTorrentPicker,
        openAddMagnet,
        isMagnetModalOpen,
        magnetModalInitialValue,
        handleMagnetModalClose,
        handleMagnetSubmit,
        addSource,
        addTorrentDefaults,
        isResolvingMagnet,
        isFinalizingExisting,
        isAddingTorrent,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
        recoverySession,
        isRecoveryBusy,
        lastRecoveryOutcome,
        isDetailRecoveryBlocked,
        handleRecoveryClose,
        handleSetLocation,
        setLocationCapability,
        getRecoverySessionForKey,
        inlineSetLocationState,
        cancelInlineSetLocation,
        releaseInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        handleRecoveryRecreateFolder,
        handleRecoveryRetry,
        handleRecoveryPickPath,
        handleRecoveryAutoRetry,
        resumeTorrentWithRecovery: resumeTorrent,
        probeMissingFilesIfStale,
        executeRedownload,
        executeRetryFetch,
        handlePrepareDelete,
        canOpenFolder,
        uiMode,
    } = orchestrator;

    useEffect(() => {
        if (!probeMissingFilesIfStale) return;
        const errored = torrents.filter(
            (torrent) => torrent.errorEnvelope !== undefined && torrent.errorEnvelope !== null
        );
        errored.forEach((torrent) => {
            void probeMissingFilesIfStale(torrent);
        });
    }, [probeMissingFilesIfStale, torrents]);

    const { getRootProps, getInputProps, isDragActive } = addModalState;
    const { selectedIds, activeId, setActiveId } = useSelection();
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents]
    );

    const { handleFileSelectionChange, handleSequentialToggle, handleSuperSeedingToggle } =
        useDetailControls({
            detailData,
            mutateDetail,
            updateCapabilityState,
        });

    const handleRequestDetails = useCallback(
        async (torrent: Torrent) => {
            setActiveId(torrent.id);
            await loadDetail(torrent.id, {
                ...torrent,
                trackers: [],
                files: [],
                peers: [],
            } as TorrentDetail);
        },
        [loadDetail, setActiveId]
    );

    const handleCloseDetail = useCallback(() => {
        setActiveId(null);
        clearDetail();
    }, [clearDetail, setActiveId]);

    useEffect(() => {
        if (!activeId || !detailData) return;
        if (detailData.id === activeId) return;
        const activeTorrent =
            selectedTorrents.find((torrent) => torrent.id === activeId) ?? null;
        void loadDetail(
            activeId,
            activeTorrent
                ? ({
                      ...activeTorrent,
                      trackers: [],
                      files: [],
                      peers: [],
                  } as TorrentDetail)
                : undefined
        );
    }, [activeId, detailData, loadDetail, selectedTorrents]);

    useEffect(() => {
        if (!detailData) return;
        const detailKey = detailData.id ?? detailData.hash;
        if (!detailKey) return;
        const isStillPresent = torrents.some(
            (torrent) => torrent.id === detailKey || torrent.hash === detailKey
        );
        if (isStillPresent) return;
        clearProbe(detailKey);
        handleCloseDetail();
    }, [detailData, clearDetail, torrents]);

    const { dispatch } = useRequiredTorrentActions();

    const handleDownloadMissing = useCallback(
        async (torrent: Torrent, options?: { recreateFolder?: boolean }) => {
            await executeRedownload(torrent, options);
        },
        [executeRedownload]
    );

    const executeTorrentActionViaDispatch = (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean }
    ) =>
        dispatchTorrentAction({
            action,
            torrent,
            options,
            dispatch,
            resume: resumeTorrent,
        });

    const executeBulkRemoveViaDispatch = async (
        ids: string[],
        deleteData: boolean
    ) => {
        return dispatch(TorrentIntents.ensureSelectionRemoved(ids, deleteData));
    };

    const {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        handleTorrentAction,
        handleBulkAction,
        removedIds,
    } = useTorrentWorkflow({
        torrents,
        executeTorrentAction: executeTorrentActionViaDispatch,
        executeBulkRemove: executeBulkRemoveViaDispatch,
        onPrepareDelete: handlePrepareDelete,
        executeSelectionAction: async (action, targets) => {
            const ids = targets
                .map((torrent) => torrent.id ?? torrent.hash)
                .filter((id): id is string => Boolean(id));
            await dispatchTorrentSelectionAction({
                action,
                ids,
                torrents: targets,
                dispatch,
                resume: resumeTorrent,
            });
        },
        announceAction,
        showFeedback,
    });

    const commandApi = useMemo(
        () => ({
            handleTorrentAction,
            handleBulkAction,
            openAddMagnet,
            openAddTorrentPicker,
        }),
        [handleTorrentAction, handleBulkAction, openAddMagnet, openAddTorrentPicker]
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
            if (!shellAgent.isAvailable) {
                return;
            }
            void shellAgent.sendWindowCommand(command);
        },
        [shellAgent]
    );

    const {
        workspaceStyle,
        toggleWorkspaceStyle,
        dismissedHudCardSet,
        dismissHudCard,
        restoreHudCards,
    } = useWorkspaceShell();
    const hasDismissedInsights = Boolean(dismissedHudCardSet.size);

    const hudCards = useHudCards({
        rpcStatus,
        engineInfo,
        isDetectingEngine,
        isDragActive,
        dismissedHudCardSet,
    });

    const visibleHudCards = hudCards.visibleHudCards;

    const tableWatermarkEnabled = useMemo(
        () => Boolean(settingsFlow.settingsConfig.table_watermark_enabled),
        [settingsFlow.settingsConfig.table_watermark_enabled]
    );

    const rehashStatus = useMemo(() => {
        const verifyingTorrents = torrents.filter(
            (torrent) => torrent.state === "checking"
        );
        if (!verifyingTorrents.length) {
            return undefined;
        }
        const totalProgress = verifyingTorrents.reduce(
            (acc, torrent) =>
                acc + (torrent.verificationProgress ?? torrent.progress ?? 0),
            0
        );
        const value = (totalProgress / verifyingTorrents.length) * 100;
        const label =
            verifyingTorrents.length === 1
                ? t("toolbar.rehash_progress.single", {
                      name: verifyingTorrents[0].name,
                  })
                : t("toolbar.rehash_progress.multiple", {
                      count: verifyingTorrents.length,
                  });
        return {
            active: true,
            value: Math.min(Math.max(value, 0), 100),
            label,
        };
    }, [t, torrents]);

    const transportStatus: StatusBarTransportStatus =
        rpcStatus === STATUS.connection.CONNECTED
            ? liveTransportStatus
            : "offline";

    const emphasizeActions = useMemo<NavbarViewModel["emphasizeActions"]>(
        () => {
            const matches = (action: string) =>
                selectedTorrents.some(
                    (torrent) => torrent.errorEnvelope?.primaryAction === action
                );
            return {
                pause: matches("pause"),
                reannounce: matches("reannounce"),
                changeLocation: matches("changeLocation"),
                openFolder: matches("openFolder"),
                forceRecheck: matches("forceRecheck"),
            };
        },
        [selectedTorrents]
    );

    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [peerSortStrategy, setPeerSortStrategy] =
        useState<PeerSortStrategy>("none");
    const [inspectorTabCommand, setInspectorTabCommand] =
        useState<DetailTab | null>(null);

    const dashboardViewModel = useMemo<DashboardViewModel>(() => {
        return {
            workspaceStyle,
            filter,
            searchQuery,
            detailSplitDirection: undefined,
            table: {
                torrents,
                ghostTorrents,
                isLoading: !isInitialLoadFinished,
                capabilities,
                optimisticStatuses,
                tableWatermarkEnabled,
                filter,
                searchQuery,
                isDropActive: isDragActive,
                removedIds,
            },
            detail: {
                detailData,
                handleRequestDetails,
                closeDetail: handleCloseDetail,
                handleFileSelectionChange,
                sequentialToggleHandler: handleSequentialToggle,
                superSeedingToggleHandler: handleSuperSeedingToggle,
                peerSortStrategy,
                inspectorTabCommand,
                onInspectorTabCommandHandled: () => setInspectorTabCommand(null),
                isDetailRecoveryBlocked,
                handlePeerContextAction: undefined,
            },
        };
    }, [
        workspaceStyle,
        filter,
        searchQuery,
        torrents,
        ghostTorrents,
        isInitialLoadFinished,
        capabilities,
        optimisticStatuses,
        tableWatermarkEnabled,
        detailData,
        handleRequestDetails,
        handleCloseDetail,
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
        peerSortStrategy,
        inspectorTabCommand,
        isDetailRecoveryBlocked,
        isDragActive,
        removedIds,
    ]);

    const statusBarViewModel = useMemo<StatusBarViewModel>(
        () => ({
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            telemetry: sessionStats?.networkTelemetry ?? null,
            rpcStatus,
            uiMode: uiCapabilities.uiMode,
            handleReconnect: reconnect,
            selectedCount: selectedIds.length,
            torrents,
        }),
        [
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            rpcStatus,
            reconnect,
            uiCapabilities.uiMode,
            selectedIds.length,
            torrents,
        ]
    );

    const navbarViewModel = useMemo<NavbarViewModel>(
        () => ({
            filter,
            searchQuery,
            setFilter,
            setSearchQuery,
            onAddTorrent: openAddTorrentPicker,
            onAddMagnet: openAddMagnet,
            onSettings: openSettings,
            hasSelection: selectedIds.length > 0,
            emphasizeActions,
            selectionActions: {
                ensureActive: handleEnsureSelectionActive,
                ensurePaused: handleEnsureSelectionPaused,
                ensureValid: handleEnsureSelectionValid,
                ensureRemoved: handleEnsureSelectionRemoved,
            },
            rehashStatus,
            workspaceStyle,
            onWindowCommand: handleWindowCommand,
        }),
        [
            filter,
            searchQuery,
            setFilter,
            setSearchQuery,
            openAddTorrentPicker,
            openAddMagnet,
            openSettings,
            selectedIds.length,
            emphasizeActions,
            rehashStatus,
            workspaceStyle,
            handleEnsureSelectionActive,
            handleEnsureSelectionPaused,
            handleEnsureSelectionValid,
            handleEnsureSelectionRemoved,
            handleWindowCommand,
        ]
    );

    const settingsModalViewModel = useMemo<SettingsModalViewModel>(() => {
        return {
            isOpen: isSettingsOpen,
            onClose: closeSettings,
            initialConfig: settingsFlow.settingsConfig,
            isSaving: settingsFlow.isSettingsSaving,
            onSave: settingsFlow.handleSaveSettings,
            settingsLoadError: settingsFlow.settingsLoadError,
            onTestPort: settingsFlow.handleTestPort,
            onRestoreInsights: restoreHudCards,
            onToggleWorkspaceStyle: toggleWorkspaceStyle,
            onReconnect: reconnect,
            isNativeMode: shellAgent.isAvailable,
            isImmersive: workspaceStyle === "immersive",
            hasDismissedInsights,
            onApplyUserPreferencesPatch:
                settingsFlow.applyUserPreferencesPatch,
            onOpen: openSettings,
        };
    }, [
        isSettingsOpen,
        closeSettings,
        settingsFlow,
        toggleWorkspaceStyle,
        reconnect,
        shellAgent.isAvailable,
        workspaceStyle,
        hasDismissedInsights,
        openSettings,
        restoreHudCards,
    ]);

    const hudViewModel = useMemo(
        () => ({
            visibleHudCards,
            dismissHudCard,
            hasDismissedInsights,
        }),
        [visibleHudCards, dismissHudCard, hasDismissedInsights]
    );

    const deletionViewModel = useMemo(
        () => ({
            pendingDelete,
            clearPendingDelete,
            confirmDelete,
        }),
        [pendingDelete, clearPendingDelete, confirmDelete]
    );

    const commandPaletteDeps = useMemo<CommandPaletteDeps>(
        () => ({
            t,
            focusSearchInput,
            openAddTorrentPicker,
            openAddMagnet,
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
            openAddTorrentPicker,
            openAddMagnet,
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
        ]
    );

    const getContextActions = useCallback(
        ({ activePart }: CommandPaletteContext) =>
            buildContextCommandActions(commandPaletteDeps, activePart),
        [commandPaletteDeps]
    );

    const commandPaletteActions = useMemo(
        () => buildCommandPaletteActions(commandPaletteDeps),
        [commandPaletteDeps]
    );

    const commandPaletteModel = useMemo(
        () => ({
            actions: commandPaletteActions,
            getContextActions,
        }),
        [commandPaletteActions, getContextActions]
    );

    const workspaceShellModel = useMemo<WorkspaceShellViewModel>(
        () => ({
            dragAndDrop: {
                getRootProps,
                getInputProps,
                isDragActive,
            },
            workspaceStyle: {
                workspaceStyle,
                toggleWorkspaceStyle,
            },
            settingsModal: settingsModalViewModel,
            dashboard: dashboardViewModel,
            hud: hudViewModel,
            deletion: deletionViewModel,
            navbar: navbarViewModel,
            statusBar: statusBarViewModel,
            isNativeHost: Runtime.isNativeHost,
            commandPalette: commandPaletteModel,
        }),
        [
            getRootProps,
            getInputProps,
            isDragActive,
            workspaceStyle,
            toggleWorkspaceStyle,
            settingsModalViewModel,
            dashboardViewModel,
            hudViewModel,
            deletionViewModel,
            navbarViewModel,
            statusBarViewModel,
            commandPaletteModel,
        ]
    );

    const recoveryContext = useMemo<RecoveryContextValue>(
        () => ({
            uiMode,
            canOpenFolder,
            handleRetry: handleRecoveryRetry,
            handleDownloadMissing,
            handleSetLocation,
            setLocationCapability,
            inlineSetLocationState,
            cancelInlineSetLocation,
            releaseInlineSetLocation,
            confirmInlineSetLocation,
            handleInlineLocationChange,
            recoverySession,
            getRecoverySessionForKey,
        }),
        [
            uiMode,
            canOpenFolder,
            handleRecoveryRetry,
            handleDownloadMissing,
            handleSetLocation,
            setLocationCapability,
            inlineSetLocationState,
            cancelInlineSetLocation,
            releaseInlineSetLocation,
            confirmInlineSetLocation,
            handleInlineLocationChange,
            recoverySession,
            getRecoverySessionForKey,
        ]
    );

    const recoveryModalProps = useMemo<
        Pick<
            TorrentRecoveryModalProps,
            | "isOpen"
            | "torrent"
            | "outcome"
            | "onClose"
            | "onRecreate"
            | "onAutoRetry"
            | "isBusy"
        >
    >(
        () => ({
            isOpen: Boolean(recoverySession),
            torrent: recoverySession?.torrent ?? null,
            outcome: lastRecoveryOutcome ?? recoverySession?.outcome ?? null,
            onClose: handleRecoveryClose,
            onRecreate: handleRecoveryRecreateFolder,
            onAutoRetry: handleRecoveryAutoRetry,
            isBusy: isRecoveryBusy,
        }),
        [
            recoverySession,
            lastRecoveryOutcome,
            handleRecoveryClose,
            handleRecoveryRecreateFolder,
            handleRecoveryAutoRetry,
            isRecoveryBusy,
        ]
    );

    const addMagnetModalProps = useMemo<AddMagnetModalProps>(
        () => ({
            isOpen: isMagnetModalOpen,
            initialValue: magnetModalInitialValue,
            onClose: handleMagnetModalClose,
            onSubmit: handleMagnetSubmit,
        }),
        [
            isMagnetModalOpen,
            magnetModalInitialValue,
            handleMagnetModalClose,
            handleMagnetSubmit,
        ]
    );

    const addTorrentModalProps = useMemo<AddTorrentModalProps | null>(() => {
        if (!addSource) return null;
        return {
            isOpen: true,
            source: addSource,
            downloadDir:
                addTorrentDefaults.downloadDir ||
                settingsFlow.settingsConfig.download_dir,
            commitMode: addTorrentDefaults.commitMode,
            onDownloadDirChange: addTorrentDefaults.setDownloadDir,
            onCommitModeChange: addTorrentDefaults.setCommitMode,
            isSubmitting: isAddingTorrent || isFinalizingExisting,
            isResolvingSource: isResolvingMagnet,
            onCancel: closeAddTorrentWindow,
            onConfirm: handleTorrentWindowConfirm,
            checkFreeSpace: torrentClient.checkFreeSpace,
            onBrowseDirectory: shellAgent.isAvailable
                ? async (currentPath: string) => {
                      try {
                          return (
                              (await shellAgent.browseDirectory(
                                  currentPath || undefined
                              )) ?? null
                          );
                      } catch {
                          return null;
                      }
                  }
                : undefined,
        };
    }, [
        addSource,
        addTorrentDefaults,
        settingsFlow.settingsConfig.download_dir,
        isAddingTorrent,
        isFinalizingExisting,
        isResolvingMagnet,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
        torrentClient,
        shellAgent,
    ]);

    return {
        workspace: workspaceShellModel,
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
        recoveryContext,
        recoveryModalProps,
        addMagnetModalProps,
        addTorrentModalProps,
    };
}
