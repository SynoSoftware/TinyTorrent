import { useMemo } from "react";
import type { HTMLAttributes, InputHTMLAttributes } from "react";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type {
    SessionStats,
    NetworkTelemetry,
    TorrentPeerEntity,
} from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { CommandAction, CommandPaletteContext } from "@/app/components/CommandPalette";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { DashboardFilter } from "@/modules/dashboard/types/dashboardFilter";
import type {
    PeerSortStrategy,
    DetailTab,
} from "@/modules/dashboard/types/torrentDetail";
import type { PeerContextAction } from "@/modules/dashboard/types/peerContextAction";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { UiMode } from "@/app/utils/uiMode";

/**
 * View models describe **what** a view renders and **what** actions it exposes.
 * They do **not** perform orchestration, I/O, or policy decisions-they are derived
 * from orchestrator data and command hooks elsewhere.
 */

export interface TorrentTableViewModel {
    filter: DashboardFilter;
    searchQuery: string;
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isLoading: boolean;
    isDropActive: boolean;
    optimisticStatuses: OptimisticStatusMap;
    tableWatermarkEnabled: boolean;
    capabilities: CapabilityStore;
    removedIds: Set<string>;
}

export interface DashboardDetailViewModel {
    detailData: TorrentDetail | null;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
    isDetailRecoveryBlocked?: boolean;
    tabs: {
        navigation: {
            inspectorTabCommand: DetailTab | null;
            onInspectorTabCommandHandled: () => void;
        };
        content: {
            handleFileSelectionChange: (
                indexes: number[],
                wanted: boolean
            ) => Promise<void>;
            handleEnsureValid?: (torrentId: string | number) => Promise<void>;
            handleEnsureDataPresent?: (
                torrentId: string | number
            ) => Promise<void>;
            handleEnsureAtLocation?: (
                torrentId: string | number,
                path: string
            ) => Promise<void>;
        };
        peers: {
            peerSortStrategy: PeerSortStrategy;
            handlePeerContextAction?: (
                action: PeerContextAction,
                peer: TorrentPeerEntity
            ) => void;
        };
    };
}

export interface DashboardViewModel {
    workspaceStyle: WorkspaceStyle;
    filter: DashboardFilter;
    searchQuery: string;
    detailSplitDirection?: "horizontal" | "vertical";
    table: TorrentTableViewModel;
    detail: DashboardDetailViewModel;
}

export interface SettingsModalViewModel {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: SettingsConfig;
    isSaving: boolean;
    onSave: (config: SettingsConfig) => Promise<void>;
    settingsLoadError?: boolean;
    onTestPort?: () => Promise<boolean>;
    capabilities: {
        blocklistSupported: boolean;
    };
    onRestoreInsights?: () => void;
    onToggleWorkspaceStyle?: () => void;
    onReconnect: () => void;
    isImmersive?: boolean;
    hasDismissedInsights: boolean;
    onApplyUserPreferencesPatch?: (
        patch: Partial<
            Pick<
                SettingsConfig,
                "refresh_interval_ms" | "request_timeout_ms" | "table_watermark_enabled"
            >
        >
    ) => void;
    onOpen?: () => void;
}

export interface WorkspaceShellViewModel {
    dragAndDrop: {
        getRootProps: () => HTMLAttributes<HTMLElement>;
        getInputProps: () => InputHTMLAttributes<HTMLInputElement>;
        isDragActive: boolean;
    };
    workspaceStyle: {
        workspaceStyle: WorkspaceStyle;
        toggleWorkspaceStyle: () => void;
    };
    settingsModal: SettingsModalViewModel;
    dashboard: DashboardViewModel;
    hud: {
        visibleHudCards: AmbientHudCard[];
        dismissHudCard: (cardId: string) => void;
        hasDismissedInsights: boolean;
    };
    deletion: {
        pendingDelete: DeleteIntent | null;
        clearPendingDelete: () => void;
        confirmDelete: (overrideDeleteData?: boolean) => Promise<void>;
    };
    navbar: NavbarViewModel;
    isNativeHost: boolean;
    commandPalette: {
        actions: CommandAction[];
        getContextActions: (context: CommandPaletteContext) => CommandAction[];
    };
}

export interface NavbarViewModel {
    filter: DashboardFilter;
    searchQuery: string;
    setFilter: (value: DashboardFilter) => void;
    setSearchQuery: (value: string) => void;
    onAddTorrent: () => void;
    onAddMagnet: () => void;
    onSettings: () => void;
    hasSelection: boolean;
    emphasizeActions: {
        pause: boolean;
        reannounce: boolean;
        changeLocation: boolean;
        openFolder: boolean;
        forceRecheck: boolean;
    };
    selectionActions: {
        ensureActive: () => void;
        ensurePaused: () => void;
        ensureValid: () => void;
        ensureRemoved: () => void;
    };
    rehashStatus?: {
        active: boolean;
        value: number;
        label: string;
    };
    workspaceStyle: WorkspaceStyle;
    onWindowCommand: (command: "minimize" | "maximize" | "close") => void;
}

export type StatusBarTransportStatus = "polling" | "offline";

export interface StatusBarViewModel {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    transportStatus: StatusBarTransportStatus;
    telemetry: NetworkTelemetry | null;
    rpcStatus: ConnectionStatus;
    uiMode: UiMode;
    handleReconnect: () => void;
    selectedCount: number;
    activeDownloadCount: number;
    activeDownloadRequiredBytes: number;
}

export interface AppViewModel {
    workspace: WorkspaceShellViewModel;
    statusBar: StatusBarViewModel;
    dashboard: DashboardViewModel;
}

export interface UseAppViewModelParams {
    workspaceShell: WorkspaceShellViewModel;
    statusBar: StatusBarViewModel;
    dashboard: DashboardViewModel;
}

export function useAppViewModel(params: UseAppViewModelParams): AppViewModel {
    const { workspaceShell, statusBar, dashboard } = params;

    return useMemo(
        () => ({
            workspace: workspaceShell,
            statusBar,
            dashboard,
        }),
        [workspaceShell, statusBar, dashboard]
    );
}
