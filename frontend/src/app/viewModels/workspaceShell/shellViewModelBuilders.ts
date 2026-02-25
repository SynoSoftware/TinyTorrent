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
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { SessionStats } from "@/services/rpc/entities";
import type { ConnectionStatus, RpcConnectionOutcome } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { UiMode } from "@/app/utils/uiMode";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
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
    detailData: TorrentDetail | null;
    peerSortStrategy: PeerSortStrategy;
    inspectorTabCommand: DetailTab | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
    handleFileSelectionChange: (
        indexes: number[],
        wanted: boolean,
    ) => Promise<void>;
    handleSequentialToggle: (enabled: boolean) => Promise<void>;
    handleSuperSeedingToggle: (enabled: boolean) => Promise<void>;
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
    detailData,
    peerSortStrategy,
    inspectorTabCommand,
    handleRequestDetails,
    closeDetail,
    handleFileSelectionChange,
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
                    content: {
                        handleFileSelectionChange,
                    },
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
            detailData,
            handleRequestDetails,
            closeDetail,
            inspectorTabCommand,
            setInspectorTabCommand,
            handleFileSelectionChange,
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
            if (outcome.status === "success") {
                return { status: "success" };
            }
            if (outcome.status === "canceled") {
                return { status: "canceled" };
            }
            if (outcome.status === "unsupported") {
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
