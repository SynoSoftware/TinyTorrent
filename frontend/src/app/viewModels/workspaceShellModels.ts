import { useMemo } from "react";
import Runtime from "@/app/runtime";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    CommandAction,
    CommandPaletteContext,
} from "@/app/components/CommandPalette";
import type { CommandPaletteDeps } from "@/app/commandRegistry";
import type {
    DashboardViewModel,
    NavbarViewModel,
    SettingsModalViewModel,
    StatusBarViewModel,
    WorkspaceShellViewModel,
} from "@/app/viewModels/useAppViewModel";
import type { StatusBarTransportStatus } from "@/app/viewModels/useAppViewModel";
import type { CapabilityStore } from "@/app/types/capabilities";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type {
    DetailTab,
    PeerSortStrategy,
} from "@/modules/dashboard/types/torrentDetail";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { SessionStats } from "@/services/rpc/entities";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { UiMode } from "@/app/utils/uiMode";
import type {
    AddTorrentModalProps,
    AddTorrentSource,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import type { TorrentRecoveryModalProps } from "@/modules/dashboard/components/TorrentRecoveryModal";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type { UseAddTorrentControllerResult } from "@/app/orchestrators/useAddTorrentController";

export interface DashboardLayoutState {
    workspaceStyle: WorkspaceStyle;
    filter: string;
    searchQuery: string;
    isDragActive: boolean;
    tableWatermarkEnabled: boolean;
}

export interface DashboardTableState {
    torrents: Torrent[];
    ghostTorrents: Torrent[];
    isInitialLoadFinished: boolean;
    optimisticStatuses: OptimisticStatusMap;
    removedIds: Set<string>;
}

export interface DashboardDetailState {
    detailData: TorrentDetail | null;
    peerSortStrategy: PeerSortStrategy;
    inspectorTabCommand: DetailTab | null;
    isDetailRecoveryBlocked: boolean;
}

export interface DashboardDetailControls {
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
    handleFileSelectionChange: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void>;
    handleSequentialToggle: (enabled: boolean) => Promise<void>;
    handleSuperSeedingToggle: (enabled: boolean) => Promise<void>;
    setInspectorTabCommand: (value: DetailTab | null) => void;
}

export interface DashboardCapabilities {
    capabilities: CapabilityStore;
}

export function useDashboardViewModel(
    layout: DashboardLayoutState,
    table: DashboardTableState,
    detail: DashboardDetailState,
    controls: DashboardDetailControls,
    caps: DashboardCapabilities
): DashboardViewModel {
    return useMemo(
        () => ({
            workspaceStyle: layout.workspaceStyle,
            filter: layout.filter,
            searchQuery: layout.searchQuery,
            detailSplitDirection: undefined,
            table: {
                torrents: table.torrents,
                ghostTorrents: table.ghostTorrents,
                isLoading: !table.isInitialLoadFinished,
                capabilities: caps.capabilities,
                optimisticStatuses: table.optimisticStatuses,
                tableWatermarkEnabled: layout.tableWatermarkEnabled,
                filter: layout.filter,
                searchQuery: layout.searchQuery,
                isDropActive: layout.isDragActive,
                removedIds: table.removedIds,
            },
            detail: {
                detailData: detail.detailData,
                handleRequestDetails: controls.handleRequestDetails,
                closeDetail: controls.closeDetail,
                handleFileSelectionChange: controls.handleFileSelectionChange,
                sequentialToggleHandler: controls.handleSequentialToggle,
                superSeedingToggleHandler: controls.handleSuperSeedingToggle,
                peerSortStrategy: detail.peerSortStrategy,
                inspectorTabCommand: detail.inspectorTabCommand,
                onInspectorTabCommandHandled: () =>
                    controls.setInspectorTabCommand(null),
                isDetailRecoveryBlocked: detail.isDetailRecoveryBlocked,
                handlePeerContextAction: undefined,
            },
        }),
        [layout, table, detail, controls, caps]
    );
}

export interface StatusBarViewModelDeps {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    transportStatus: StatusBarTransportStatus;
    rpcStatus: ConnectionStatus;
    uiCapabilities: { uiMode: UiMode };
    reconnect: () => void;
    selectedCount: number;
    torrents: Torrent[];
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
    torrents,
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
            torrents,
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
            torrents,
        ]
    );
}

