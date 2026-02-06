import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STATUS } from "@/shared/status";
import { useEngineCapabilities } from "@/app/hooks/useEngineCapabilities";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

import type { CommandPaletteContext } from "@/app/components/CommandPalette";
import {
    buildCommandPaletteActions,
    buildContextCommandActions,
} from "@/app/commandRegistry";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { RecoveryContextValue } from "@/app/context/RecoveryContext";
import type { RecoveryModalViewModel } from "@/modules/dashboard/components/TorrentRecoveryModal";
import type { AddTorrentModalProps } from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import {
    useCommandPaletteDeps,
    useDashboardViewModel,
    useDeletionViewModel,
    useHudViewModel,
    useNavbarViewModel,
    useRecoveryContextModel,
    useRecoveryModalViewModel,
    useAddMagnetModalProps,
    useAddTorrentModalProps,
    useSettingsModalViewModel,
    useStatusBarViewModel,
    useWorkspaceShellModel,
} from "@/app/viewModels/workspaceShellModels";
import type {
    SettingsSnapshot,
    SettingsActions,
} from "@/app/viewModels/workspaceShellModels";
import {
    DASHBOARD_FILTERS,
    type DashboardFilter,
} from "@/modules/dashboard/types/dashboardFilter";
import type {
    StatusBarViewModel,
    StatusBarTransportStatus,
    WorkspaceShellViewModel,
} from "./useAppViewModel";

// action feedback should be consumed by lower-level hooks when needed
import { useCommandPalette } from "@/app/hooks/useCommandPalette";
import { useWorkspaceShell } from "@/app/hooks/useWorkspaceShell";
import { useWorkspaceModals } from "@/app/WorkspaceModalContext";
import { useSettingsFlow } from "@/app/hooks/useSettingsFlow";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSession, useSessionTelemetry } from "@/app/context/SessionContext";
import { useTorrentData } from "@/modules/dashboard/hooks/useTorrentData";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { useDetailControls } from "@/modules/dashboard/hooks/useDetailControls";
import { useTorrentOrchestrator } from "@/app/orchestrators/useTorrentOrchestrator";
import { useSelection } from "@/app/context/SelectionContext";
import { useTorrentWorkflow } from "@/app/hooks/useTorrentWorkflow";
import {
    dispatchTorrentAction,
    dispatchTorrentSelectionAction,
} from "@/app/utils/torrentActionDispatcher";
import {
    TorrentIntents,
    type TorrentIntentExtended,
} from "@/app/intents/torrentIntents";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { useHudCards } from "@/app/hooks/useHudCards";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { createTorrentDispatch } from "@/app/actions/torrentDispatch";

