import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type {
    DownloadMissingOutcome,
    RecoveryRequestCompletionOutcome,
} from "@/app/context/RecoveryContext";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/context/SessionContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type { RecoverySequenceOptions, MissingFilesClassification, RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { RecoveryGateAction, RecoveryGateCallback, RecoveryGateOutcome } from "@/app/types/recoveryGate";
import type {
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";
import type { UseRecoveryStateResult } from "@/modules/dashboard/hooks/useRecoveryState";
import { scheduler } from "@/app/services/scheduler";
import { shellAgent } from "@/app/agents/shell-agent";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import { STATUS, type TorrentOperationState } from "@/shared/status";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { classifyMissingFilesState, clearVerifyGuardEntry, probeMissingFiles, recoverMissingFiles } from "@/services/recovery/recovery-controller";
import { clearProbe as clearCachedProbe, getProbe as getCachedProbe, setProbe as setCachedProbe, setClassificationOverride } from "@/services/recovery/missingFilesStore";
import { derivePathReason, getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import { infraLogger } from "@/shared/utils/infraLogger";
import { BACKGROUND_REFRESH_INTERVAL_MS, RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS, RECOVERY_ESCALATION_GRACE_MS, RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS, RECOVERY_POLL_INTERVAL_MS } from "@/config/logic";
import { clearClassificationOverrideIfPresent, delay, isRecoveryActiveState } from "@/modules/dashboard/hooks/useRecoveryController.shared";
import { isActionableRecoveryErrorClass, shouldUseRecoveryGateForResume } from "@/services/recovery/errorClassificationGuards";
import { computeBackgroundRecoveryDelayMs } from "@/modules/dashboard/hooks/recoveryRetryDelay";

const PROBE_TTL_MS = BACKGROUND_REFRESH_INTERVAL_MS;
const isUserInitiatedRecoveryAction = (
    action: RecoveryGateAction,
): action is "resume" | "downloadMissing" =>
    action === "resume" || action === "downloadMissing";

const hasMeaningfulRecoveryDecision = (
    classification: MissingFilesClassification,
    outcome: RecoveryOutcome | null,
): boolean => {
    if (outcome?.kind !== "path-needed") {
        return false;
    }
    const nonDecisionReason = outcome.reason === "disk-full";
    const nonDecisionMessage =
        outcome.message === "insufficient_free_space" ||
        outcome.message === "free_space_check_not_supported" ||
        outcome.message === "disk_full";
    if (nonDecisionReason || nonDecisionMessage) {
        return false;
    }
    const certaintyRequiresDecision =
        classification.confidence === "certain" ||
        classification.escalationSignal === "conflict" ||
        classification.escalationSignal === "multipleCandidates";
    return certaintyRequiresDecision;
};

const hasImmediateEscalationCertainty = (
    classification: MissingFilesClassification,
    outcome: RecoveryOutcome,
): boolean => {
    if (outcome.kind !== "path-needed") {
        return false;
    }
    if (classification.confidence === "certain") {
        return true;
    }
    return (
        classification.escalationSignal === "conflict" ||
        classification.escalationSignal === "multipleCandidates"
    );
};

type ResumeRecoveryUiOptions = {
    suppressFeedback?: boolean;
};

interface UseRecoveryActionsParams {
    client: EngineAdapter;
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
    dispatch: (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    recoveryState: UseRecoveryStateResult;
    updateOperationOverlays: (
        updates: Array<{ id: string; operation?: TorrentOperationState }>,
    ) => void;
}

export function useRecoveryActions({
    client,
    torrents,
    detailData,
    dispatch,
    refreshTorrents,
    refreshSessionStatsData,
    refreshDetailData,
    recoveryState,
    updateOperationOverlays,
}: UseRecoveryActionsParams) {
    const { t } = useTranslation();
    const { engineCapabilities, reportCommandError } = useSession();
    const { showFeedback } = useActionFeedback();
    const relocateOverlayClearRef = useRef<Map<string, () => void>>(new Map());
    const recoveryOverlayKeysRef = useRef<Set<string>>(new Set());

    const {
        recoverySession,
        getActiveRecoverySignal,
        getActiveRecoveryPromiseForFingerprint,
        setRecoverySessionOutcome,
        scheduleRecoveryFinalize,
        createRecoveryQueueEntry,
        enqueueRecoveryEntry,
        finalizeRecovery,
        torrentsRef,
        markRecoveryPausedBySystem,
        markRecoveryPausedByUser,
        markRecoveryCancelled,
        markRecoveryResumed,
        isRecoveryCancelled,
        isBackgroundRecoveryEligible,
        silentVolumeRecoveryInFlightRef,
        silentVolumeRecoveryNextRetryAtRef,
        silentVolumeRecoveryAttemptCountRef,
    } = recoveryState;

    const runMissingFilesFlow = useCallback(
        async (torrent: Torrent | TorrentDetail, options?: RecoverySequenceOptions, signal?: AbortSignal) => {
            const activeClient = client;
            const envelope = torrent.errorEnvelope;
            if (!activeClient || !envelope) return null;
            if (!isActionableRecoveryErrorClass(envelope.errorClass)) {
                const classificationKey = torrent.id ?? torrent.hash;
                clearClassificationOverrideIfPresent(classificationKey);
                return null;
            }

            const classification = classifyMissingFilesState(envelope, torrent.savePath ?? torrent.downloadDir ?? "", {
                torrentId: torrent.id ?? torrent.hash,
                engineCapabilities,
            });
            const classificationKey = torrent.id ?? torrent.hash;
            if (classificationKey) {
                setClassificationOverride(classificationKey, classification);
            }

            try {
                const missingBytes = typeof torrent.leftUntilDone === "number" ? torrent.leftUntilDone : null;
                const id = torrent.id ?? torrent.hash;
                const cachedProbe = id ? getCachedProbe(id) : undefined;
                const isLocalExecution = engineCapabilities.executionModel === "local";
                const isLocalEmpty = isLocalExecution && cachedProbe?.kind === "data_missing" && cachedProbe.expectedBytes > 0 && cachedProbe.onDiskBytes === 0;
                const sequenceOptions: RecoverySequenceOptions = {
                    ...options,
                    missingBytes,
                    skipVerifyIfEmpty: options?.skipVerifyIfEmpty ?? isLocalEmpty,
                    autoCreateMissingFolder: options?.autoCreateMissingFolder ?? isLocalExecution,
                };
                if (signal) {
                    sequenceOptions.signal = signal;
                }

                // Local-only: if the torrent path disappeared, try to recreate it silently
                // so downloads don't "stumble" on transient folder loss.
                if (isLocalExecution && shellAgent.isAvailable && classification.kind === "pathLoss" && sequenceOptions.autoCreateMissingFolder) {
                    const downloadDir = resolveTorrentPath(torrent);
                    if (downloadDir) {
                        try {
                            await shellAgent.createDirectory(downloadDir);
                        } catch (err) {
                            infraLogger.warn(
                                {
                                    scope: "recovery_controller",
                                    event: "auto_create_folder_failed",
                                    message: "Failed to auto-create missing folder before recovery flow",
                                    details: {
                                        downloadDir,
                                        torrentId: torrent.id ?? torrent.hash,
                                    },
                                },
                                err,
                            );
                            // Creation failed — clear the flag so that
                            // ensurePathReady reports "path_check_failed"
                            // instead of the misleading
                            // "directory_creation_not_supported".
                            sequenceOptions.autoCreateMissingFolder = false;
                        }
                    }
                }
                return await recoverMissingFiles({
                    client: activeClient,
                    torrent,
                    envelope,
                    classification,
                    engineCapabilities,
                    options: sequenceOptions,
                });
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "missing_files_flow_failed",
                        message: "Missing-files recovery flow failed",
                        details: {
                            torrentId: torrent.id ?? torrent.hash,
                            classificationKind: classification.kind,
                        },
                    },
                    err,
                );
                throw err;
            }
        },
        [client, engineCapabilities],
    );

    const scheduleRelocateOverlayClear = useCallback(
        (id: string, delayMs: number) => {
            const pendingCancel = relocateOverlayClearRef.current.get(id);
            pendingCancel?.();
            const cancel = scheduler.scheduleTimeout(() => {
                updateOperationOverlays([{ id }]);
                relocateOverlayClearRef.current.delete(id);
            }, Math.max(0, delayMs));
            relocateOverlayClearRef.current.set(id, cancel);
        },
        [updateOperationOverlays],
    );

    const setRecoveryOverlayState = useCallback(
        (torrent: Torrent | TorrentDetail, isRecovering: boolean) => {
            const targetId = torrent.id ?? torrent.hash;
            if (!targetId) {
                return;
            }
            const overlayKey = String(targetId);
            if (isRecovering) {
                if (recoveryOverlayKeysRef.current.has(overlayKey)) {
                    return;
                }
                recoveryOverlayKeysRef.current.add(overlayKey);
            } else {
                if (!recoveryOverlayKeysRef.current.has(overlayKey)) {
                    return;
                }
                recoveryOverlayKeysRef.current.delete(overlayKey);
            }
            updateOperationOverlays([
                {
                    id: overlayKey,
                    operation: isRecovering
                        ? STATUS.torrentOperation.RECOVERING
                        : undefined,
                },
            ]);
        },
        [updateOperationOverlays],
    );

    useEffect(() => {
        const overlayClearMap = relocateOverlayClearRef.current;
        return () => {
            overlayClearMap.forEach((cancel) => cancel());
            overlayClearMap.clear();
        };
    }, []);

    const probeMissingFilesIfStale = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const activeClient = client;
            if (!activeClient) return;
            if (!isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass)) {
                return;
            }
            const id = torrent.id ?? torrent.hash;
            if (!id) return;

            const cached = getCachedProbe(id);
            if (cached && Date.now() - cached.ts < PROBE_TTL_MS) {
                return;
            }

            try {
                const probe = await probeMissingFiles(torrent, activeClient, engineCapabilities);
                setCachedProbe(id, probe);
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "probe_missing_files_failed",
                        message: "Missing-files probe failed",
                        details: { torrentId: id },
                    },
                    err,
                );
            }
        },
        [client, engineCapabilities],
    );

    useEffect(() => {
        const runProbe = () => {
            const errored = torrentsRef.current.filter((torrent) => isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass));
            errored.forEach((torrent) => {
                void probeMissingFilesIfStale(torrent);
            });
        };
        runProbe();
        const probeTask = scheduler.scheduleRecurringTask(runProbe, RECOVERY_POLL_INTERVAL_MS);
        return () => probeTask.cancel();
    }, [probeMissingFilesIfStale, torrentsRef]);
    const activeRecoveryGateRequestsRef = useRef<Map<string, Promise<RecoveryGateOutcome>>>(new Map());

    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options, ui }) => {
            const fingerprint = getRecoveryFingerprint(torrent);
            const activeRecoveryPromise =
                getActiveRecoveryPromiseForFingerprint(fingerprint);
            const activeGateRequest =
                activeRecoveryGateRequestsRef.current.get(fingerprint);
            if (activeGateRequest && action !== "recheck") {
                return activeGateRequest;
            }
            if (activeRecoveryPromise && action !== "recheck") {
                return activeRecoveryPromise;
            }
            markRecoveryResumed(fingerprint);
            const startedAtMs = Date.now();
            const shouldUseEscalationGrace =
                isUserInitiatedRecoveryAction(action);
            const suppressFeedback = Boolean(ui?.suppressFeedback);
            if (shouldUseEscalationGrace && action === "resume") {
                if (!suppressFeedback) {
                    showFeedback(
                        t("recovery.modal.in_progress"),
                        "info",
                        RECOVERY_ESCALATION_GRACE_MS,
                    );
                }
            }
            const requestPromise: Promise<RecoveryGateOutcome> = (async () => {
                const envelope = torrent.errorEnvelope;
                let needsModalComputed = false;
                let needsModalSurfaced = false;
                let needsModalRequiresDecision = false;
                let needsModalOutcome: RecoveryOutcome | null = null;
                if (!envelope) {
                    return { status: "not_required", reason: "no_error_envelope" };
                }
                try {
                    if (action === "setLocation") {
                        return { status: "not_required", reason: "set_location" };
                    }
                    if (!isActionableRecoveryErrorClass(envelope.errorClass)) {
                        const key = torrent.id ?? torrent.hash;
                        clearClassificationOverrideIfPresent(key);
                        return { status: "not_required", reason: "not_actionable" };
                    }

                    const downloadDir = torrent.savePath ?? torrent.downloadDir ?? "";
                    const fallbackClassification = classifyMissingFilesState(envelope, downloadDir, {
                        torrentId: torrent.id ?? torrent.hash,
                        engineCapabilities,
                    });
                    let flowClassification: MissingFilesClassification = fallbackClassification;

                    let blockingOutcome: RecoveryOutcome | null = null;
                    try {
                        const flowResult = await runMissingFilesFlow(torrent, options, getActiveRecoverySignal());
                        if (flowResult?.classification) {
                            flowClassification = flowResult.classification;
                        }
                        if (flowResult?.status === "resolved") {
                            if (flowResult.log === "verify_completed_paused") {
                                markRecoveryPausedBySystem(fingerprint);
                            } else {
                                markRecoveryResumed(fingerprint);
                            }
                            clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                            if (torrent.id ?? torrent.hash) {
                                clearCachedProbe(torrent.id ?? torrent.hash);
                            }
                            return { status: "handled", log: flowResult.log };
                        }
                        if (flowResult?.status === "needsModal") {
                            needsModalComputed = true;
                            blockingOutcome = flowResult.blockingOutcome ?? null;
                            needsModalOutcome = blockingOutcome;
                        }
                    } catch {
                        blockingOutcome = {
                            kind: "path-needed",
                            reason: derivePathReason(envelope.errorClass),
                        };
                    }
                    const hasDecision = hasMeaningfulRecoveryDecision(
                        flowClassification,
                        blockingOutcome,
                    );
                    needsModalRequiresDecision =
                        needsModalComputed && hasDecision;
                    const activeRecoveryDuringResolution =
                        getActiveRecoveryPromiseForFingerprint(fingerprint);

                    if (!blockingOutcome) {
                        if (shouldUseEscalationGrace) {
                            const remainingMs =
                                RECOVERY_ESCALATION_GRACE_MS -
                                (Date.now() - startedAtMs);
                            if (remainingMs > 0) {
                                await delay(remainingMs);
                            }
                            const fallbackBlockedOutcome: RecoveryOutcome = {
                                kind: "path-needed",
                                reason: derivePathReason(envelope.errorClass),
                                message: "path_check_failed",
                            };
                            if (activeRecoveryDuringResolution) {
                                setRecoverySessionOutcome(
                                    fallbackBlockedOutcome,
                                    undefined,
                                    false,
                                );
                            }
                            if (!suppressFeedback) {
                                showFeedback(t("recovery.status.blocked"), "warning");
                            }
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        return {
                            status: "not_required",
                            reason: "no_blocking_outcome",
                        };
                    }
                    if (action === "recheck") {
                        if (activeRecoveryDuringResolution) {
                            setRecoverySessionOutcome(
                                blockingOutcome,
                                undefined,
                                hasDecision,
                            );
                            needsModalSurfaced = true;
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        const entry = createRecoveryQueueEntry(
                            torrent,
                            action,
                            blockingOutcome,
                            flowClassification,
                            fingerprint,
                            hasDecision,
                        );
                        needsModalSurfaced = true;
                        void enqueueRecoveryEntry(entry);
                        return {
                            status: "not_required",
                            reason: "blocked",
                        };
                    }

                    const isCertainBlockingOutcome =
                        hasImmediateEscalationCertainty(
                            flowClassification,
                            blockingOutcome,
                        );
                    if (
                        shouldUseEscalationGrace &&
                        !isCertainBlockingOutcome
                    ) {
                        const remainingMs =
                            RECOVERY_ESCALATION_GRACE_MS -
                            (Date.now() - startedAtMs);
                        if (remainingMs > 0) {
                            await delay(remainingMs);
                        }
                    }
                    if (!hasDecision) {
                        if (activeRecoveryDuringResolution) {
                            setRecoverySessionOutcome(
                                blockingOutcome,
                                undefined,
                                false,
                            );
                            needsModalSurfaced = true;
                        }
                        if (!suppressFeedback) {
                            showFeedback(t("recovery.status.blocked"), "warning");
                        }
                        return {
                            status: "not_required",
                            reason: "blocked",
                        };
                    }
                    if (activeRecoveryDuringResolution) {
                        setRecoverySessionOutcome(
                            blockingOutcome,
                            undefined,
                            true,
                        );
                        needsModalSurfaced = true;
                        return activeRecoveryDuringResolution;
                    }
                    const entry = createRecoveryQueueEntry(
                        torrent,
                        action,
                        blockingOutcome,
                        flowClassification,
                        fingerprint,
                        true,
                    );
                    needsModalSurfaced = true;
                    return enqueueRecoveryEntry(entry);
                } finally {
                    if (
                        import.meta.env.DEV &&
                        needsModalRequiresDecision &&
                        !needsModalSurfaced
                    ) {
                        infraLogger.error({
                            scope: "recovery_controller",
                            event: "needs_modal_not_surfaced",
                            message:
                                "Recovery gate produced needsModal without updating or enqueuing a recovery session",
                            details: {
                                fingerprint,
                                action,
                                errorClass: envelope.errorClass,
                                recoveryState: envelope.recoveryState,
                                outcomeKind: needsModalOutcome?.kind ?? null,
                                outcomeReason:
                                    needsModalOutcome &&
                                    "reason" in needsModalOutcome
                                        ? needsModalOutcome.reason
                                        : null,
                            },
                        });
                    }
                }
            })();

            activeRecoveryGateRequestsRef.current.set(fingerprint, requestPromise);
            try {
                return await requestPromise;
            } finally {
                if (fingerprint && activeRecoveryGateRequestsRef.current.get(fingerprint) === requestPromise) {
                    activeRecoveryGateRequestsRef.current.delete(fingerprint);
                }
            }
        },
        [
            createRecoveryQueueEntry,
            enqueueRecoveryEntry,
            engineCapabilities,
            getActiveRecoveryPromiseForFingerprint,
            getActiveRecoverySignal,
            markRecoveryPausedBySystem,
            markRecoveryResumed,
            runMissingFilesFlow,
            setRecoverySessionOutcome,
            showFeedback,
            t,
        ],
    );

    const refreshAfterRecovery = useCallback(
        async (target: Torrent | TorrentDetail) => {
            await refreshTorrents?.();
            await refreshSessionStatsData?.();
            if (detailData?.id === target.id) {
                await refreshDetailData();
            }
        },
        [refreshDetailData, refreshSessionStatsData, refreshTorrents, detailData],
    );

    const applyTorrentLocation = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            path: string,
            moveData: boolean,
        ): Promise<RecoveryRequestCompletionOutcome> => {
            const targetId = torrent.id ?? torrent.hash;
            if (!targetId) {
                return {
                    status: "failed",
                    reason: "invalid_target",
                };
            }
            const relocateTargetId = moveData ? String(targetId) : null;
            if (relocateTargetId) {
                const pendingCancel =
                    relocateOverlayClearRef.current.get(relocateTargetId);
                pendingCancel?.();
                relocateOverlayClearRef.current.delete(relocateTargetId);
                updateOperationOverlays([
                    {
                        id: relocateTargetId,
                        operation: STATUS.torrentOperation.RELOCATING,
                    },
                ]);
            }
            try {
                const outcome = await dispatch(
                    TorrentIntents.ensureAtLocation(targetId, path, {
                        moveData,
                    }),
                );
                if (outcome.status === "applied") {
                    try {
                        await refreshAfterRecovery({
                            ...torrent,
                            downloadDir: path,
                            savePath: path,
                        });
                    } catch {
                        // Keep location updates resilient; command was applied.
                    }
                    showFeedback(t("recovery.toast_location_updated"), "success");
                    return {
                        status: "applied",
                        awaitingRecovery: false,
                    };
                }
                if (
                    outcome.status === "unsupported" &&
                    outcome.reason === "method_missing"
                ) {
                    return {
                        status: "failed",
                        reason: "method_missing",
                    };
                }
                return {
                    status: "failed",
                    reason: "dispatch_not_applied",
                };
            } catch {
                return {
                    status: "failed",
                    reason: "execution_failed",
                };
            } finally {
                if (relocateTargetId) {
                    scheduleRelocateOverlayClear(relocateTargetId, 0);
                }
            }
        },
        [
            dispatch,
            refreshAfterRecovery,
            scheduleRelocateOverlayClear,
            showFeedback,
            t,
            updateOperationOverlays,
        ],
    );

    const resolveRecoverySession = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: RecoverySequenceOptions & {
                delayAfterSuccessMs?: number;
                notifyDriveDetected?: boolean;
                deferFinalizeMs?: number;
            },
        ) => {
            try {
                const { delayAfterSuccessMs, notifyDriveDetected, deferFinalizeMs, ...sequenceOptions } = options ?? {};
                const flowResult = await runMissingFilesFlow(torrent, sequenceOptions, getActiveRecoverySignal());
                if (!flowResult) return false;
                if (flowResult.status === "resolved") {
                    const targetKey = torrent.id ?? torrent.hash ?? "";
                    const fingerprint = getRecoveryFingerprint(torrent);
                    const pausedAfterVerify = flowResult.log === "verify_completed_paused";
                    clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                    if (targetKey) {
                        clearCachedProbe(targetKey);
                    }
                    if (pausedAfterVerify) {
                        markRecoveryPausedBySystem(fingerprint);
                    } else {
                        markRecoveryResumed(fingerprint);
                    }
                    try {
                        await refreshAfterRecovery(torrent);
                    } catch (err) {
                        infraLogger.error(
                            {
                                scope: "recovery_controller",
                                event: "refresh_after_recovery_failed",
                                message: "Failed to refresh data after recovery resolution",
                                details: {
                                    torrentId: torrent.id ?? torrent.hash,
                                },
                            },
                            err,
                        );
                    }
                    if (notifyDriveDetected) {
                        showFeedback(t("recovery.toast_drive_detected"), "info");
                    }
                    if (!pausedAfterVerify) {
                        const feedbackKey = flowResult.log === "all_verified_resuming" ? "recovery.feedback.all_verified_resuming" : "recovery.feedback.download_resumed";
                        showFeedback(t(feedbackKey), "info");
                    }
                    if (delayAfterSuccessMs && delayAfterSuccessMs > 0) {
                        await delay(delayAfterSuccessMs);
                    }
                    if (
                        deferFinalizeMs &&
                        deferFinalizeMs > 0 &&
                        scheduleRecoveryFinalize(
                            deferFinalizeMs,
                            {
                                status: "handled",
                                log: flowResult.log,
                            },
                            {
                                kind: "resolved",
                                message: "path_ready",
                            },
                        )
                    ) {
                        return true;
                    }
                    finalizeRecovery({ status: "handled" });
                    return true;
                }
                if (flowResult.status === "needsModal") {
                    const outcome = flowResult.blockingOutcome;
                    if (outcome) {
                        setRecoverySessionOutcome(
                            outcome,
                            undefined,
                            hasMeaningfulRecoveryDecision(
                                flowResult.classification,
                                outcome,
                            ),
                        );
                    }
                }
                return false;
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "resolve_recreate_or_pick_path_failed",
                        message: "Recovery resolution failed for recreate/pick-path flow",
                    },
                    err,
                );
                return false;
            }
        },
        [
            finalizeRecovery,
            getActiveRecoverySignal,
            markRecoveryPausedBySystem,
            markRecoveryResumed,
            refreshAfterRecovery,
            runMissingFilesFlow,
            scheduleRecoveryFinalize,
            setRecoverySessionOutcome,
            showFeedback,
            t,
        ],
    );

    useEffect(() => {
        torrents.forEach((torrent) => {
            const id = torrent.id ?? torrent.hash;
            if (!id) return;
            if (isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass)) {
                return;
            }
            clearClassificationOverrideIfPresent(id);
        });
    }, [torrents]);

    const waitForActiveState = useCallback(
        async (torrentId: string, timeoutMs = 1000) => {
            if (!client || !client.getTorrentDetails) {
                return true;
            }
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                try {
                    const detail = await client.getTorrentDetails(torrentId, {
                        profile: "standard",
                        includeTrackerStats: false,
                    });
                    if (detail && isRecoveryActiveState(detail.state)) {
                        return true;
                    }
                } catch {
                    // best-effort; keep polling
                }
                await delay(RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS);
            }
            return false;
        },
        [client],
    );

    const tryBeginCooldownGatedRecoveryAttempt = useCallback(
        (fingerprint: string): "started" | "cooldown" | "in_flight" => {
            if (silentVolumeRecoveryInFlightRef.current.has(fingerprint)) {
                return "in_flight";
            }
            const nextRetryAt =
                silentVolumeRecoveryNextRetryAtRef.current.get(fingerprint) ?? 0;
            if (Date.now() < nextRetryAt) {
                return "cooldown";
            }
            silentVolumeRecoveryInFlightRef.current.add(fingerprint);
            return "started";
        },
        [silentVolumeRecoveryInFlightRef, silentVolumeRecoveryNextRetryAtRef],
    );

    const clearCooldownGatedRecoverySchedule = useCallback(
        (fingerprint: string) => {
            silentVolumeRecoveryNextRetryAtRef.current.delete(fingerprint);
            silentVolumeRecoveryAttemptCountRef.current.delete(fingerprint);
        },
        [silentVolumeRecoveryAttemptCountRef, silentVolumeRecoveryNextRetryAtRef],
    );

    const scheduleCooldownGatedRecoveryRetry = useCallback(
        (fingerprint: string) => {
            const attempt =
                (silentVolumeRecoveryAttemptCountRef.current.get(fingerprint) ?? 0) +
                1;
            silentVolumeRecoveryAttemptCountRef.current.set(
                fingerprint,
                attempt,
            );
            const retryDelayMs = computeBackgroundRecoveryDelayMs(
                fingerprint,
                attempt,
            );
            silentVolumeRecoveryNextRetryAtRef.current.set(
                fingerprint,
                Date.now() + retryDelayMs,
            );
        },
        [silentVolumeRecoveryAttemptCountRef, silentVolumeRecoveryNextRetryAtRef],
    );

    const finishCooldownGatedRecoveryAttempt = useCallback(
        (fingerprint: string) => {
            silentVolumeRecoveryInFlightRef.current.delete(fingerprint);
        },
        [silentVolumeRecoveryInFlightRef],
    );

    const tryBackgroundRecovery = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const targetId = torrent.id ?? torrent.hash;
            const isPausedState = torrent.state === STATUS.torrent.PAUSED;
            if (
                !isPausedState &&
                torrent.state !== STATUS.torrent.MISSING_FILES &&
                torrent.state !== STATUS.torrent.ERROR
            ) {
                setRecoveryOverlayState(torrent, false);
                return;
            }
            const envelope = torrent.errorEnvelope;
            if (
                !envelope ||
                !isActionableRecoveryErrorClass(envelope.errorClass)
            ) {
                setRecoveryOverlayState(torrent, false);
                return;
            }
            const fingerprint = getRecoveryFingerprint(torrent);
            if (!fingerprint) {
                setRecoveryOverlayState(torrent, false);
                return;
            }
            if (isRecoveryCancelled(fingerprint)) {
                clearCooldownGatedRecoverySchedule(fingerprint);
                setRecoveryOverlayState(torrent, false);
                return;
            }
            if (isPausedState && !isBackgroundRecoveryEligible(fingerprint)) {
                clearCooldownGatedRecoverySchedule(fingerprint);
                setRecoveryOverlayState(torrent, false);
                return;
            }
            const attemptState = tryBeginCooldownGatedRecoveryAttempt(fingerprint);
            if (attemptState !== "started") {
                setRecoveryOverlayState(torrent, true);
                return;
            }

            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                {
                    torrentId: torrent.id ?? torrent.hash,
                    engineCapabilities,
                },
            );
            const shouldNotifyDriveDetected =
                classification.kind === "volumeLoss" &&
                classification.confidence !== "unknown";

            setRecoveryOverlayState(torrent, true);
            try {
                const flowResult = await runMissingFilesFlow(torrent);
                if (flowResult?.status === "resolved") {
                    clearVerifyGuardEntry(fingerprint);
                    if (targetId) {
                        clearCachedProbe(String(targetId));
                    }
                    clearCooldownGatedRecoverySchedule(fingerprint);
                    await refreshAfterRecovery(torrent);
                    if (targetId && shouldNotifyDriveDetected) {
                        const resumed = await waitForActiveState(String(targetId));
                        if (resumed) {
                            showFeedback(t("recovery.toast_drive_detected"), "info");
                        }
                    }
                    setRecoveryOverlayState(torrent, false);
                    return;
                }
                scheduleCooldownGatedRecoveryRetry(fingerprint);
                setRecoveryOverlayState(torrent, true);
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "silent_volume_recovery_failed",
                        message: "Background recovery retry failed",
                        details: { fingerprint },
                    },
                    err,
                );
                scheduleCooldownGatedRecoveryRetry(fingerprint);
                setRecoveryOverlayState(torrent, true);
            } finally {
                finishCooldownGatedRecoveryAttempt(fingerprint);
            }
        },
        [
            clearCooldownGatedRecoverySchedule,
            engineCapabilities,
            finishCooldownGatedRecoveryAttempt,
            isBackgroundRecoveryEligible,
            isRecoveryCancelled,
            recoverySession,
            refreshAfterRecovery,
            runMissingFilesFlow,
            scheduleCooldownGatedRecoveryRetry,
            setRecoveryOverlayState,
            showFeedback,
            t,
            tryBeginCooldownGatedRecoveryAttempt,
            waitForActiveState,
        ],
    );

    const executeCooldownGatedAutoRetry = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const fingerprint = getRecoveryFingerprint(torrent);
            if (!fingerprint) {
                return;
            }
            const attemptState =
                tryBeginCooldownGatedRecoveryAttempt(fingerprint);
            if (attemptState !== "started") {
                return;
            }
            try {
                const resolved = await resolveRecoverySession(torrent, {
                    notifyDriveDetected: true,
                    deferFinalizeMs: RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS,
                });
                if (resolved) {
                    clearCooldownGatedRecoverySchedule(fingerprint);
                    return;
                }
                scheduleCooldownGatedRecoveryRetry(fingerprint);
            } finally {
                finishCooldownGatedRecoveryAttempt(fingerprint);
            }
        },
        [
            clearCooldownGatedRecoverySchedule,
            finishCooldownGatedRecoveryAttempt,
            resolveRecoverySession,
            scheduleCooldownGatedRecoveryRetry,
            tryBeginCooldownGatedRecoveryAttempt,
        ],
    );

    useEffect(() => {
        const runSilentRecoveryPass = () => {
            const activeSessionFingerprint = recoverySession
                ? getRecoveryFingerprint(recoverySession.torrent)
                : "";
            torrentsRef.current.forEach((torrent) => {
                const fingerprint = getRecoveryFingerprint(torrent);
                if (
                    activeSessionFingerprint &&
                    fingerprint === activeSessionFingerprint
                ) {
                    void executeCooldownGatedAutoRetry(torrent);
                    return;
                }
                void tryBackgroundRecovery(torrent);
            });
        };

        runSilentRecoveryPass();
        const task = scheduler.scheduleRecurringTask(runSilentRecoveryPass, RECOVERY_POLL_INTERVAL_MS);
        return () => {
            task.cancel();
        };
    }, [
        executeCooldownGatedAutoRetry,
        recoverySession,
        torrentsRef,
        tryBackgroundRecovery,
    ]);

    const resumeTorrentWithRecovery = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            uiOptions?: ResumeRecoveryUiOptions,
        ): Promise<ResumeRecoveryCommandOutcome> => {
            try {
                const id = torrent.id ?? torrent.hash;
                const fingerprint = getRecoveryFingerprint(torrent);
                const suppressFeedback = Boolean(uiOptions?.suppressFeedback);
                if (!id) {
                    return {
                        status: "failed",
                        reason: "invalid_target",
                    };
                }
                if (shouldUseRecoveryGateForResume(torrent)) {
                    const gateResult = await requestRecovery({
                        torrent,
                        action: "resume",
                        ui: { suppressFeedback },
                    });
                    if (gateResult.status === "handled") {
                        try {
                            await refreshAfterRecovery(torrent);
                        } catch (err) {
                            infraLogger.error(
                                {
                                    scope: "recovery_controller",
                                    event: "refresh_after_recovery_failed",
                                    message: "Failed to refresh data after recovery resolution",
                                    details: {
                                        torrentId: torrent.id ?? torrent.hash,
                                    },
                                },
                                err,
                            );
                        }
                        if (gateResult.log === "verify_completed_paused") {
                            return { status: "applied" };
                        }
                        markRecoveryResumed(fingerprint);
                        const resumed = await waitForActiveState(id);
                        const isAllVerified = gateResult.log === "all_verified_resuming";
                        const toastKey = isAllVerified ? "recovery.feedback.all_verified_resuming" : resumed ? "recovery.feedback.download_resumed" : "recovery.feedback.resume_queued";
                        const tone = isAllVerified || resumed ? "info" : "warning";
                        if (!suppressFeedback) {
                            showFeedback(t(toastKey), tone);
                        }
                        return { status: "applied" };
                    }
                    if (
                        gateResult.status === "not_required" &&
                        gateResult.reason === "blocked"
                    ) {
                        if (!suppressFeedback) {
                            showFeedback(t("recovery.status.blocked"), "warning");
                        }
                        return {
                            status: "failed",
                            reason: "dispatch_not_applied",
                        };
                    }
                    if (gateResult.status === "continue" || gateResult.status === "not_required") {
                        const outcome = await dispatch(TorrentIntents.ensureActive(id));
                        if (outcome.status !== "applied") {
                            return {
                                status: "failed",
                                reason: "dispatch_not_applied",
                            };
                        }
                        markRecoveryResumed(fingerprint);
                        return { status: "applied" };
                    }
                    if (gateResult.status === "cancelled") {
                        markRecoveryCancelled(fingerprint);
                        return { status: "cancelled" };
                    }
                    return {
                        status: "failed",
                        reason: "dispatch_not_applied",
                    };
                }
                const outcome = await dispatch(TorrentIntents.ensureActive(id));
                if (outcome.status !== "applied") {
                    return {
                        status: "failed",
                        reason: "dispatch_not_applied",
                    };
                }
                markRecoveryResumed(fingerprint);
                return { status: "applied" };
            } catch {
                return {
                    status: "failed",
                    reason: "execution_failed",
                };
            }
        },
        [
            dispatch,
            markRecoveryCancelled,
            markRecoveryResumed,
            requestRecovery,
            refreshAfterRecovery,
            showFeedback,
            t,
            waitForActiveState,
        ],
    );

    const downloadMissingInFlight =
        useRef<Map<string, Promise<DownloadMissingOutcome>>>(new Map());
    const [downloadMissingInFlightKeys, setDownloadMissingInFlightKeys] =
        useState<Set<string>>(() => new Set());
    const markDownloadMissingInFlight = useCallback((fingerprint: string) => {
        setDownloadMissingInFlightKeys((previous) => {
            if (previous.has(fingerprint)) {
                return previous;
            }
            const next = new Set(previous);
            next.add(fingerprint);
            return next;
        });
    }, []);
    const clearDownloadMissingInFlight = useCallback((fingerprint: string) => {
        setDownloadMissingInFlightKeys((previous) => {
            if (!previous.has(fingerprint)) {
                return previous;
            }
            const next = new Set(previous);
            next.delete(fingerprint);
            return next;
        });
    }, []);
    const isDownloadMissingInFlight = useCallback(
        (torrent: Torrent | TorrentDetail) =>
            downloadMissingInFlightKeys.has(getRecoveryFingerprint(torrent)),
        [downloadMissingInFlightKeys],
    );

    const executeDownloadMissing = useCallback(
        async (
            target: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean },
        ): Promise<DownloadMissingOutcome> => {
            const key = getRecoveryFingerprint(target);
            setRecoveryOverlayState(target, true);
            const inFlight = downloadMissingInFlight.current.get(key);
            if (inFlight) {
                return inFlight;
            }
            showFeedback(
                t("recovery.modal.in_progress"),
                "info",
                RECOVERY_ESCALATION_GRACE_MS,
            );
            const requestPromise: Promise<DownloadMissingOutcome> = (async () => {
                try {
                    const gateResult = await requestRecovery({
                        torrent: target,
                        action: "downloadMissing",
                        options,
                    });
                    if (gateResult.status === "handled") {
                        clearCachedProbe(target.id ?? target.hash ?? "");
                        try {
                            await refreshAfterRecovery(target);
                        } catch (err) {
                            infraLogger.error(
                                {
                                    scope: "recovery_controller",
                                    event: "refresh_after_download_missing_failed",
                                    message: "Failed to refresh data after download-missing handling",
                                    details: {
                                        torrentId: target.id ?? target.hash,
                                    },
                                },
                                err,
                            );
                        }
                        if (gateResult.log !== "verify_completed_paused") {
                            showFeedback(t("recovery.feedback.download_resumed"), "info");
                        }
                        return { status: "applied" };
                    }
                    if (gateResult.status === "not_required") {
                        return {
                            status: "not_required",
                            reason: gateResult.reason,
                        };
                    }
                    if (gateResult.status === "cancelled") {
                        return {
                            status: "not_required",
                            reason: "operation_cancelled",
                        };
                    }
                    return {
                        status: "not_required",
                        reason: "no_blocking_outcome",
                    };
                } catch (err) {
                    reportCommandError?.(err);
                    return {
                        status: "failed",
                        reason: "execution_failed",
                    };
                }
            })();
            downloadMissingInFlight.current.set(key, requestPromise);
            markDownloadMissingInFlight(key);
            try {
                return await requestPromise;
            } finally {
                if (downloadMissingInFlight.current.get(key) === requestPromise) {
                    downloadMissingInFlight.current.delete(key);
                }
                clearDownloadMissingInFlight(key);
                setRecoveryOverlayState(target, false);
            }
        },
        [
            setRecoveryOverlayState,
            requestRecovery,
            refreshAfterRecovery,
            showFeedback,
            t,
            reportCommandError,
            clearDownloadMissingInFlight,
            markDownloadMissingInFlight,
        ],
    );

    const executeRetryFetch = useCallback(
        async (target: Torrent | TorrentDetail): Promise<RetryRecoveryCommandOutcome> => {
            const activeClient = client;
            if (!activeClient) {
                return {
                    status: "not_applied",
                    shouldCloseModal: false,
                    reason: "missing_client",
                };
            }
            clearVerifyGuardEntry(getRecoveryFingerprint(target));

            const gateResult = await requestRecovery({
                torrent: target,
                action: "recheck",
                options: { recreateFolder: false, retryOnly: true },
            });
            clearCachedProbe(target.id ?? target.hash ?? "");

            try {
                await refreshAfterRecovery(target);
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "refresh_after_retry_probe_failed",
                        message: "Failed to refresh data after retry probe",
                        details: {
                            torrentId: target.id ?? target.hash,
                        },
                    },
                    err,
                );
            }

            if (gateResult.status === "handled") {
                return { status: "applied", shouldCloseModal: true };
            }
            if (
                gateResult.status === "not_required" &&
                gateResult.reason === "blocked"
            ) {
                showFeedback(t("recovery.feedback.retry_failed"), "warning");
                return {
                    status: "not_applied",
                    shouldCloseModal: false,
                    reason: "blocked",
                };
            }
            if (gateResult.status === "not_required" && gateResult.reason !== "no_blocking_outcome") {
                return { status: "applied", shouldCloseModal: true };
            }
            return {
                status: "not_applied",
                shouldCloseModal: false,
                reason: "no_change",
            };
        },
        [client, requestRecovery, refreshAfterRecovery, showFeedback, t],
    );

    const markTorrentPausedByUser = useCallback(
        (torrent: Torrent | TorrentDetail) => {
            const fingerprint = getRecoveryFingerprint(torrent);
            if (!fingerprint) {
                return;
            }
            markRecoveryPausedByUser(fingerprint);
            setRecoveryOverlayState(torrent, false);
        },
        [markRecoveryPausedByUser, setRecoveryOverlayState],
    );

    return {
        requestRecovery,
        runMissingFilesFlow,
        refreshAfterRecovery,
        applyTorrentLocation,
        resolveRecoverySession,
        waitForActiveState,
        resumeTorrentWithRecovery,
        executeDownloadMissing,
        isDownloadMissingInFlight,
        executeRetryFetch,
        executeCooldownGatedAutoRetry,
        markTorrentPausedByUser,
    };
}