export interface NavbarQueryState {
    filter: string;
    searchQuery: string;
    setFilter: (value: string) => void;
    setSearchQuery: (value: string) => void;
    hasSelection: boolean;
}

export interface NavbarDerivedState {
    emphasizeActions: NavbarViewModel["emphasizeActions"];
    selectionActions: NavbarViewModel["selectionActions"];
    rehashStatus?: NavbarViewModel["rehashStatus"];
}

export interface NavbarNavigation {
    openAddTorrentPicker: () => void;
    openAddMagnet: () => void;
    openSettings: () => void;
}

export interface NavbarShellControls {
    workspaceStyle: WorkspaceStyle;
    handleWindowCommand: (command: "minimize" | "maximize" | "close") => void;
}

export function useNavbarViewModel(
    query: NavbarQueryState,
    derived: NavbarDerivedState,
    navigation: NavbarNavigation,
    shell: NavbarShellControls
): NavbarViewModel {
    return useMemo(
        () => ({
            filter: query.filter,
            searchQuery: query.searchQuery,
            setFilter: query.setFilter,
            setSearchQuery: query.setSearchQuery,
            onAddTorrent: navigation.openAddTorrentPicker,
            onAddMagnet: navigation.openAddMagnet,
            onSettings: navigation.openSettings,
            hasSelection: query.hasSelection,
            emphasizeActions: derived.emphasizeActions,
            selectionActions: derived.selectionActions,
            rehashStatus: derived.rehashStatus,
            workspaceStyle: shell.workspaceStyle,
            onWindowCommand: shell.handleWindowCommand,
        }),
        [query, derived, navigation, shell]
    );
}

export interface SettingsSnapshot {
    config: SettingsConfig;
    isSaving: boolean;
    loadError: boolean;
}

export interface SettingsActions {
    handleSave: (config: SettingsConfig) => Promise<void>;
    handleTestPort: () => Promise<void>;
    applyUserPreferencesPatch: (patch: Partial<{
        refresh_interval_ms: number;
        request_timeout_ms: number;
        table_watermark_enabled: boolean;
    }>) => void;
}

export interface SettingsModalViewModelDeps {
    isSettingsOpen: boolean;
    closeSettings: () => void;
    snapshot: SettingsSnapshot;
    actions: SettingsActions;
    toggleWorkspaceStyle: () => void;
    reconnect: () => void;
    shellAgentAvailable: boolean;
    workspaceStyle: WorkspaceStyle;
    hasDismissedInsights: boolean;
    openSettings: () => void;
    restoreHudCards: () => void;
}

export function useSettingsModalViewModel({
    isSettingsOpen,
    closeSettings,
    snapshot,
    actions,
    toggleWorkspaceStyle,
    reconnect,
    shellAgentAvailable,
    workspaceStyle,
    hasDismissedInsights,
    openSettings,
    restoreHudCards,
}: SettingsModalViewModelDeps): SettingsModalViewModel {
    return useMemo(
        () => ({
            isOpen: isSettingsOpen,
            onClose: closeSettings,
            initialConfig: snapshot.config,
            isSaving: snapshot.isSaving,
            onSave: actions.handleSave,
            settingsLoadError: snapshot.loadError,
            onTestPort: actions.handleTestPort,
            onRestoreInsights: restoreHudCards,
            onToggleWorkspaceStyle: toggleWorkspaceStyle,
            onReconnect: reconnect,
            isNativeMode: shellAgentAvailable,
            isImmersive: workspaceStyle === "immersive",
            hasDismissedInsights,
            onApplyUserPreferencesPatch: actions.applyUserPreferencesPatch,
            onOpen: openSettings,
        }),
        [
            isSettingsOpen,
            closeSettings,
            snapshot,
            actions,
            toggleWorkspaceStyle,
            reconnect,
            shellAgentAvailable,
            workspaceStyle,
            hasDismissedInsights,
            openSettings,
            restoreHudCards,
        ]
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
        [visibleHudCards, dismissHudCard, hasDismissedInsights]
    );
}