export interface WorkspaceShellController {
    shell: {
        workspace: WorkspaceShellViewModel;
        statusBar: StatusBarViewModel;
    };
    commands: {
        dispatch: (intent: TorrentIntentExtended) => Promise<void>;
        commandApi: {
            handleTorrentAction: (
                action: TorrentTableAction,
                torrent: Torrent,
                options?: { deleteData?: boolean },
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
    };
    recovery: {
        recoveryContext: RecoveryContextValue;
        recoveryModalProps: Pick<
            { viewModel: RecoveryModalViewModel },
            "viewModel"
        >;
    };
    addTorrent: {
        addMagnetModalProps: AddMagnetModalProps;
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
        reportCommandError,
    } = useSession();
    const { sessionStats, liveTransportStatus, refreshSessionStatsData } =
        useSessionTelemetry();
    // feedback handled within lower-level hooks when needed
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
    const { shellAgent } = useShellAgent();
    const browseDirectory = useMemo(() => {
        if (!shellAgent.isAvailable) return undefined;
        return async (currentPath: string) => {
            try {
                return (
                    (await shellAgent.browseDirectory(
                        currentPath || undefined,
                    )) ?? null
                );
            } catch {
                return null;
            }
        };
    }, [shellAgent]);

    const addTorrentCheckFreeSpace = useMemo(() => {
        const rpcCheckFreeSpace = torrentClient.checkFreeSpace?.bind(torrentClient);
        if (!rpcCheckFreeSpace) return undefined;
        if (!shellAgent.isAvailable || uiCapabilities.uiMode !== "Full") {
            return rpcCheckFreeSpace;
        }
        return async (path: string): Promise<TransmissionFreeSpace> => {
            try {
                return await shellAgent.checkFreeSpace(path);
            } catch {
                return rpcCheckFreeSpace(path);
            }
        };
    }, [torrentClient, shellAgent, uiCapabilities.uiMode]);
    const { isSettingsOpen, openSettings, closeSettings } =
        useWorkspaceModals();
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const capabilities = useEngineCapabilities(torrentClient);

    const settingsFlow = useSettingsFlow({
        torrentClient,
        isSettingsOpen,
        isMountedRef,
    });

    const pollingIntervalMs = Math.max(
        1000,
        settingsFlow.settingsConfig.refresh_interval_ms,
    );

    const {
        torrents,
        isInitialLoadFinished,
        refresh: refreshTorrents,
        runtimeSummary,
        ghostTorrents,
    } = useTorrentData({
        client: torrentClient,
        sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        pollingIntervalMs,
        markTransportConnected,
    });

    const {
        detailData,
        loadDetail,
        refreshDetailData,
        clearDetail,
        mutateDetail,
    } = useTorrentDetail({
        torrentClient,
        isMountedRef,
    });

    const dispatch = useMemo(
        () =>
            createTorrentDispatch({
                client: torrentClient,
                refreshTorrents,
                refreshSessionStatsData,
                refreshDetailData,
                reportCommandError,
            }),
        [
            torrentClient,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
            reportCommandError,
        ],
    );

    const orchestrator = useTorrentOrchestrator({
        client: torrentClient,
        dispatch,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        torrents,
        detailData,
        settingsConfig: settingsFlow.settingsConfig,
        clearDetail,
    });

    const { addTorrent, recovery } = orchestrator;

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
        isFinalizingExisting,
        isAddingTorrent,
        closeAddTorrentWindow,
        handleTorrentWindowConfirm,
    } = addTorrent;

    const {
        state: recoveryState,
        modal: recoveryModal,
        inlineEditor,
        setLocation,
        actions: recoveryActions,
    } = recovery;

    const {
        session: recoverySession,
        isBusy: isRecoveryBusy,
        lastOutcome: lastRecoveryOutcome,
        isDetailRecoveryBlocked,
    } = recoveryState;

    const {
        close: handleRecoveryClose,
        retry: handleRecoveryRetry,
        autoRetry: handleRecoveryAutoRetry,
        recreateFolder: handleRecoveryRecreateFolder,
    } = recoveryModal;

    /* inline editor controls are accessed via `inlineEditor` directly where needed */

    const { capability: setLocationCapability, handler: handleSetLocation } =
        setLocation;

    const {
        executeRedownload,
        resumeTorrentWithRecovery: resumeTorrent,
        probeMissingFilesIfStale,
        handlePrepareDelete,
        getRecoverySessionForKey,
    } = recoveryActions;

    useEffect(() => {
        if (!probeMissingFilesIfStale) return;
        const errored = torrents.filter(
            (torrent) =>
                torrent.errorEnvelope !== undefined &&
                torrent.errorEnvelope !== null,
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
        [selectedIdsSet, torrents],
    );

    const {
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    } = useDetailControls({
        detailData,
        mutateDetail,
        capabilities,
        dispatch,
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
        [loadDetail, setActiveId],
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
                : undefined,
        );
    }, [activeId, detailData, loadDetail, selectedTorrents]);

    useEffect(() => {
        if (!detailData) return;
        const detailKey = detailData.id ?? detailData.hash;
        if (!detailKey) return;
        const isStillPresent = torrents.some(
            (torrent) => torrent.id === detailKey || torrent.hash === detailKey,
        );
        if (isStillPresent) return;
        handleCloseDetail();
    }, [detailData, torrents, handleCloseDetail]);

    const handleEnsureValid = useCallback(
        async (torrentId: string | number) => {
            await dispatch(TorrentIntents.ensureValid(torrentId));
        },
        [dispatch],
    );

    const handleEnsureDataPresent = useCallback(
        async (torrentId: string | number) => {
            await dispatch(TorrentIntents.ensureDataPresent(torrentId));
        },
        [dispatch],
    );

    const handleEnsureAtLocation = useCallback(
        async (torrentId: string | number, path: string) => {
            await dispatch(TorrentIntents.ensureAtLocation(torrentId, path));
        },
        [dispatch],
    );

    const handleDownloadMissing = useCallback(
        async (torrent: Torrent, options?: { recreateFolder?: boolean }) => {
            await executeRedownload(torrent, options);
        },
        [executeRedownload],
    );

    const executeTorrentActionViaDispatch = (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean },
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
        deleteData: boolean,
    ) => {
        return dispatch(TorrentIntents.ensureSelectionRemoved(ids, deleteData));
    };

    const refreshAfterRecheck = useCallback(async () => {
        await refreshTorrents();
    }, [refreshTorrents]);

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
        onRecheckComplete: refreshAfterRecheck,
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
        ],
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
        [shellAgent],
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
        rpcStatus === STATUS.connection.CONNECTED
            ? liveTransportStatus
            : "offline";

