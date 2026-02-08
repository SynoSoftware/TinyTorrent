import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
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
import type { CapabilityStore } from "@/app/types/capabilities";
import type { WorkspaceStyle } from "@/app/context/PreferencesContext";
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
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddTorrentSource } from "@/modules/torrent-add/types";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import type { RecoveryModalViewModel } from "@/modules/dashboard/components/TorrentRecoveryModal";
import type { RecoveryControllerResult } from "@/modules/dashboard/hooks/useRecoveryController";
import type { AmbientHudCard, DeleteIntent } from "@/app/types/workspace";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type {
    AddTorrentCommandOutcome,
    UseAddTorrentControllerResult,
} from "@/app/orchestrators/useAddTorrentController";
import type { DashboardFilter } from "@/modules/dashboard/types/dashboardFilter";
import { scheduler } from "@/app/services/scheduler";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import type {
    RecoveryOutcome,
    RecoveryRecommendedAction,
} from "@/services/recovery/recovery-controller";

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
    isDetailRecoveryBlocked: boolean;
    handleRequestDetails: (torrent: Torrent) => Promise<void>;
    closeDetail: () => void;
    handleFileSelectionChange: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void>;
    handleSequentialToggle: (enabled: boolean) => Promise<void>;
    handleSuperSeedingToggle: (enabled: boolean) => Promise<void>;
    handleEnsureValid: (torrentId: string | number) => Promise<void>;
    handleEnsureDataPresent: (torrentId: string | number) => Promise<void>;
    handleEnsureAtLocation: (
        torrentId: string | number,
        path: string
    ) => Promise<void>;
    setInspectorTabCommand: (value: DetailTab | null) => void;
    capabilities: CapabilityStore;
}
export function useDashboardViewModel(
    {
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
        closeDetail,
        handleFileSelectionChange,
        handleEnsureValid,
        handleEnsureDataPresent,
        handleEnsureAtLocation,
        setInspectorTabCommand,
        capabilities,
    }: DashboardViewModelParams,
): DashboardViewModel {
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
                isDetailRecoveryBlocked,
                tabs: {
                    navigation: {
                        inspectorTabCommand,
                        onInspectorTabCommandHandled: () =>
                            setInspectorTabCommand(null),
                    },
                    content: {
                        handleFileSelectionChange,
                        handleEnsureValid,
                        handleEnsureDataPresent,
                        handleEnsureAtLocation,
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
            isDetailRecoveryBlocked,
            inspectorTabCommand,
            setInspectorTabCommand,
            handleFileSelectionChange,
            handleEnsureValid,
            handleEnsureDataPresent,
            handleEnsureAtLocation,
            peerSortStrategy,
        ]
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
        ]
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
export function useNavbarViewModel(
    {
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
    }: NavbarViewModelParams,
): NavbarViewModel {
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
        ]
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
    // TODO(section 20.2/20.5): replace boolean test-port result with typed outcome variants.
    handleTestPort: () => Promise<boolean>;
    applyUserPreferencesPatch: (patch: Partial<{
        refresh_interval_ms: number;
        request_timeout_ms: number;
        table_watermark_enabled: boolean;
    }>) => void;
    isSettingsOpen: boolean;
    closeSettings: () => void;
    toggleWorkspaceStyle: () => void;
    reconnect: () => void;
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
    confirmDelete: (
        overrideDeleteData?: boolean,
    ) => Promise<TorrentCommandOutcome>;
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
        ]
    );
}

export interface RecoveryInlineEditorControls {
    state: RecoveryControllerResult["inlineEditor"]["state"];
    cancel: RecoveryControllerResult["inlineEditor"]["cancel"];
    release: RecoveryControllerResult["inlineEditor"]["release"];
    confirm: RecoveryControllerResult["inlineEditor"]["confirm"];
    change: RecoveryControllerResult["inlineEditor"]["change"];
}