export interface DeletionViewModelDeps {
    pendingDelete: DeleteIntent | null;
    clearPendingDelete: () => void;
    confirmDelete: (overrideDeleteData?: boolean) => Promise<void>;
}

export function useDeletionViewModel({
    pendingDelete,
    clearPendingDelete,
    confirmDelete,
}: DeletionViewModelDeps) {
    return useMemo(
        () => ({
            pendingDelete,
            clearPendingDelete,
            confirmDelete,
        }),
        [pendingDelete, clearPendingDelete, confirmDelete]
    );
}

export function useCommandPaletteDeps(
    deps: CommandPaletteDeps
): CommandPaletteDeps {
    const {
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
    } = deps;

    return useMemo(
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
}

export interface WorkspaceShellModelDeps {
    dragDrop: {
        getRootProps: () => Record<string, unknown>;
        getInputProps: () => Record<string, unknown>;
        isDragActive: boolean;
    };
    workspaceStyle: WorkspaceStyle;
    toggleWorkspaceStyle: () => void;
    settingsModal: SettingsModalViewModel;
    dashboard: DashboardViewModel;
    hud: ReturnType<typeof useHudViewModel>;
    deletion: ReturnType<typeof useDeletionViewModel>;
    navbar: NavbarViewModel;
    statusBar: StatusBarViewModel;
    commandPalette: {
        actions: CommandAction[];
        getContextActions: (
            context: CommandPaletteContext
        ) => CommandAction[];
    };
}

export function useWorkspaceShellModel({
    dragDrop,
    workspaceStyle,
    toggleWorkspaceStyle,
    settingsModal,
    dashboard,
    hud,
    deletion,
    navbar,
    statusBar,
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
            statusBar,
            isNativeHost: Runtime.isNativeHost,
            commandPalette,
        }),
        [
            dragDrop,
            workspaceStyle,
            toggleWorkspaceStyle,
            settingsModal,
            dashboard,
            hud,
            deletion,
            navbar,
            statusBar,
            commandPalette,
        ]
    );
}

export interface RecoveryContextEnv {
    uiMode: UiMode;
    canOpenFolder: boolean;
}

export interface RecoveryInlineEditorControls {
    state: RecoveryControllerResult["inlineEditor"]["state"];
    cancel: RecoveryControllerResult["inlineEditor"]["cancel"];
    release: RecoveryControllerResult["inlineEditor"]["release"];
    confirm: RecoveryControllerResult["inlineEditor"]["confirm"];
    change: RecoveryControllerResult["inlineEditor"]["change"];
}

export interface RecoveryContextSessionState {
    recoverySession: RecoveryControllerResult["state"]["session"];
}

