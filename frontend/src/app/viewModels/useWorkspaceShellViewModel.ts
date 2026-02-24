import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STATUS } from "@/shared/status";
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
    useAddMagnetModalProps,
    useAddTorrentModalProps,
} from "@/app/viewModels/workspaceShell/addTorrentModalViewModels";
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
    useRecoveryContextModel,
    useRecoveryModalViewModel,
} from "@/app/viewModels/workspaceShell/recoveryViewModels";
import {
    DASHBOARD_FILTERS,
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
import {
    type TorrentDispatchOutcome,
} from "@/app/actions/torrentDispatch";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type {
    TorrentIntentExtended,
} from "@/app/intents/torrentIntents";
import { useWorkspaceTorrentDomain } from "@/app/orchestrators/useWorkspaceTorrentDomain";

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
        const rpcCheckFreeSpace = torrentClient.checkFreeSpace?.bind(torrentClient);
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
            sequentialDownload: torrentClient?.setSequentialDownload
                ? "supported"
                : "unsupported",
            superSeeding: torrentClient?.setSuperSeeding
                ? "supported"
                : "unsupported",
        }),
        [torrentClient],
    );

    const settingsFlow = useSettingsFlow({
        torrentClient,
        isSettingsOpen,
        isMountedRef: settingsMountedRef,
    });

    const pollingIntervalMs = Math.max(
        1000,
        settingsFlow.settingsConfig.refresh_interval_ms,
    );

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
        recovery,
        workflow,
        handlers,
    } = torrentDomain;

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
        locationEditor,
        setLocation,
        actions: recoveryActions,
    } = recovery;

    const {
        session: recoverySession,
        isBusy: isRecoveryBusy,
        isDetailRecoveryBlocked,
        queuedCount: recoveryQueuedCount,
        queuedItems: recoveryQueuedItems,
    } = recoveryState;

    const {
        close: handleRecoveryClose,
        retry: handleRecoveryRetry,
        autoRetry: handleRecoveryAutoRetry,
    } = recoveryModal;

    const { capability: setLocationCapability, handler: handleSetLocation } =
        setLocation;
    const {
        getRecoverySessionForKey,
        openRecoveryModal,
        isDownloadMissingInFlight,
    } = recoveryActions;

    const {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        handleTorrentAction,
        handleBulkAction,
        removedIds,
    } = workflow;

    const {
        handleRequestDetails,
        handleCloseDetail,
        handleDownloadMissing,
        handleOpenFolder,
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
    } = handlers;

    const { getRootProps, getInputProps, isDragActive } = addModalState;

    const commandApi = useMemo(
        () => ({
            handleTorrentAction,
            handleBulkAction,
            openAddMagnet: async (magnetLink?: string) => {
                openAddMagnet(magnetLink);
                return { status: "success" } as const;
            },
            openAddTorrentPicker: async () => {
                openAddTorrentPicker();
                return { status: "success" } as const;
            },
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
            if (!canUseShell) {
                return;
            }
            void shellAgent.sendWindowCommand(command);
        },
        [canUseShell],
    );

    const {
        preferences: { workspaceStyle, dismissedHudCardIds },
        toggleWorkspaceStyle,
        dismissHudCard,
        restoreHudCards,
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
        rpcStatus === STATUS.connection.CONNECTED
            ? liveTransportStatus
            : STATUS.connection.OFFLINE;

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

    const [filter, setFilter] = useState<DashboardFilter>(DASHBOARD_FILTERS.ALL);
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
        isDetailRecoveryBlocked,
        handleRequestDetails,
        closeDetail: handleCloseDetail,
        handleFileSelectionChange,
        handleSequentialToggle,
        handleSuperSeedingToggle,
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
        },
        handleSave: settingsFlow.handleSaveSettings,
        handleTestPort: settingsFlow.handleTestPort,
        applyUserPreferencesPatch: settingsFlow.applyUserPreferencesPatch,
        isSettingsOpen,
        closeSettings,
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

    const recoveryContextSnapshot = useRecoveryContextModel({
        uiMode: uiCapabilities.uiMode,
        canOpenFolder: uiCapabilities.canOpenFolder,
        locationEditor,
        recoverySession,
        setLocationCapability,
        getRecoverySessionForKey,
    });

    const recoveryContext = useMemo(
        () => ({
            ...recoveryContextSnapshot,
            handleOpenFolder,
            handleRetry: handleRecoveryRetry,
            handleDownloadMissing,
            isDownloadMissingInFlight,
            handleSetLocation,
            openRecoveryModal,
        }),
        [
            recoveryContextSnapshot,
            handleOpenFolder,
            handleRecoveryRetry,
            handleDownloadMissing,
            isDownloadMissingInFlight,
            handleSetLocation,
            openRecoveryModal,
        ],
    );

    const recoveryModalViewModel = useRecoveryModalViewModel({
        t,
        recoverySession,
        isBusy: isRecoveryBusy,
        onClose: handleRecoveryClose,
        onAutoRetry: handleRecoveryAutoRetry,
        locationEditor,
        setLocationCapability,
        handleSetLocation,
        handleDownloadMissing,
        queuedCount: recoveryQueuedCount,
        queuedItems: recoveryQueuedItems,
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
