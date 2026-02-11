import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { ConnectionStatus, RpcConnectionOutcome } from "@/shared/types/rpc";
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
import type { DeleteConfirmationOutcome } from "@/modules/torrent-remove/types/deleteConfirmation";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type {
    AddTorrentCommandOutcome,
    UseAddTorrentControllerResult,
} from "@/app/orchestrators/useAddTorrentController";
import type { DashboardFilter } from "@/modules/dashboard/types/dashboardFilter";
import { scheduler } from "@/app/services/scheduler";
import {
    RECOVERY_MODAL_RESOLVED_COUNTDOWN_TICK_MS,
    RECOVERY_POLL_INTERVAL_MS,
} from "@/config/logic";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import type {
    RecoveryOutcome,
    RecoveryRecommendedAction,
} from "@/services/recovery/recovery-controller";
import type { SetLocationOutcome } from "@/app/context/RecoveryContext";
import type { EngineTestPortOutcome } from "@/app/providers/engineDomains";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";

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

export interface SetLocationEditorControls {
    state: RecoveryControllerResult["locationEditor"]["state"];
    cancel: RecoveryControllerResult["locationEditor"]["cancel"];
    release: RecoveryControllerResult["locationEditor"]["release"];
    confirm: RecoveryControllerResult["locationEditor"]["confirm"];
    change: RecoveryControllerResult["locationEditor"]["change"];
}

export interface RecoveryContextSnapshot {
    uiMode: UiMode;
    canOpenFolder: boolean;
    setLocationState: SetLocationEditorControls["state"];
    cancelSetLocation: SetLocationEditorControls["cancel"];
    releaseSetLocation: SetLocationEditorControls["release"];
    confirmSetLocation: SetLocationEditorControls["confirm"];
    handleLocationChange: SetLocationEditorControls["change"];
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export interface RecoveryContextModelParams {
    uiMode: UiMode;
    canOpenFolder: boolean;
    locationEditor: SetLocationEditorControls;
    recoverySession: RecoveryControllerResult["state"]["session"];
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    getRecoverySessionForKey: RecoveryControllerResult["actions"]["getRecoverySessionForKey"];
}

export function useRecoveryContextModel(
    {
        uiMode,
        canOpenFolder,
        locationEditor,
        recoverySession,
        setLocationCapability,
        getRecoverySessionForKey,
    }: RecoveryContextModelParams,
): RecoveryContextSnapshot {
    return useMemo(
        () => ({
            uiMode,
            canOpenFolder,
            setLocationState: locationEditor.state,
            cancelSetLocation: locationEditor.cancel,
            releaseSetLocation: locationEditor.release,
            confirmSetLocation: locationEditor.confirm,
            handleLocationChange: locationEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        }),
        [
            uiMode,
            canOpenFolder,
            locationEditor.state,
            locationEditor.cancel,
            locationEditor.release,
            locationEditor.confirm,
            locationEditor.change,
            recoverySession,
            setLocationCapability,
            getRecoverySessionForKey,
        ]
    );
}

export interface RecoveryModalPropsDeps {
    t: (key: string, options?: Record<string, unknown>) => string;
    recoverySession: RecoveryControllerResult["state"]["session"];
    isBusy: boolean;
    onClose: RecoveryControllerResult["modal"]["close"];
    onRecreate: RecoveryControllerResult["modal"]["recreateFolder"];
    onAutoRetry: RecoveryControllerResult["modal"]["autoRetry"];
    locationEditor: SetLocationEditorControls;
    setLocationCapability: RecoveryControllerResult["setLocation"]["capability"];
    handleSetLocation: (
        torrent: Torrent | TorrentDetail,
        options?: {
            mode?: "browse" | "manual";
            surface?: "recovery-modal" | "general-tab" | "context-menu";
        }
    ) => Promise<SetLocationOutcome>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
    queuedCount: RecoveryControllerResult["state"]["queuedCount"];
    queuedItems: RecoveryControllerResult["state"]["queuedItems"];
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
    isBusy,
    onClose,
    onRecreate,
    onAutoRetry,
    locationEditor,
    setLocationCapability,
    handleSetLocation,
    handleDownloadMissing,
    queuedCount,
    queuedItems,
}: RecoveryModalPropsDeps): Pick<
    RecoveryModalViewModel,
    keyof RecoveryModalViewModel