    const emphasizeActions = useMemo(() => {
        const matches = (action: string) =>
            selectedTorrents.some(
                (torrent) => torrent.errorEnvelope?.primaryAction === action,
            );
        return {
            pause: matches("pause"),
            reannounce: matches("reannounce"),
            changeLocation: matches("changeLocation"),
            openFolder: matches("openFolder"),
            forceRecheck: matches("forceRecheck"),
        };
    }, [selectedTorrents]);

    const [filter, setFilter] = useState<DashboardFilter>(
        DASHBOARD_FILTERS.ALL,
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [peerSortStrategy, setPeerSortStrategy] =
        useState<PeerSortStrategy>("none");
    const [inspectorTabCommand, setInspectorTabCommand] =
        useState<DetailTab | null>(null);

    const dashboardLayoutState = useMemo(
        () => ({
            workspaceStyle,
            filter,
            searchQuery,
            isDragActive,
            tableWatermarkEnabled,
        }),
        [
            workspaceStyle,
            filter,
            searchQuery,
            isDragActive,
            tableWatermarkEnabled,
        ],
    );

    const dashboardTableState = useMemo(
        () => ({
            torrents,
            ghostTorrents,
            isInitialLoadFinished,
            optimisticStatuses,
            removedIds,
        }),
        [
            torrents,
            ghostTorrents,
            isInitialLoadFinished,
            optimisticStatuses,
            removedIds,
        ],
    );

    const dashboardDetailState = useMemo(
        () => ({
            detailData,
            peerSortStrategy,
            inspectorTabCommand,
            isDetailRecoveryBlocked,
        }),
        [
            detailData,
            peerSortStrategy,
            inspectorTabCommand,
            isDetailRecoveryBlocked,
        ],
    );

    const dashboardDetailControls = useMemo(
        () => ({
            handleRequestDetails,
            closeDetail: handleCloseDetail,
            handleFileSelectionChange,
            handleSequentialToggle,
            handleSuperSeedingToggle,
            handleEnsureValid,
            handleEnsureDataPresent,
            handleEnsureAtLocation,
            setInspectorTabCommand,
        }),
        [
            handleRequestDetails,
            handleCloseDetail,
            handleFileSelectionChange,
            handleSequentialToggle,
            handleSuperSeedingToggle,
            handleEnsureValid,
            handleEnsureDataPresent,
            handleEnsureAtLocation,
            setInspectorTabCommand,
        ],
    );

    const dashboardCapabilities = useMemo(
        () => ({ capabilities }),
        [capabilities],
    );

    const dashboardViewModel = useDashboardViewModel({
        layout: dashboardLayoutState,
        table: dashboardTableState,
        detail: dashboardDetailState,
        controls: dashboardDetailControls,
        caps: dashboardCapabilities,
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

    const navbarQueryState = useMemo(
        () => ({
            filter,
            searchQuery,
            setFilter,
            setSearchQuery,
            hasSelection: selectedIds.length > 0,
        }),
        [filter, searchQuery, setFilter, setSearchQuery, selectedIds.length],
    );

    const navbarDerivedState = useMemo(
        () => ({
            emphasizeActions,
            selectionActions: navbarSelectionActions,
            rehashStatus,
        }),
        [emphasizeActions, navbarSelectionActions, rehashStatus],
    );

    const navbarNavigation = useMemo(
        () => ({
            openAddTorrentPicker,
            openAddMagnet,
            openSettings,
        }),
        [openAddTorrentPicker, openAddMagnet, openSettings],
    );

    const navbarShellControls = useMemo(
        () => ({
            workspaceStyle,
            handleWindowCommand,
        }),
        [workspaceStyle, handleWindowCommand],
    );

    const navbarViewModel = useNavbarViewModel({
        query: navbarQueryState,
        derived: navbarDerivedState,
        navigation: navbarNavigation,
        shell: navbarShellControls,
    });

    const settingsSnapshot = useMemo<SettingsSnapshot>(
        () => ({
            config: settingsFlow.settingsConfig,
            isSaving: settingsFlow.isSettingsSaving,
            loadError: settingsFlow.settingsLoadError,
            capabilities: {
                blocklistSupported: settingsFlow.blocklistSupported,
            },
        }),
        [
            settingsFlow.settingsConfig,
            settingsFlow.isSettingsSaving,
            settingsFlow.settingsLoadError,
            settingsFlow.blocklistSupported,
        ],
    );

    const settingsActions = useMemo<SettingsActions>(
        () => ({
            handleSave: settingsFlow.handleSaveSettings,
            handleTestPort: settingsFlow.handleTestPort,
            applyUserPreferencesPatch: settingsFlow.applyUserPreferencesPatch,
        }),
        [
            settingsFlow.handleSaveSettings,
            settingsFlow.handleTestPort,
            settingsFlow.applyUserPreferencesPatch,
        ],
    );

    const settingsModalViewModel = useSettingsModalViewModel({
        isSettingsOpen,
        closeSettings,
        snapshot: settingsSnapshot,
        actions: settingsActions,
        toggleWorkspaceStyle,
        reconnect,
        workspaceStyle,
        hasDismissedInsights,
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

    const commandPaletteDeps = useCommandPaletteDeps({
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
    });

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
        toggleWorkspaceStyle,
        settingsModal: settingsModalViewModel,
        dashboard: dashboardViewModel,
        hud: hudViewModel,
        deletion: deletionViewModel,
        navbar: navbarViewModel,
        commandPalette: commandPaletteModel,
    });

    const recoveryContextEnv = useMemo(
        () => ({
            uiMode: uiCapabilities.uiMode,
            canOpenFolder: uiCapabilities.canOpenFolder,
        }),
        [uiCapabilities.uiMode, uiCapabilities.canOpenFolder],
    );

    const recoveryInlineEditorControls = useMemo(
        () => ({
            state: inlineEditor.state,
            cancel: inlineEditor.cancel,
            release: inlineEditor.release,
            confirm: inlineEditor.confirm,
            change: inlineEditor.change,
        }),
        [
            inlineEditor.state,
            inlineEditor.cancel,
            inlineEditor.release,
            inlineEditor.confirm,
            inlineEditor.change,
        ],
    );

    const recoverySessionState = useMemo(
        () => ({ recoverySession }),
        [recoverySession],
    );

    const recoveryContextSnapshot = useRecoveryContextModel({
        env: recoveryContextEnv,
        inlineEditor: recoveryInlineEditorControls,
        session: recoverySessionState,
        setLocationCapability,
        getRecoverySessionForKey,
    });

    const recoveryContext = useMemo(
        () => ({
            ...recoveryContextSnapshot,
            handleRetry: handleRecoveryRetry,
            handleDownloadMissing,
            handleSetLocation,
        }),
        [
            recoveryContextSnapshot,
            handleRecoveryRetry,
            handleDownloadMissing,
            handleSetLocation,
        ],
    );

    const recoveryModalViewModel = useRecoveryModalViewModel({
        t,
        recoverySession,
        lastOutcome: lastRecoveryOutcome,
        isBusy: isRecoveryBusy,
        onClose: handleRecoveryClose,
        onRecreate: handleRecoveryRecreateFolder,
        onAutoRetry: handleRecoveryAutoRetry,
        inlineEditor,
        setLocationCapability,
        handleSetLocation,
        handleDownloadMissing,
    });

    const addMagnetModalProps = useAddMagnetModalProps({
        isOpen: isMagnetModalOpen,
        initialValue: magnetModalInitialValue,
        onClose: handleMagnetModalClose,
        onSubmit: handleMagnetSubmit,
    });

    const addTorrentModalProps = useAddTorrentModalProps({
        addSource,
        addTorrentDefaults,
        settingsConfig: settingsFlow.settingsConfig,
        isAddingTorrent,
        isFinalizingExisting,
        onCancel: closeAddTorrentWindow,
        onConfirm: handleTorrentWindowConfirm,
        torrentClient,
        checkFreeSpace: addTorrentCheckFreeSpace,
        browseDirectory,
    });

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
        recovery: {
            recoveryContext,
            recoveryModalProps: { viewModel: recoveryModalViewModel },
        },
        addTorrent: {
            addMagnetModalProps,
            addTorrentModalProps,
        },
    };
}
