import { useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { clearVerifyGuardEntry } from "@/services/recovery/recovery-controller";
import { clearProbe as clearCachedProbe } from "@/services/recovery/missingFilesStore";
import type {
    LocationEditorState,
    OpenRecoveryModalOutcome,
    OpenRecoveryModalOptions,
    RecoverySessionInfo,
    SetLocationConfirmOutcome,
    SetLocationCapability,
    SetLocationOptions,
    SetLocationOutcome,
} from "@/app/context/RecoveryContext";
import { useSession, useUiModeCapabilities } from "@/app/context/SessionContext";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import { useRecoveryModal } from "@/modules/dashboard/hooks/useRecoveryModal";
import { useLocationEditor } from "@/modules/dashboard/hooks/useLocationEditor";
import { useRecoveryActions } from "@/modules/dashboard/hooks/useRecoveryActions";
import { useRecoveryState } from "@/modules/dashboard/hooks/useRecoveryState";
import { isActionableRecoveryErrorClass } from "@/services/recovery/errorClassificationGuards";
import {
    classifyMissingFilesState,
    type RecoveryOutcome,
    type RecoveryRecommendedAction,
} from "@/services/recovery/recovery-controller";
import type {
    DownloadMissingCommandOutcome,
    RecoverySessionViewState,
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";
import type { TorrentOperationState } from "@/shared/status";

export type {
    DownloadMissingCommandOutcome,
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";

interface RecoveryControllerServices {
    client: EngineAdapter;
}

interface RecoveryControllerData {
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
}

interface RecoveryControllerRefreshDeps {
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    clearDetail: () => void;
    pendingDeletionHashesRef: MutableRefObject<Set<string>>;
}

interface UseRecoveryControllerParams {
    services: RecoveryControllerServices;
    data: RecoveryControllerData;
    refresh: RecoveryControllerRefreshDeps;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    updateOperationOverlays: (
        updates: Array<{ id: string; operation?: TorrentOperationState }>,
    ) => void;
}

interface RecoveryModalActions {
    close: () => void;
    retry: () => Promise<void>;
    autoRetry: () => Promise<void>;
}

interface LocationEditorControls {
    state: LocationEditorState | null;
    cancel: () => void;
    release: () => void;
    confirm: () => Promise<SetLocationConfirmOutcome>;
    change: (value: string) => void;
}

interface RecoveryActions {
    executeDownloadMissing: (target: Torrent | TorrentDetail) => Promise<DownloadMissingCommandOutcome>;
    executeRetryFetch: (target: Torrent | TorrentDetail) => Promise<RetryRecoveryCommandOutcome>;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
        uiOptions?: { suppressFeedback?: boolean; bypassActiveRequestDedup?: boolean },
    ) => Promise<ResumeRecoveryCommandOutcome>;
    applyTorrentLocation: (
        torrent: Torrent | TorrentDetail,
        path: string,
        moveData: boolean,
    ) => Promise<ResumeRecoveryCommandOutcome>;
    handlePrepareDelete: (torrent: Torrent, deleteData?: boolean) => void;
    isDownloadMissingInFlight: (torrent: Torrent | TorrentDetail) => boolean;
    markTorrentPausedByUser: (torrent: Torrent | TorrentDetail) => void;
    getRecoverySessionForKey: (torrentKey: string | null) => RecoverySessionInfo | null;
    openRecoveryModal: (
        torrent: Torrent | TorrentDetail,
        options?: OpenRecoveryModalOptions,
    ) => OpenRecoveryModalOutcome;
}

export interface RecoveryControllerResult {
    state: RecoverySessionViewState;
    modal: RecoveryModalActions;
    locationEditor: LocationEditorControls;
    setLocation: {
        capability: SetLocationCapability;
        handler: (torrent: Torrent | TorrentDetail, options?: SetLocationOptions) => Promise<SetLocationOutcome>;
    };
    actions: RecoveryActions;
}

export function useRecoveryController({
    services,
    data,
    refresh,
    dispatch,
    updateOperationOverlays,
}: UseRecoveryControllerParams): RecoveryControllerResult {
    const { client } = services;

    const { engineCapabilities } = useSession();
    const { canBrowse, supportsManual } = useUiModeCapabilities();
    const setLocationCapability = useMemo(() => ({ canBrowse, supportsManual }), [canBrowse, supportsManual]);
    const { torrents, detailData } = data;
    const { refreshTorrents, refreshSessionStatsData, refreshDetailData, clearDetail, pendingDeletionHashesRef } = refresh;

    const recoveryStateController = useRecoveryState({
        torrents,
        detailData,
    });
    const {
        state: recoveryState,
        recoverySession,
        withRecoveryBusy,
        finalizeRecovery,
        setRecoverySessionOutcome,
        cancelRecoveryForFingerprint,
        createRecoveryQueueEntry,
        enqueueRecoveryEntry,
        isRecoverySessionActive,
        hasActiveRecoveryRequest,
        abortActiveRecoveryRequest,
    } = recoveryStateController;

    const {
        resumeTorrentWithRecovery,
        applyTorrentLocation,
        executeDownloadMissing,
        isDownloadMissingInFlight,
        executeRetryFetch,
        executeCooldownGatedAutoRetry,
        markTorrentPausedByUser,
    } = useRecoveryActions({
        client,
        torrents,
        detailData,
        dispatch,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        recoveryState: recoveryStateController,
        updateOperationOverlays,
    });

    const { handleRecoveryClose, handleRecoveryRetry, handleRecoveryAutoRetry, setLocationAndRecover } = useRecoveryModal({
        recoverySession,
        withRecoveryBusy,
        executeRetryFetch,
        executeCooldownGatedAutoRetry,
        applyTorrentLocation,
        hasActiveRecoveryRequest,
        abortActiveRecoveryRequest,
        finalizeRecovery,
        resumeTorrentWithRecovery,
    });

    const { setLocationEditorState, cancelSetLocationEditor, releaseSetLocationEditor, confirmSetLocation, handleSetLocationInputChange, handleSetLocation } = useLocationEditor({
        torrents,
        detailData,
        recoverySession,
        setLocationAndRecover,
    });
    const handlePrepareDelete = useCallback(
        (torrent: Torrent, deleteData = false) => {
            void deleteData;
            const targetId = torrent.id ?? torrent.hash;
            const key = getRecoveryFingerprint(torrent);
            if (!targetId || !key) return;
            const normalizedHash = torrent.hash?.toLowerCase();
            if (normalizedHash) {
                pendingDeletionHashesRef.current.add(normalizedHash);
            }
            if (detailData && getRecoveryFingerprint(detailData) === key) {
                clearDetail();
            }
            clearVerifyGuardEntry(key);
            clearCachedProbe(key);
            cancelRecoveryForFingerprint(key, { status: "cancelled" });
        },
        [cancelRecoveryForFingerprint, clearDetail, detailData, pendingDeletionHashesRef],
    );

    const getRecoverySessionForKey = useCallback(
        (torrentKey: string | null) => {
            if (!torrentKey || !recoverySession) return null;
            const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
            if (!sessionKey) return null;
            return sessionKey === torrentKey ? recoverySession : null;
        },
        [recoverySession],
    );

    const openRecoveryModal = useCallback(
        (
            torrent: Torrent | TorrentDetail,
            options?: OpenRecoveryModalOptions,
        ): OpenRecoveryModalOutcome => {
            const envelope = torrent.errorEnvelope;
            if (!envelope || !isActionableRecoveryErrorClass(envelope.errorClass)) {
                return { status: "not_actionable" };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            if (options?.forceWorkbench) {
                const classification = classifyMissingFilesState(
                    envelope,
                    torrent.savePath ?? torrent.downloadDir ?? "",
                    {
                        torrentId: torrent.id ?? torrent.hash,
                        engineCapabilities,
                    },
                );
                const recommendedActions = Array.from(
                    new Set<RecoveryRecommendedAction>([
                        "chooseLocation",
                        "locate",
                        ...classification.recommendedActions,
                    ]),
                );
                const workbenchClassification = {
                    ...classification,
                    recommendedActions,
                };
                const outcomeReason: "missing" | "unwritable" | "disk-full" =
                    envelope.errorClass === "diskFull"
                        ? "disk-full"
                        : envelope.errorClass === "permissionDenied" ||
                            workbenchClassification.kind === "accessDenied"
                          ? "unwritable"
                          : "missing";
                const sessionOutcome: RecoveryOutcome = {
                    kind: "needs-user-decision",
                    reason: outcomeReason,
                    hintPath: workbenchClassification.path,
                };
                const shouldOpenLocationEditor =
                    outcomeReason !== "disk-full" && supportsManual;
                const openForcedWorkbenchEditor = () => {
                    if (!shouldOpenLocationEditor) return;
                    void handleSetLocation(torrent, {
                        surface: "recovery-modal",
                        mode: "manual",
                    });
                };
                if (isRecoverySessionActive(fingerprint)) {
                    setRecoverySessionOutcome(sessionOutcome, {
                        classification: workbenchClassification,
                        torrent,
                    });
                    openForcedWorkbenchEditor();
                    return { status: "already_open" };
                }
                const entry = createRecoveryQueueEntry(
                    torrent,
                    "resume",
                    sessionOutcome,
                    workbenchClassification,
                    fingerprint,
                );
                const completion = enqueueRecoveryEntry(entry).then((result) =>
                    result.status === "cancelled"
                        ? { status: "cancelled" as const }
                        : result.status === "handled"
                          ? { status: "applied" as const, awaitingRecovery: true }
                        : {
                                status: "failed" as const,
                                reason: "dispatch_not_applied" as const,
                            },
                );
                openForcedWorkbenchEditor();
                return {
                    status: "requested",
                    completion,
                };
            }
            if (isRecoverySessionActive(fingerprint)) {
                return { status: "already_open" };
            }
            // Reuse the same recovery gate path as all resume entry points:
            // auto-recover when possible, show/queue modal only when required.
            const completion = resumeTorrentWithRecovery(torrent);
            return {
                status: "requested",
                completion,
            };
        },
        [
            createRecoveryQueueEntry,
            engineCapabilities,
            enqueueRecoveryEntry,
            isRecoverySessionActive,
            resumeTorrentWithRecovery,
            setRecoverySessionOutcome,
            handleSetLocation,
            supportsManual,
        ],
    );

    return {
        state: recoveryState,
        modal: {
            close: handleRecoveryClose,
            retry: handleRecoveryRetry,
            autoRetry: handleRecoveryAutoRetry,
        },
        locationEditor: {
            state: setLocationEditorState,
            cancel: cancelSetLocationEditor,
            release: releaseSetLocationEditor,
            confirm: confirmSetLocation,
            change: handleSetLocationInputChange,
        },
        setLocation: {
            capability: setLocationCapability,
            handler: handleSetLocation,
        },
        actions: {
            executeDownloadMissing,
            executeRetryFetch,
            resumeTorrentWithRecovery,
            applyTorrentLocation,
            handlePrepareDelete,
            isDownloadMissingInFlight,
            markTorrentPausedByUser,
            getRecoverySessionForKey,
            openRecoveryModal,
        },
    };
}

export default useRecoveryController;
