import { useCallback, useMemo } from "react";
import type {
    DashboardViewModel,
    NavbarViewModel,
    SettingsModalViewModel,
    StatusBarViewModel,
    WorkspaceCommandPaletteViewModel,
    WorkspaceDeletionViewModel,
    WorkspaceDragAndDropViewModel,
    WorkspaceHudViewModel,
    WorkspaceShellViewModel,
} from "@/app/viewModels/useAppViewModel";
import type { StatusBarTransportStatus } from "@/app/viewModels/useAppViewModel";
import type { WorkspaceStyle } from "@/app/context/PreferencesContext";
import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/contracts";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/contracts";
import type { SessionStats } from "@/services/rpc/entities";
import type { ConnectionStatus, RpcConnectionOutcome } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { UiMode } from "@/app/utils/uiMode";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import {
    isCommandCanceled,
    isCommandSuccess,
    isCommandUnsupported,
} from "@/app/context/AppCommandContext";
import type { DeleteConfirmationOutcome } from "@/modules/torrent-remove/types/deleteConfirmation";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { EngineTestPortOutcome } from "@/app/providers/engineDomains";
import type { DashboardFilter } from "@/modules/dashboard/types/dashboardFilter";
import type { CapabilityStore } from "@/app/types/capabilities";

export interface DashboardViewModelParams {
    workspaceStyle: WorkspaceStyle;
    filter: DashboardFilter;
    searchQuery: string;
    isDragActive: boolean;
    tableWatermarkEnabled: boolean;
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isInitialLoadFinished: boolean;
    optimisticStatuses: OptimisticStatusMap;
    removedIds: Set<string>;
    selectedIds: string[];
    detailData: TorrentDetail | null;
    peerSortStrategy: PeerSortStrategy;
    inspectorTabCommand: DetailTab | null;
    canSetLocation: boolean;
    generalSetLocation: DashboardViewModel["detail"]["tabs"]["general"]["setLocation"];
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
    handleTorrentAction: DashboardViewModel["detail"]["tabs"]["general"]["handleTorrentAction"];
    handleFileSelectionChange: (
        indexes: number[],
        wanted: boolean,
    ) => Promise<void>;
    addTrackers: DashboardViewModel["detail"]["tabs"]["trackers"]["addTrackers"];
    replaceTrackers: DashboardViewModel["detail"]["tabs"]["trackers"]["replaceTrackers"];
    removeTrackers: DashboardViewModel["detail"]["tabs"]["trackers"]["removeTrackers"];
    setInspectorTabCommand: (value: DetailTab | null) => void;
    capabilities: CapabilityStore;
}

export function useDashboardViewModel({
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
    selectedIds,
    detailData,
    peerSortStrategy,
    inspectorTabCommand,
    canSetLocation,
    generalSetLocation,
    handleRequestDetails,
    closeDetail,
    handleTorrentAction,
    handleFileSelectionChange,
    addTrackers,
    replaceTrackers,
    removeTrackers,
    setInspectorTabCommand,
    capabilities,
}: DashboardViewModelParams): DashboardViewModel {
    return useMemo(
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
                closeDetail,
                tabs: {
                    navigation: {
                        inspectorTabCommand,
                        onInspectorTabCommandHandled: () =>
                            setInspectorTabCommand(null),
                    },
                    general: {
                        canSetLocation,
                        handleTorrentAction,
                        setLocation: generalSetLocation,
                    },
                    content: {
                        handleFileSelectionChange,
                    },
                    trackers: (() => {
                        const inspectedId = detailData?.id ?? detailData?.hash;
                        if (inspectedId == null) {
                            return {
                                scope: "inspected" as const,
                                targetIds: [] as Array<string | number>,
                                addTrackers,
                                replaceTrackers,
                                removeTrackers,
                            };
                        }
                        const inspectedKey = String(inspectedId);
                        if (
                            selectedIds.length > 1 &&
                            selectedIds.includes(inspectedKey)
                        ) {
                            return {
                                scope: "selection" as const,
                                targetIds: selectedIds,
                                addTrackers,
                                replaceTrackers,
                                removeTrackers,
                            };
                        }
                        return {
                            scope: "inspected" as const,
                            targetIds: [inspectedId],
                            addTrackers,
                            replaceTrackers,
                            removeTrackers,
                        };
                    })(),
                    peers: {
                        peerSortStrategy,
                        handlePeerContextAction: undefined,
                    },
                },
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
            isDragActive,
            removedIds,
            selectedIds,
            detailData,
            handleRequestDetails,
            closeDetail,
            inspectorTabCommand,
            setInspectorTabCommand,
            canSetLocation,
            generalSetLocation,
            handleTorrentAction,
            handleFileSelectionChange,
            addTrackers,
            replaceTrackers,
            removeTrackers,
            peerSortStrategy,
        ],
    );
}

