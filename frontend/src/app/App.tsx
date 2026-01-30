import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { STATUS } from "@/shared/status";
import Runtime from "@/app/runtime";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import useWorkbenchScale from "./hooks/useWorkbenchScale";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useTranslation } from "react-i18next";

import { useWorkspaceShell } from "./hooks/useWorkspaceShell";
import { useWorkspaceModals } from "./WorkspaceModalContext";
import { useSettingsFlow } from "./hooks/useSettingsFlow";
import { useTorrentWorkflow } from "./hooks/useTorrentWorkflow";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import { useActionFeedback } from "./hooks/useActionFeedback";
import { useHudCards } from "./hooks/useHudCards";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { clearProbe } from "@/services/recovery/missingFilesStore";
import { CommandPalette } from "./components/CommandPalette";
import type {
    CommandAction,
    CommandPaletteContext,
} from "./components/CommandPalette";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { GlobalHotkeysHost } from "./components/GlobalHotkeysHost";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { RecoveryProvider } from "@/app/context/RecoveryContext";
import {
    TorrentActionsProvider,
    useRequiredTorrentActions,
} from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import {
    SelectionProvider,
    useSelection,
} from "@/app/context/SelectionContext";
import { useTorrentOrchestrator } from "./orchestrators/useTorrentOrchestrator";
import { createTorrentDispatch } from "./actions/torrentDispatch";
import {
    dispatchTorrentAction,
    dispatchTorrentSelectionAction,
} from "@/app/utils/torrentActionDispatcher";
import {
    buildCommandPaletteActions,
    buildContextCommandActions,
} from "@/app/commandRegistry";
import { useSession } from "@/app/context/SessionContext";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { LifecycleProvider } from "@/app/context/LifecycleContext";
import type {
    CapabilityKey,
    CapabilityState,
    CapabilityStore,
} from "@/app/types/capabilities";
import { DEFAULT_CAPABILITY_STORE } from "@/app/types/capabilities";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { FocusProvider } from "./context/FocusContext";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RehashStatus } from "./types/workspace";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import { AddTorrentModal } from "@/modules/torrent-add/components/AddTorrentModal";
import { AddMagnetModal } from "@/modules/torrent-add/components/AddMagnetModal";
import { TorrentCommandProvider } from "@/app/context/TorrentCommandContext";
import {
    useAppViewModel,
    type WorkspaceShellViewModel,
    type StatusBarViewModel,
    type DashboardViewModel,
    type NavbarViewModel,
    type StatusBarTransportStatus,
    type SettingsModalViewModel,
} from "@/app/viewModels/useAppViewModel";
import { useWorkspaceShellViewModel } from "@/app/viewModels/useWorkspaceShellViewModel";

type TranslationFn = ReturnType<typeof useTranslation>["t"];

type AppContentProps = {
    t: TranslationFn;
    torrentClient: EngineAdapter;
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isInitialLoadFinished: ReturnType<
        typeof useTorrentData
    >["isInitialLoadFinished"];
    refreshTorrents: ReturnType<typeof useTorrentData>["refresh"];
    refreshDetailData: ReturnType<typeof useTorrentDetail>["refreshDetailData"];
    detailData: ReturnType<typeof useTorrentDetail>["detailData"];
    loadDetail: ReturnType<typeof useTorrentDetail>["loadDetail"];
    clearDetail: ReturnType<typeof useTorrentDetail>["clearDetail"];
    mutateDetail: ReturnType<typeof useTorrentDetail>["mutateDetail"];
    updateCapabilityState: (
        capability: CapabilityKey,
        state: CapabilityState
    ) => void;
    settingsFlow: ReturnType<typeof useSettingsFlow>;
    openSettings: ReturnType<typeof useWorkspaceModals>["openSettings"];
    isSettingsOpen: ReturnType<typeof useWorkspaceModals>["isSettingsOpen"];
    closeSettings: ReturnType<typeof useWorkspaceModals>["closeSettings"];
    announceAction: ReturnType<typeof useActionFeedback>["announceAction"];
    showFeedback: ReturnType<typeof useActionFeedback>["showFeedback"];
    capabilities: CapabilityStore;
    torrentClientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
};