export interface RecoveryContextSnapshot {
    uiMode: UiMode;
    canOpenFolder: boolean;
    inlineSetLocationState: RecoveryInlineEditorControls["state"];
    cancelInlineSetLocation: RecoveryInlineEditorControls["cancel"];
    releaseInlineSetLocation: RecoveryInlineEditorControls["release"];
    confirmInlineSetLocation: RecoveryInlineEditorControls["confirm"];
    handleInlineLocationChange: RecoveryInlineEditorControls["change"];
    recoverySession: RecoveryContextSessionState["recoverySession"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export function useRecoveryContextModel(
    env: RecoveryContextEnv,
    inlineEditor: RecoveryInlineEditorControls,
    session: RecoveryContextSessionState,
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"],
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"]
): RecoveryContextSnapshot {
    return useMemo(
        () => ({
            uiMode: env.uiMode,
            canOpenFolder: env.canOpenFolder,
            inlineSetLocationState: inlineEditor.state,
            cancelInlineSetLocation: inlineEditor.cancel,
            releaseInlineSetLocation: inlineEditor.release,
            confirmInlineSetLocation: inlineEditor.confirm,
            handleInlineLocationChange: inlineEditor.change,
            recoverySession: session.recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        }),
        [
            env.uiMode,
            env.canOpenFolder,
            inlineEditor.state,
            inlineEditor.cancel,
            inlineEditor.release,
            inlineEditor.confirm,
            inlineEditor.change,
            session.recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        ]
    );
}

export interface RecoveryModalPropsDeps {
    recoverySession: RecoveryControllerResult["state"]["session"];
    lastOutcome: RecoveryControllerResult["state"]["lastOutcome"];
    isBusy: boolean;
    onClose: RecoveryControllerResult["modal"]["close"];
    onRecreate: RecoveryControllerResult["modal"]["recreateFolder"];
    onAutoRetry: RecoveryControllerResult["modal"]["autoRetry"];
}

export function useRecoveryModalProps({
    recoverySession,
    lastOutcome,
    isBusy,
    onClose,
    onRecreate,
    onAutoRetry,
}: RecoveryModalPropsDeps): Pick<
    TorrentRecoveryModalProps,
    "isOpen" | "torrent" | "outcome" | "onClose" | "onRecreate" | "onAutoRetry" | "isBusy"
> {
    return useMemo(
        () => ({
            isOpen: Boolean(recoverySession),
            torrent: recoverySession?.torrent ?? null,
            outcome: lastOutcome ?? recoverySession?.outcome ?? null,
            onClose,
            onRecreate,
            onAutoRetry,
            isBusy,
        }),
        [recoverySession, lastOutcome, onClose, onRecreate, onAutoRetry, isBusy]
    );
}

export interface AddMagnetModalPropsDeps {
    isOpen: boolean;
    initialValue: string;
    onClose: () => void;
    onSubmit: (value: string) => Promise<void>;
}

export function useAddMagnetModalProps({
    isOpen,
    initialValue,
    onClose,
    onSubmit,
}: AddMagnetModalPropsDeps): AddMagnetModalProps {
    return useMemo(
        () => ({
            isOpen,
            initialValue,
            onClose,
            onSubmit,
        }),
        [isOpen, initialValue, onClose, onSubmit]
    );
}

export interface AddTorrentModalPropsDeps {
    addSource: AddTorrentSource | null;
    addTorrentDefaults: UseAddTorrentControllerResult["addTorrentDefaults"];
    settingsConfig: SettingsSnapshot["config"];
    isAddingTorrent: boolean;
    isFinalizingExisting: boolean;
    isResolvingMagnet: boolean;
    onCancel: () => void;
    onConfirm: UseAddTorrentControllerResult["handleTorrentWindowConfirm"];
    torrentClient: EngineAdapter;
    browseDirectory?: (currentPath: string) => Promise<string | null>;
}

export function useAddTorrentModalProps({
    addSource,
    addTorrentDefaults,
    settingsConfig,
    isAddingTorrent,
    isFinalizingExisting,
    isResolvingMagnet,
    onCancel,
    onConfirm,
    torrentClient,
    browseDirectory,
}: AddTorrentModalPropsDeps): AddTorrentModalProps | null {
    return useMemo(() => {
        if (!addSource) return null;
        return {
            isOpen: true,
            source: addSource,
            downloadDir:
                addTorrentDefaults.downloadDir ||
                settingsConfig.download_dir,
            commitMode: addTorrentDefaults.commitMode,
            onDownloadDirChange: addTorrentDefaults.setDownloadDir,
            onCommitModeChange: addTorrentDefaults.setCommitMode,
            isSubmitting: isAddingTorrent || isFinalizingExisting,
            isResolvingSource: isResolvingMagnet,
            onCancel,
            onConfirm,
            checkFreeSpace: torrentClient.checkFreeSpace,
            onBrowseDirectory: browseDirectory,
        };
    }, [
        addSource,
        addTorrentDefaults,
        settingsConfig.download_dir,
        isAddingTorrent,
        isFinalizingExisting,
        isResolvingMagnet,
        onCancel,
        onConfirm,
        torrentClient,
        browseDirectory,
    ]);
}