export interface StatusBarViewModelDeps {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    transportStatus: StatusBarTransportStatus;
    rpcStatus: ConnectionStatus;
    uiCapabilities: { uiMode: UiMode };
    reconnect: () => Promise<RpcConnectionOutcome>;
    selectedCount: number;
    activeDownloadCount: number;
    activeDownloadRequiredBytes: number;
}

export function useStatusBarViewModel({
    workspaceStyle,
    sessionStats,
    liveTransportStatus,
    transportStatus,
    rpcStatus,
    uiCapabilities,
    reconnect,
    selectedCount,
    activeDownloadCount,
    activeDownloadRequiredBytes,
}: StatusBarViewModelDeps): StatusBarViewModel {
    return useMemo(
        () => ({
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            telemetry: sessionStats?.networkTelemetry ?? null,
            rpcStatus,
            uiMode: uiCapabilities.uiMode,
            handleReconnect: reconnect,
            selectedCount,
            activeDownloadCount,
            activeDownloadRequiredBytes,
        }),
        [
            workspaceStyle,
            sessionStats,
            liveTransportStatus,
            transportStatus,
            rpcStatus,
            uiCapabilities.uiMode,
            reconnect,
            selectedCount,
            activeDownloadCount,
            activeDownloadRequiredBytes,
        ],
    );
}

export interface NavbarViewModelParams {
    filter: DashboardFilter;
    searchQuery: string;
    setFilter: (value: DashboardFilter) => void;
    setSearchQuery: (value: string) => void;
    hasSelection: boolean;
    emphasizeActions: NavbarViewModel["emphasizeActions"];
    selectionActions: NavbarViewModel["selectionActions"];
    rehashStatus?: NavbarViewModel["rehashStatus"];
    openAddTorrentPicker: () => void;
    openAddMagnet: () => void;
    openSettings: () => void;
    workspaceStyle: WorkspaceStyle;
    handleWindowCommand: (command: "minimize" | "maximize" | "close") => void;
}