// -----------------------------------------------------------------------------
// AppContent: The UI shell that lives INSIDE the providers.
// This component identity remains stable when data refreshes.
// -----------------------------------------------------------------------------
function AppContent({
    t,
    torrentClient,
    ghostTorrents,
    isInitialLoadFinished,
    refreshTorrents,
    refreshDetailData,
    detailData,
    torrents,
    loadDetail,
    clearDetail,
    mutateDetail,
    updateCapabilityState,
    settingsFlow,
    openSettings,
    isSettingsOpen,
    closeSettings,
    announceAction,
    showFeedback,
    capabilities,
    torrentClientRef,
    refreshTorrentsRef,
    refreshSessionStatsDataRef,
}: AppContentProps) {
    const {
        rpcStatus,
        reportCommandError,
        sessionStats,
        liveTransportStatus,
        refreshSessionStatsData,
        reconnect,
        engineInfo,
        isDetectingEngine,
        uiCapabilities,
    } = useSession();
    useEffect(() => {
        refreshSessionStatsDataRef.current = refreshSessionStatsData;
    }, [refreshSessionStatsData, refreshSessionStatsDataRef]);
    const handleReconnect = useCallback(() => {
        reconnect();
    }, [reconnect]);
    const telemetry = sessionStats?.networkTelemetry ?? null;
    const transportStatus: StatusBarTransportStatus =
        rpcStatus === STATUS.connection.CONNECTED
            ? liveTransportStatus
            : "offline";
    // -- Local UI State --
    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const commandPalette = useCommandPalette();
    const [peerSortStrategy, setPeerSortStrategy] =
        useState<PeerSortStrategy>("none");
    const [inspectorTabCommand, setInspectorTabCommand] =
        useState<DetailTab | null>(null);

    // -- Global Hotkeys --
    const focusSearchInput = useCallback(() => {
        if (typeof document === "undefined") return;
        const searchInput = document.querySelector(
            'input[data-command-search="true"]'
        ) as HTMLInputElement | null;
        if (!searchInput) return;
        searchInput.focus();
        searchInput.select();
    }, []);

    const handleInspectorTabCommandHandled = useCallback(() => {
        setInspectorTabCommand(null);
    }, []);

    // -- Orchestrator & Selection Wiring --
    // TODO: Consolidate orchestration/wiring into a thin container and keep the visible shell presentational; avoid duplicating this with the root split note above. Optional complexity should stay gated/disabled by default.
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

    const { shellAgent } = useShellAgent();

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
        handleRecoveryPickPath,
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
            (t) => t.errorEnvelope !== undefined && t.errorEnvelope !== null
        );
        errored.forEach((torrent) => {
            void probeMissingFilesIfStale(torrent);
        });
    }, [probeMissingFilesIfStale, torrents]);

    const { getRootProps, getInputProps, isDragActive } = addModalState;
    const { selectedIds, activeId, setActiveId } = useSelection();

    // Derived selection
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedIdsSet.has(torrent.id)),
        [selectedIdsSet, torrents]
    );

    const {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    } = useDetailControls({
        detailData,
        mutateDetail,
        updateCapabilityState,
    });

    // -- Detail Handling --
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

    // Ensure detail panel matches active selection if needed
    // Ensure detail panel matches active selection if needed
    useEffect(() => {
        // Only auto-update if the inspector is ALREADY open (detailData exists).
        // If closed, a single click should just select, not open.
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
    // TODO: Extract detail-selection sync into a dedicated hook (e.g., useDetailSelectionSync) to isolate side-effects and make the selection->detail coupling testable.

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
    }, [detailData, handleCloseDetail, torrents]);

    // -- Engine Display --
    // -- Workflow & Actions --
    // Safe to use here because AppContent is wrapped in TorrentActionsProvider
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
        executeSelectionAction: async (action, ids) =>
            dispatchTorrentSelectionAction({
                action,
                ids,
                dispatch,
                selectedTorrents,
                resume: resumeTorrent,
            }),
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
        [
            handleTorrentAction,
            handleBulkAction,
            openAddMagnet,
            openAddTorrentPicker,
        ]
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
    const emphasizeActions = useMemo(
        () => ({
            pause: selectedTorrents.some(
                (t) => t.errorEnvelope?.primaryAction === "pause"
            ),
            reannounce: selectedTorrents.some(
                (t) => t.errorEnvelope?.primaryAction === "reannounce"
            ),
            changeLocation: selectedTorrents.some(
                (t) => t.errorEnvelope?.primaryAction === "changeLocation"
            ),
            openFolder: selectedTorrents.some(
                (t) => t.errorEnvelope?.primaryAction === "openFolder"
            ),
            forceRecheck: selectedTorrents.some(
                (t) => t.errorEnvelope?.primaryAction === "forceRecheck"
            ),
        }),
        [selectedTorrents]
    );
    const handleWindowCommand = useCallback(
        (command: "minimize" | "maximize" | "close") => {
            if (!shellAgent.isAvailable) {
                return;
            }
            void shellAgent.sendWindowCommand(command);
        },
        [shellAgent]
    );

    // -- Shell & Layout State --
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

    const rehashStatus: RehashStatus | undefined = useMemo(() => {
        const verifyingTorrents = torrents.filter(
            (t) => t.state === "checking"
        );
        if (!verifyingTorrents.length) return undefined;

        const totalProgress = verifyingTorrents.reduce(
            (acc, t) => acc + (t.verificationProgress ?? t.progress ?? 0),
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

    const tableWatermarkEnabled = Boolean(
        settingsFlow.settingsConfig.table_watermark_enabled
    );

    const dashboardViewModel = useMemo<DashboardViewModel>(
        () => ({
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
                onInspectorTabCommandHandled: handleInspectorTabCommandHandled,
                isDetailRecoveryBlocked,
            },
        }),
        [
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
            handleInspectorTabCommandHandled,
            isDetailRecoveryBlocked,
            isDragActive,
        ]
    );

    const statusBarViewModel = useMemo<StatusBarViewModel>(
        () => ({
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            telemetry,
            rpcStatus,
            uiMode: uiCapabilities.uiMode,
            handleReconnect,
            selectedCount: selectedIds.length,
            torrents,
        }),
        [
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            telemetry,
            rpcStatus,
            uiCapabilities.uiMode,
            handleReconnect,
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
            handleEnsureSelectionActive,
            handleEnsureSelectionPaused,
            handleEnsureSelectionValid,
            handleEnsureSelectionRemoved,
            rehashStatus,
            workspaceStyle,
            handleWindowCommand,
        ]
    );

    const settingsModalViewModel = useMemo<SettingsModalViewModel>(
        () => ({
            isOpen: isSettingsOpen,
            onClose: closeSettings,
            initialConfig: settingsFlow.settingsConfig,
            isSaving: settingsFlow.isSettingsSaving,
            onSave: settingsFlow.handleSaveSettings,
            settingsLoadError: settingsFlow.settingsLoadError ?? undefined,
            onTestPort: settingsFlow.handleTestPort,
            onRestoreInsights: restoreHudCards,
            onToggleWorkspaceStyle: toggleWorkspaceStyle,
            onReconnect: handleReconnect,
            onOpen: openSettings,
            isNativeMode: shellAgent.isAvailable,
            isImmersive: workspaceStyle === "immersive",
            hasDismissedInsights,
            onApplyUserPreferencesPatch:
                settingsFlow.applyUserPreferencesPatch,
        }),
        [
            isSettingsOpen,
            closeSettings,
            settingsFlow.settingsConfig,
            settingsFlow.isSettingsSaving,
            settingsFlow.handleSaveSettings,
            settingsFlow.settingsLoadError,
            settingsFlow.handleTestPort,
            restoreHudCards,
            toggleWorkspaceStyle,
            handleReconnect,
            openSettings,
            shellAgent.isAvailable,
            workspaceStyle,
            hasDismissedInsights,
            settingsFlow.applyUserPreferencesPatch,
        ]
    );

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

    const workspaceShellViewModel = useWorkspaceShellViewModel({
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
    });

    const viewModel = useAppViewModel({
        workspaceShell: workspaceShellViewModel,
        statusBar: statusBarViewModel,
        dashboard: dashboardViewModel,
    });

    // -- Command Palette Configuration --
    const commandPaletteDeps = useMemo(
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

    const commandActions = useMemo(
        () => buildCommandPaletteActions(commandPaletteDeps),
        [commandPaletteDeps]
    );

    const getContextActions = useCallback(
        ({ activePart }: CommandPaletteContext) =>
            buildContextCommandActions(commandPaletteDeps, activePart),
        [commandPaletteDeps]
    );

    // -- Render --
    return (
        <TorrentCommandProvider value={commandApi}>
            <GlobalHotkeysHost
                torrents={torrents}
                selectedTorrents={selectedTorrents}
                detailData={detailData}
                handleRequestDetails={handleRequestDetails}
                handleCloseDetail={handleCloseDetail}
            />
            <RecoveryProvider
                value={{
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
                    getRecoverySessionForKey,
                    recoverySession,
                }}
            >
                {/* TODO: Introduce a recovery view-model/provider that wraps orchestrator state/actions so RecoveryProvider consumes a minimal interface and stays decoupled from add-torrent wiring. */}
                {/* TODO: Recovery view-model should expose only what the UI needs (state + a few callbacks) and hide orchestration internals. */}
                <WorkspaceShell workspaceViewModel={viewModel.workspace} />
                <TorrentRecoveryModal
                    isOpen={Boolean(recoverySession)}
                    torrent={recoverySession?.torrent ?? null}
                    outcome={
                        lastRecoveryOutcome ?? recoverySession?.outcome ?? null
                    }
                    onClose={handleRecoveryClose}
                    onRecreate={handleRecoveryRecreateFolder}
                    onAutoRetry={handleRecoveryAutoRetry}
                    isBusy={isRecoveryBusy}
                />
            </RecoveryProvider>
                <CommandPalette
                    isOpen={commandPalette.isOpen}
                    onOpenChange={commandPalette.setIsOpen}
                    actions={commandActions}
                    getContextActions={getContextActions}
                />
            <AddMagnetModal
                isOpen={isMagnetModalOpen}
                initialValue={magnetModalInitialValue}
                onClose={handleMagnetModalClose}
                onSubmit={handleMagnetSubmit}
            />
            {addSource && addSource.kind === "file" && (
                <AddTorrentModal
                    isOpen={true}
                    source={addSource}
                    downloadDir={
                        addTorrentDefaults.downloadDir ||
                        settingsFlow.settingsConfig.download_dir
                    }
                    commitMode={addTorrentDefaults.commitMode}
                    onDownloadDirChange={addTorrentDefaults.setDownloadDir}
                    onCommitModeChange={addTorrentDefaults.setCommitMode}
                    isSubmitting={isAddingTorrent || isFinalizingExisting}
                    isResolvingSource={isResolvingMagnet}
                    onCancel={closeAddTorrentWindow}
                    onConfirm={handleTorrentWindowConfirm}
                    checkFreeSpace={torrentClient.checkFreeSpace}
                    onBrowseDirectory={
                        shellAgent.isAvailable
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
                            : undefined
                    }
                />
            )}
        </TorrentCommandProvider>
    );
}

// -----------------------------------------------------------------------------
// App: The Root Component.
// Handles Data, Providers, and Orchestration initialization.
// -----------------------------------------------------------------------------
export default function App() {
    const { t } = useTranslation();
    const { isSettingsOpen, openSettings, closeSettings } =
        useWorkspaceModals();
    const { announceAction, showFeedback } = useActionFeedback();
    const torrentClient = useTorrentClient();
    const torrentClientRef = useRef<EngineAdapter | null>(null);
    useEffect(() => {
        torrentClientRef.current = torrentClient;
    }, [torrentClient]);

    const [capabilities, setCapabilities] = useState<CapabilityStore>(
        DEFAULT_CAPABILITY_STORE
    );

    const updateCapabilityState = useCallback(
        (capability: CapabilityKey, state: CapabilityState) => {
            setCapabilities((prev) => {
                if (prev[capability] === state) return prev;
                return { ...prev, [capability]: state };
            });
        },
        []
    );

    const session = useSession();
    const {
        rpcStatus,
        refreshSessionSettings,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        updateRequestTimeout,
        engineInfo,
        isDetectingEngine,
        sessionStats,
        liveTransportStatus,
        refreshSessionStatsData,
    } = session;

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
    // TODO: Extract capability state detection (sequential/super-seeding) into a reusable hook collocated with capability store logic so consumers read from a single source of truth.

    const isMountedRef = useRef(false);

    // Workbench zoom: initialize global scale hook
    const { increase, decrease, reset } = useWorkbenchScale();

    useEffect(() => {
        if (Runtime.isNativeHost && typeof document !== "undefined") {
            document.documentElement.dataset.nativeHost = "true";
        }
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // Zoom IN
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Equal" || e.code === "NumpadAdd")
            ) {
                e.preventDefault();
                increase();
                return;
            }
            // Zoom OUT
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Minus" || e.code === "NumpadSubtract")
            ) {
                e.preventDefault();
                decrease();
                return;
            }
            // Reset zoom
            if (
                ((e.ctrlKey || e.metaKey) && e.code === "Digit0") ||
                (e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    e.code === "NumpadMultiply")
            ) {
                if (Runtime.suppressBrowserZoomDefaults()) {
                    e.preventDefault();
                }
                reset();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [increase, decrease, reset]);

    const refreshSessionStatsDataRef = useRef<() => Promise<void>>(
        async () => {}
    );
    const refreshTorrentsRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => {
        refreshSessionStatsDataRef.current = refreshSessionStatsData;
    }, [refreshSessionStatsData]);

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
    // TODO: Extract data-loading concerns (torrents/detail/stats) into a composable data provider to isolate side effects from App wiring and make polling intervals/config centralized.

    useEffect(() => {
        refreshTorrentsRef.current = refreshTorrents;
    }, [refreshTorrents]);

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
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const torrentDispatch = useMemo(
        () =>
            createTorrentDispatch({
                client: torrentClient,
                clientRef: torrentClientRef,
                refreshTorrentsRef,
                refreshSessionStatsDataRef,
                refreshDetailData,
                reportCommandError,
            }),
        [
            torrentClient,
            torrentClientRef,
            refreshTorrentsRef,
            refreshSessionStatsDataRef,
            refreshDetailData,
            reportCommandError,
        ]
    );
    // TODO: Move dispatch creation into TorrentActionsProvider (or a factory hook) to avoid re-creating it here and reduce App responsibilities; App should only wire providers.

    // Create the stable Actions object to pass down
    const actions = useMemo(
        () => ({ dispatch: torrentDispatch }),
        [torrentDispatch]
    );

    return (
        <FocusProvider>
                <LifecycleProvider>
                    <TorrentActionsProvider actions={actions}>
                        <SelectionProvider>
                            <AppContent
                                t={t}
                                torrentClient={torrentClient}
                                torrents={torrents}
                                ghostTorrents={ghostTorrents}
                                isInitialLoadFinished={isInitialLoadFinished}
                                refreshTorrents={refreshTorrents}
                                refreshDetailData={refreshDetailData}
                                detailData={detailData}
                                loadDetail={loadDetail}
                                clearDetail={clearDetail}
                                mutateDetail={mutateDetail}
                                updateCapabilityState={updateCapabilityState}
                                settingsFlow={settingsFlow}
                                torrentClientRef={torrentClientRef}
                                refreshTorrentsRef={refreshTorrentsRef}
                                refreshSessionStatsDataRef={
                                    refreshSessionStatsDataRef
                                }
                                openSettings={openSettings}
                                isSettingsOpen={isSettingsOpen}
                                closeSettings={closeSettings}
                                announceAction={announceAction}
                                showFeedback={showFeedback}
                                capabilities={capabilities}
                            />
                        </SelectionProvider>
                    </TorrentActionsProvider>
                </LifecycleProvider>
            </FocusProvider>
    );
}