export interface RecoveryContextSnapshot {
    uiMode: UiMode;
    canOpenFolder: boolean;
    inlineSetLocationState: RecoveryInlineEditorControls["state"];
    cancelInlineSetLocation: RecoveryInlineEditorControls["cancel"];
    releaseInlineSetLocation: RecoveryInlineEditorControls["release"];
    confirmInlineSetLocation: RecoveryInlineEditorControls["confirm"];
    handleInlineLocationChange: RecoveryInlineEditorControls["change"];
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export interface RecoveryContextModelParams {
    uiMode: UiMode;
    canOpenFolder: boolean;
    inlineEditor: RecoveryInlineEditorControls;
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export function useRecoveryContextModel(
    {
        uiMode,
        canOpenFolder,
        inlineEditor,
        recoverySession,
        setLocationCapability,
        getRecoverySessionForKey,
    }: RecoveryContextModelParams,
): RecoveryContextSnapshot {
    return useMemo(
        () => ({
            uiMode,
            canOpenFolder,
            inlineSetLocationState: inlineEditor.state,
            cancelInlineSetLocation: inlineEditor.cancel,
            releaseInlineSetLocation: inlineEditor.release,
            confirmInlineSetLocation: inlineEditor.confirm,
            handleInlineLocationChange: inlineEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        }),
        [
            uiMode,
            canOpenFolder,
            inlineEditor.state,
            inlineEditor.cancel,
            inlineEditor.release,
            inlineEditor.confirm,
            inlineEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        ]
    );
}

export interface RecoveryModalPropsDeps {
    t: (key: string, options?: Record<string, unknown>) => string;
    recoverySession: RecoveryControllerResult["state"]["session"];
    lastOutcome: RecoveryControllerResult["state"]["lastOutcome"];
    isBusy: boolean;
    onClose: RecoveryControllerResult["modal"]["close"];
    onRecreate: RecoveryControllerResult["modal"]["recreateFolder"];
    onAutoRetry: RecoveryControllerResult["modal"]["autoRetry"];
    inlineEditor: RecoveryInlineEditorControls;
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    handleSetLocation: (
        torrent: Torrent | TorrentDetail,
        options?: { mode?: "browse" | "manual"; surface?: "recovery-modal" | "general-tab" | "context-menu" }
    ) => Promise<void>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
}

const RECOVERY_MESSAGE_LABEL_KEY: Record<string, string> = {
    insufficient_free_space: "recovery.message.insufficient_free_space",
    path_ready: "recovery.message.path_ready",
    path_check_unknown: "recovery.message.path_check_unknown",
    directory_created: "recovery.message.directory_created",
    directory_creation_denied: "recovery.message.directory_creation_denied",
    directory_creation_failed: "recovery.message.directory_creation_failed",
    directory_creation_not_supported:
        "recovery.message.directory_creation_not_supported",
    path_access_denied: "recovery.message.path_access_denied",
    disk_full: "recovery.message.disk_full",
    path_check_failed: "recovery.message.path_check_failed",
    permission_denied: "recovery.message.permission_denied",
    no_download_path_known: "recovery.message.no_download_path_known",
    free_space_check_not_supported:
        "recovery.message.free_space_check_not_supported",
    free_space_check_failed: "recovery.message.free_space_check_failed",
    verify_not_supported: "recovery.message.verify_not_supported",
    verify_started: "recovery.message.verify_started",
    verify_failed: "recovery.message.verify_failed",
    reannounce_not_supported: "recovery.message.reannounce_not_supported",
    reannounce_started: "recovery.message.reannounce_started",
    reannounce_failed: "recovery.message.reannounce_failed",
    location_updated: "recovery.message.location_updated",
    filesystem_probing_not_supported:
        "recovery.message.filesystem_probing_not_supported",
};

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

const resolveOutcomeMessage = (
    outcome: RecoveryOutcome | null,
    t: (key: string, options?: Record<string, unknown>) => string
): string | null => {
    if (!outcome?.message) return null;
    const key = RECOVERY_MESSAGE_LABEL_KEY[outcome.message];
    return key ? t(key) : outcome.message;
};

export function useRecoveryModalViewModel({
    t,
    recoverySession,
    lastOutcome,
    isBusy,
    onClose,
    onRecreate,
    onAutoRetry,
    inlineEditor,
    setLocationCapability,
    handleSetLocation,
    handleDownloadMissing,
}: RecoveryModalPropsDeps): Pick<
    RecoveryModalViewModel,
    keyof RecoveryModalViewModel
> {
    const autoRetryRef = useRef(false);
    const torrent = recoverySession?.torrent ?? null;
    const classification = recoverySession?.classification ?? null;
    const outcome = lastOutcome ?? recoverySession?.outcome ?? null;
    const busy = Boolean(isBusy);
    const isOpen = Boolean(recoverySession);
    const currentTorrentKey = getTorrentKey(torrent);
    const downloadDir =
        torrent?.downloadDir ?? torrent?.savePath ?? torrent?.downloadDir ?? "";
    const inlineState = inlineEditor.state;
    const inlineStateKey = inlineState?.torrentKey ?? "";
    const isUnknownConfidence = classification?.confidence === "unknown";
    const isPathLoss = classification?.kind === "pathLoss";
    const isVolumeLoss = classification?.kind === "volumeLoss";
    const isAccessDenied = classification?.kind === "accessDenied";
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;

    const handleClose = useCallback(() => {
        inlineEditor.release();
        onClose();
    }, [inlineEditor, onClose]);

    useEffect(() => {
        if (!isOpen || !isVolumeLoss || !onAutoRetry || busy) return;
        const task = scheduler.scheduleRecurringTask(async () => {
            if (autoRetryRef.current) return;
            autoRetryRef.current = true;
            void onAutoRetry().finally(() => {
                autoRetryRef.current = false;
            });
        }, 2000);
        return () => {
            task.cancel();
            autoRetryRef.current = false;
        };
    }, [isOpen, isVolumeLoss, onAutoRetry, busy]);

    return useMemo(() => {
        const title = (() => {
            if (isUnknownConfidence) return t("recovery.modal_title_fallback");
            if (isPathLoss) return t("recovery.modal_title_folder");
            if (isVolumeLoss) return t("recovery.modal_title_drive");
            if (isAccessDenied) return t("recovery.modal_title_access");
            return t("recovery.modal_title_fallback");
        })();
        const bodyText = (() => {
            if (isUnknownConfidence) return t("recovery.modal_body_fallback");
            if (isPathLoss) return t("recovery.modal_body_folder");
            if (isVolumeLoss) return t("recovery.modal_body_drive");
            if (isAccessDenied) return t("recovery.modal_body_access");
            return t("recovery.modal_body_fallback");
        })();
        const statusText = (() => {
            if (isUnknownConfidence) return t("recovery.inline_fallback");
            if (isPathLoss) {
                return t("recovery.status.folder_not_found", {
                    path: (classification?.path ?? downloadDir) || t("labels.unknown"),
                });
            }
            if (isVolumeLoss) {
                return t("recovery.status.drive_disconnected", {
                    drive: classification?.root ?? t("labels.unknown"),
                });
            }
            if (isAccessDenied) return t("recovery.status.access_denied");
            return t("recovery.generic_header");
        })();
        const locationLabel =
            ((isVolumeLoss ? classification?.root : classification?.path) ??
                downloadDir) ||
            t("labels.unknown");
        const inlineVisible = Boolean(
            inlineState?.surface === "recovery-modal" &&
                inlineStateKey &&
                inlineStateKey === currentTorrentKey
        );
        const inlineBusy = inlineState?.status !== "idle";
        const inlineVerifying = inlineState?.status === "verifying";
        const inlineStatusMessage = inlineVerifying
            ? t("recovery.status.applying_location")
            : isUnknownConfidence
            ? t("recovery.inline_fallback")
            : undefined;
        const buildRecoveryAction = (
            action?: RecoveryRecommendedAction
        ): { label: string; onPress: () => void; isDisabled: boolean } | null => {
            if (!action || !torrent) return null;
            const base = { isDisabled: busy || inlineVisible };
            if (action === "downloadMissing") {
                return {
                    ...base,
                    label: t("recovery.action_download"),
                    onPress: () => {
                        void handleDownloadMissing(torrent);
                    },
                };
            }
            if (action === "locate") {
                if (!canSetLocation) return null;
                return {
                    ...base,
                    label: t("recovery.action_locate"),
                    onPress: () => {
                        void handleSetLocation(torrent, {
                            surface: "recovery-modal",
                            mode: "browse",
                        });
                    },
                };
            }
            if (action === "chooseLocation") {
                if (!canSetLocation) return null;
                return {
                    ...base,
                    label: t("recovery.action.choose_location"),
                    onPress: () => {
                        void handleSetLocation(torrent, {
                            surface: "recovery-modal",
                            mode: "manual",
                        });
                    },
                };
            }
            if (action === "retry") {
                if (!onAutoRetry) return null;
                return {
                    ...base,
                    label: t("recovery.action_retry"),
                    onPress: () => {
                        void onAutoRetry();
                    },
                };
            }
            return null;
        };
        const primaryAction =
            buildRecoveryAction(classification?.recommendedActions?.[0]) ?? {
                label: t("recovery.action_locate"),
                onPress: () => {},
                isDisabled: true,
            };
        return {
            isOpen: Boolean(classification) && classification?.kind !== "dataGap" && isOpen,
            busy,
            title,
            bodyText,
            statusText,
            locationLabel,
            inlineEditor: {
                visible: inlineVisible,
                value: inlineState?.inputPath ?? "",
                error: inlineState?.error,
                caption: t(getSurfaceCaptionKey("recovery-modal")),
                statusMessage: inlineStatusMessage,
                isBusy: inlineBusy,
                onChange: inlineEditor.change,
                onSubmit: () => {
                    void inlineEditor.confirm();
                },
                onCancel: inlineEditor.cancel,
                disableCancel: inlineBusy,
            },
            showWaitingForDrive: isVolumeLoss,
            recoveryOutcomeMessage: resolveOutcomeMessage(outcome, t),
            showRecreate: isPathLoss && Boolean(onRecreate),
            onRecreate: onRecreate ? () => void onRecreate() : undefined,
            onClose: handleClose,
            primaryAction,
        };
    }, [
        busy,
        canSetLocation,
        classification,
        currentTorrentKey,
        downloadDir,
        handleClose,
        handleDownloadMissing,
        handleSetLocation,
        inlineEditor,
        inlineState,
        inlineStateKey,
        isAccessDenied,
        isOpen,
        isPathLoss,
        isUnknownConfidence,
        isVolumeLoss,
        onAutoRetry,
        onRecreate,
        outcome,
        t,
        torrent,
    ]);
}

export interface AddMagnetModalPropsDeps {
    isOpen: boolean;
    initialValue: string;
    onClose: () => void;
    onSubmit: (value: string) => Promise<AddTorrentCommandOutcome>;
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
    settingsConfig: SettingsConfig;
    isAddingTorrent: boolean;
    isFinalizingExisting: boolean;
    onCancel: () => void;
    onConfirm: UseAddTorrentControllerResult["handleTorrentWindowConfirm"];
    torrentClient: EngineAdapter;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    browseDirectory?: (currentPath: string) => Promise<string | null>;
}

export function useAddTorrentModalProps({
    addSource,
    addTorrentDefaults,
    settingsConfig,
    isAddingTorrent,
    isFinalizingExisting,
    onCancel,
    onConfirm,
    torrentClient,
    checkFreeSpace: checkFreeSpaceOverride,
    browseDirectory,
}: AddTorrentModalPropsDeps): AddTorrentModalProps | null {
    const checkFreeSpace = useMemo(
        () =>
            checkFreeSpaceOverride ??
            torrentClient.checkFreeSpace?.bind(torrentClient),
        [checkFreeSpaceOverride, torrentClient]
    );

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
            onCancel,
            onConfirm,
            checkFreeSpace,
            onBrowseDirectory: browseDirectory,
        };
    }, [
        addSource,
        addTorrentDefaults,
        settingsConfig.download_dir,
        isAddingTorrent,
        isFinalizingExisting,
        onCancel,
        onConfirm,
        checkFreeSpace,
        browseDirectory,
    ]);
}