> {
    const autoRetryRef = useRef(false);
    const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
    const torrent = recoverySession?.torrent ?? null;
    const classification = recoverySession?.classification ?? null;
    const outcome = recoverySession?.outcome ?? null;
    const autoCloseAtMs = recoverySession?.autoCloseAtMs ?? null;
    const busy = Boolean(isBusy);
    const isOpen = Boolean(recoverySession);
    const currentTorrentKey = getRecoveryFingerprint(torrent);
    const downloadDir =
        torrent?.downloadDir ?? torrent?.savePath ?? torrent?.downloadDir ?? "";
    const locationEditorState = locationEditor.state;
    const locationEditorStateKey = locationEditorState?.torrentKey ?? "";
    const isUnknownConfidence = classification?.confidence === "unknown";
    const isPathLoss = classification?.kind === "pathLoss";
    const isVolumeLoss = classification?.kind === "volumeLoss";
    const isAccessDenied = classification?.kind === "accessDenied";
    const locationEditorVisible = Boolean(
        locationEditorState?.surface === "recovery-modal" &&
            locationEditorStateKey &&
            locationEditorStateKey === currentTorrentKey
    );
    const isAutoClosePending = Boolean(
        autoCloseAtMs &&
            outcome?.kind === "resolved"
    );
    const resolvedCountdownSeconds = isAutoClosePending
        ? Math.max(
              1,
              Math.ceil(((autoCloseAtMs ?? countdownNowMs) - countdownNowMs) / 1000)
          )
        : null;
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;

    const handleClose = useCallback(() => {
        locationEditor.release();
        onClose();
    }, [locationEditor, onClose]);

    useEffect(() => {
        if (!isAutoClosePending || !autoCloseAtMs) return;
        const tick = () => setCountdownNowMs(Date.now());
        tick();
        const task = scheduler.scheduleRecurringTask(
            tick,
            RECOVERY_MODAL_RESOLVED_COUNTDOWN_TICK_MS,
        );
        return () => {
            task.cancel();
        };
    }, [isAutoClosePending, autoCloseAtMs]);

    useEffect(() => {
        if (
            !isOpen ||
            !onAutoRetry ||
            busy ||
            locationEditorVisible ||
            isAutoClosePending
        ) {
            return;
        }
        const task = scheduler.scheduleRecurringTask(async () => {
            if (autoRetryRef.current) return;
            autoRetryRef.current = true;
            void onAutoRetry().finally(() => {
                autoRetryRef.current = false;
            });
        }, RECOVERY_POLL_INTERVAL_MS);
        return () => {
            task.cancel();
            autoRetryRef.current = false;
        };
    }, [
        busy,
        isAutoClosePending,
        isOpen,
        locationEditorVisible,
        onAutoRetry,
    ]);

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
        const locationEditorBusy = locationEditorState?.status !== "idle";
        const locationEditorVerifying = locationEditorState?.status === "verifying";
        const locationEditorStatusMessage = locationEditorVerifying
            ? t("recovery.status.applying_location")
            : isUnknownConfidence
            ? t("recovery.inline_fallback")
            : undefined;
        const outcomeMessage =
            isAutoClosePending && resolvedCountdownSeconds
                ? t("recovery.status.resolved_auto_close", {
                      seconds: resolvedCountdownSeconds,
                  })
                : resolveOutcomeMessage(outcome, t);
        const resolveKindLabel = (kind: string) => {
            if (kind === "volumeLoss") return t("recovery.inbox.kind.volume_loss");
            if (kind === "pathLoss") return t("recovery.inbox.kind.path_loss");
            if (kind === "accessDenied")
                return t("recovery.inbox.kind.access_denied");
            return t("recovery.inbox.kind.data_gap");
        };
        const groupedInboxItems = new Map<
            string,
            {
                key: string;
                kind: string;
                locationLabel: string;
                sampleTorrentName: string;
                count: number;
            }
        >();
        queuedItems.forEach((item) => {
            const location = item.locationLabel || "";
            const groupKey = `${item.kind}|${location}`;
            const existing = groupedInboxItems.get(groupKey);
            if (existing) {
                existing.count += 1;
                return;
            }
            groupedInboxItems.set(groupKey, {
                key: groupKey,
                kind: item.kind,
                locationLabel: location,
                sampleTorrentName: item.torrentName,
                count: 1,
            });
        });
        const inboxItems = Array.from(groupedInboxItems.values())
            .slice(0, 3)
            .map((group) => {
                const kindLabel = resolveKindLabel(group.kind);
                const label =
                    group.count > 1
                        ? t("recovery.inbox.group_label", {
                              count: group.count,
                              kind: kindLabel,
                          })
                        : group.sampleTorrentName;
                const description = group.locationLabel
                    ? t("recovery.inbox.item_with_location", {
                          kind: kindLabel,
                          location: group.locationLabel,
                      })
                    : kindLabel;
                return {
                    id: group.key,
                    label,
                    description,
                };
            });
        const inboxVisible = queuedCount > 0;
        const cancelLabel = inboxVisible
            ? t("recovery.inbox.dismiss_all")
            : t("modals.cancel");
        const buildRecoveryAction = (
            action?: RecoveryRecommendedAction
        ): { label: string; onPress: () => void; isDisabled: boolean } | null => {
            if (!action || !torrent) return null;
            const base = {
                isDisabled: busy || locationEditorVisible || isAutoClosePending,
            };
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
        const recommendedActions = classification?.recommendedActions ?? [];
        const resolvedPrimaryAction = (() => {
            for (const action of recommendedActions) {
                const candidate = buildRecoveryAction(action);
                if (candidate) {
                    return candidate;
                }
            }
            return null;
        })();
        const primaryAction = resolvedPrimaryAction ?? {
            label: t("recovery.action_locate"),
            onPress: () => {},
            isDisabled: true,
        };
        return {
            isOpen,
            busy,
            title,
            bodyText,
            statusText,
            locationLabel,
            locationEditor: {
                visible: locationEditorVisible,
                value: locationEditorState?.inputPath ?? "",
                error: locationEditorState?.error,
                caption: t(getSurfaceCaptionKey("recovery-modal")),
                statusMessage: locationEditorStatusMessage,
                isBusy: locationEditorBusy,
                onChange: locationEditor.change,
                onSubmit: () => {
                    void locationEditor.confirm();
                },
                onCancel: locationEditor.cancel,
                disableCancel: locationEditorBusy,
            },
            showWaitingForDrive: isVolumeLoss && !isAutoClosePending,
            recoveryOutcomeMessage: outcomeMessage,
            inbox: {
                visible: inboxVisible,
                title: t("recovery.inbox.title", { count: queuedCount }),
                subtitle: t("recovery.inbox.subtitle"),
                items: inboxItems,
                moreCount: Math.max(0, queuedCount - inboxItems.length),
            },
            showRecreate:
                isPathLoss &&
                classification?.confidence === "certain" &&
                Boolean(onRecreate),
            onRecreate: onRecreate ? () => void onRecreate() : undefined,
            onClose: handleClose,
            cancelLabel,
            primaryAction,
        };
    }, [
        busy,
        canSetLocation,
        classification,
        downloadDir,
        handleClose,
        handleDownloadMissing,
        handleSetLocation,
        isAutoClosePending,
        locationEditor,
        locationEditorState,
        locationEditorVisible,
        isAccessDenied,
        isOpen,
        isPathLoss,
        isUnknownConfidence,
        isVolumeLoss,
        onAutoRetry,
        onRecreate,
        outcome,
        queuedCount,
        queuedItems,
        resolvedCountdownSeconds,
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
    ]);
}