export function useNavbarViewModel({
    filter,
    searchQuery,
    setFilter,
    setSearchQuery,
    hasSelection,
    emphasizeActions,
    selectionActions,
    rehashStatus,
    openAddTorrentPicker,
    openAddMagnet,
    openSettings,
    workspaceStyle,
    handleWindowCommand,
}: NavbarViewModelParams): NavbarViewModel {
    return useMemo(
        () => ({
            filter,
            searchQuery,
            setFilter,
            setSearchQuery,
            onAddTorrent: openAddTorrentPicker,
            onAddMagnet: openAddMagnet,
            onSettings: openSettings,
            hasSelection,
            emphasizeActions,
            selectionActions,
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
            hasSelection,
            emphasizeActions,
            selectionActions,
            rehashStatus,
            workspaceStyle,
            handleWindowCommand,
        ],
    );
}

export interface SettingsModalViewModelParams {
    config: SettingsConfig;
    isSaving: boolean;
    loadError: boolean;
    capabilities: {
        blocklistSupported: boolean;
    };
    handleSave: (config: SettingsConfig) => Promise<void>;
    handleTestPort: () => Promise<EngineTestPortOutcome>;
    applyUserPreferencesPatch: (patch: Partial<{
        refresh_interval_ms: number;
        request_timeout_ms: number;
        table_watermark_enabled: boolean;
    }>) => void;
    isSettingsOpen: boolean;
    closeSettings: () => void;
    toggleWorkspaceStyle: () => void;
    reconnect: () => Promise<RpcConnectionOutcome>;
    workspaceStyle: WorkspaceStyle;
    hasDismissedInsights: boolean;
    openSettings: () => void;
    restoreHudCards: () => void;
}

export function useSettingsModalViewModel({
    config,
    isSaving,
    loadError,
    capabilities,
    handleSave,
    handleTestPort,
    applyUserPreferencesPatch,
    isSettingsOpen,
    closeSettings,
    toggleWorkspaceStyle,
    reconnect,
    workspaceStyle,
    hasDismissedInsights,
    openSettings,
    restoreHudCards,
}: SettingsModalViewModelParams): SettingsModalViewModel {
    return useMemo(
        () => ({
            isOpen: isSettingsOpen,
            onClose: closeSettings,
            initialConfig: config,
            isSaving,
            onSave: handleSave,
            settingsLoadError: loadError,
            onTestPort: handleTestPort,
            capabilities,
            onRestoreInsights: restoreHudCards,
            onToggleWorkspaceStyle: toggleWorkspaceStyle,
            onReconnect: reconnect,
            isImmersive: workspaceStyle === "immersive",
            hasDismissedInsights,
            onApplyUserPreferencesPatch: applyUserPreferencesPatch,
            onOpen: openSettings,
        }),
        [
            config,
            isSaving,
            loadError,
            capabilities,
            handleSave,
            handleTestPort,
            applyUserPreferencesPatch,
            isSettingsOpen,
            closeSettings,
            toggleWorkspaceStyle,
            reconnect,
            workspaceStyle,
            hasDismissedInsights,
            openSettings,
            restoreHudCards,
        ],
    );
}

export interface HudViewModelDeps {
    visibleHudCards: AmbientHudCard[];
    dismissHudCard: (id: string) => void;
    hasDismissedInsights: boolean;
}

export function useHudViewModel({
    visibleHudCards,
    dismissHudCard,
    hasDismissedInsights,
}: HudViewModelDeps) {
    return useMemo(
        () => ({
            visibleHudCards,
            dismissHudCard,
            hasDismissedInsights,
        }),
        [visibleHudCards, dismissHudCard, hasDismissedInsights],
    );
}

export interface DeletionViewModelDeps {
    pendingDelete: DeleteIntent | null;
    clearPendingDelete: () => void;
    confirmDelete: (
        overrideDeleteData?: boolean,
    ) => Promise<TorrentCommandOutcome>;
}

export function useDeletionViewModel({
    pendingDelete,
    clearPendingDelete,
    confirmDelete: confirmDeleteCommand,
}: DeletionViewModelDeps) {
    const confirmDelete = useCallback(
        async (
            overrideDeleteData?: boolean,
        ): Promise<DeleteConfirmationOutcome> => {
            const outcome = await confirmDeleteCommand(overrideDeleteData);
            if (isCommandSuccess(outcome)) {
                return { status: "success" };
            }
            if (isCommandCanceled(outcome)) {
                return { status: "canceled" };
            }
            if (isCommandUnsupported(outcome)) {
                return { status: "unsupported" };
            }
            return { status: "failed" };
        },
        [confirmDeleteCommand],
    );

    return useMemo(
        () => ({
            pendingDelete,
            clearPendingDelete,
            confirmDelete,
        }),
        [pendingDelete, clearPendingDelete, confirmDelete],
    );
}

export interface WorkspaceShellModelDeps {
    dragDrop: WorkspaceDragAndDropViewModel;
    workspaceStyle: WorkspaceStyle;
    isNativeHost: boolean;
    toggleWorkspaceStyle: () => void;
    settingsModal: SettingsModalViewModel;
    dashboard: DashboardViewModel;
    hud: WorkspaceHudViewModel;
    deletion: WorkspaceDeletionViewModel;
    navbar: NavbarViewModel;
    commandPalette: WorkspaceCommandPaletteViewModel;
}

export function useWorkspaceShellModel({
    dragDrop,
    workspaceStyle,
    isNativeHost,
    toggleWorkspaceStyle,
    settingsModal,
    dashboard,
    hud,
    deletion,
    navbar,
    commandPalette,
}: WorkspaceShellModelDeps): WorkspaceShellViewModel {
    return useMemo(
        () => ({
            dragAndDrop: dragDrop,
            workspaceStyle: {
                workspaceStyle,
                toggleWorkspaceStyle,
            },
            settingsModal,
            dashboard,
            hud,
            deletion,
            navbar,
            isNativeHost,
            commandPalette,
        }),
        [
            dragDrop,
            workspaceStyle,
            isNativeHost,
            toggleWorkspaceStyle,
            settingsModal,
            dashboard,
            hud,
            deletion,
            navbar,
            commandPalette,
        ],
    );
}


