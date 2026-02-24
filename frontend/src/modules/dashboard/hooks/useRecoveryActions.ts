import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { DownloadMissingOutcome, RecoveryRequestCompletionOutcome } from "@/app/context/RecoveryContext";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/context/SessionContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type {
    RecoverySequenceOptions,
    MissingFilesClassification,
    RecoveryOutcome,
} from "@/services/recovery/recovery-controller";
import type { RecoveryGateAction, RecoveryGateCallback, RecoveryGateOutcome } from "@/app/types/recoveryGate";
import type {
    ResumeRecoveryCommandOutcome,
    RetryRecoveryCommandOutcome,
} from "@/modules/dashboard/hooks/useRecoveryController.types";
import type { UseRecoveryStateResult } from "@/modules/dashboard/hooks/useRecoveryState";
import { scheduler } from "@/app/services/scheduler";
import { STATUS, type TorrentOperationState } from "@/shared/status";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import {
    classifyMissingFilesState,
    clearVerifyGuardEntry,
    probeMissingFiles,
    recoverMissingFiles,
} from "@/services/recovery/recovery-controller";
import {
    determineDisposition,
    type RecoveryFlowOutcome,
} from "@/modules/dashboard/hooks/recoveryGateInterpreter";
import {
    clearProbe as clearCachedProbe,
    getProbe as getCachedProbe,
    setProbe as setCachedProbe,
    setClassificationOverride,
} from "@/services/recovery/missingFilesStore";
import { derivePathReason, getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import { infraLogger } from "@/shared/utils/infraLogger";
import {
    BACKGROUND_REFRESH_INTERVAL_MS,
    RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS,
    RECOVERY_ESCALATION_GRACE_MS,
    RECOVERY_MODAL_RESOLVED_AUTO_CLOSE_DELAY_MS,
    RECOVERY_POLL_INTERVAL_MS,
} from "@/config/logic";
import {
    clearClassificationOverrideIfPresent,
    delay,
    isRecoveryActiveState,
} from "@/modules/dashboard/hooks/useRecoveryController.shared";
import {
    isActionableRecoveryErrorClass,
    shouldUseRecoveryGateForResume,
} from "@/services/recovery/errorClassificationGuards";
import * as retryScheduler from "@/modules/dashboard/hooks/recoveryRetryScheduler";

const PROBE_TTL_MS = BACKGROUND_REFRESH_INTERVAL_MS;
const isUserInitiatedRecoveryAction = (action: RecoveryGateAction): action is "resume" | "downloadMissing" =>
    action === "resume" || action === "downloadMissing";

/**
 * Determines whether a blocked outcome can be upgraded to a user decision.
 *
 * This is the **single mapping boundary** from service-level "blocked" outcomes
 * to the session-level "needs-user-decision" kind.  All other layers consume
 * the already-mapped `RecoveryOutcome` — no wrapper or UI layer may re-interpret
 * or flatten outcomes.
 */
const canUpgradeToUserDecision = (
    classification: MissingFilesClassification,
    outcome: RecoveryOutcome | null,
): boolean => {
    if (!outcome || outcome.kind !== "blocked") {
        return false;
    }
    const reason = outcome.reason;
    if (reason === "disk-full" || reason === "error") {
        return false;
    }
    const nonDecisionMessage =
        outcome.message === "insufficient_free_space" ||
        outcome.message === "free_space_check_not_supported" ||
        outcome.message === "disk_full";
    if (nonDecisionMessage) {
        return false;
    }
    const certaintyRequiresDecision =
        classification.confidence === "certain" ||
        classification.escalationSignal === "conflict" ||
        classification.escalationSignal === "multipleCandidates";
    return certaintyRequiresDecision;
};

/**
 * Upgrades a `blocked` outcome to `needs-user-decision` when classification
 * indicates the user can take meaningful action.  Returns the outcome unchanged
 * if upgrade is not applicable.
 *
 * This is the single canonical transform — called exactly once per session entry.
 */
const upgradeOutcomeForSession = (
    outcome: RecoveryOutcome,
    classification: MissingFilesClassification,
): RecoveryOutcome => {
    if (outcome.kind !== "blocked" || !canUpgradeToUserDecision(classification, outcome)) {
        return outcome;
    }
    const decisionReason =
        outcome.reason === "missing" || outcome.reason === "unwritable" || outcome.reason === "disk-full"
            ? outcome.reason
            : "missing";
    return {
        kind: "needs-user-decision",
        reason: decisionReason,
        message: outcome.message,
    };
};

const hasImmediateEscalationCertainty = (
    classification: MissingFilesClassification,
    outcome: RecoveryOutcome,
): boolean => {
    if (outcome.kind !== "blocked" && outcome.kind !== "needs-user-decision") {
        return false;
    }
    if (classification.confidence === "certain") {
        return true;
    }
    return classification.escalationSignal === "conflict" || classification.escalationSignal === "multipleCandidates";
};

type ResumeRecoveryUiOptions = {
    suppressFeedback?: boolean;
    bypassActiveRequestDedup?: boolean;
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
    updateOperationOverlays: (updates: Array<{ id: string; operation?: TorrentOperationState }>) => void;
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
    const recoveryOverlayKeysRef = useRef<Set<string>>(new Set());
    const activeRelocationOverlayIdsRef = useRef<Set<string>>(new Set());
    const pendingRelocationOverlayClearRef = useRef<Set<string>>(new Set());

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
        backgroundRecoveryInFlightRef,
        backgroundRecoveryNextRetryAtRef,
        backgroundRecoveryAttemptCountRef: backgroundRecoveryAttemptCountRef,
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
                const isLocalEmpty =
                    isLocalExecution &&
                    cachedProbe?.kind === "data_missing" &&
                    cachedProbe.expectedBytes > 0 &&
                    cachedProbe.onDiskBytes === 0;
                const sequenceOptions: RecoverySequenceOptions = {
                    ...options,
                    missingBytes,
                    skipVerifyIfEmpty: options?.skipVerifyIfEmpty ?? isLocalEmpty,
                };
                if (signal) {
                    sequenceOptions.signal = signal;
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

    const setRelocationOverlayState = useCallback(
        (id: string, isRelocating: boolean) => {
            updateOperationOverlays([
                {
                    id,
                    operation: isRelocating ? STATUS.torrentOperation.RELOCATING : undefined,
                },
            ]);
        },
        [updateOperationOverlays],
    );

    const beginRelocationOverlay = useCallback(
        (id: string) => {
            if (!id) {
                return;
            }
            activeRelocationOverlayIdsRef.current.add(id);
            pendingRelocationOverlayClearRef.current.delete(id);
            setRelocationOverlayState(id, true);
        },
        [setRelocationOverlayState],
    );

    const queueRelocationOverlayClearOnHeartbeat = useCallback((id: string) => {
        if (!id || !activeRelocationOverlayIdsRef.current.has(id)) {
            return;
        }
        pendingRelocationOverlayClearRef.current.add(id);
    }, []);

    const clearRelocationOverlayImmediately = useCallback(
        (id: string) => {
            if (!id) {
                return;
            }
            const wasTracking =
                activeRelocationOverlayIdsRef.current.delete(id) ||
                pendingRelocationOverlayClearRef.current.delete(id);
            if (!wasTracking) {
                return;
            }
            setRelocationOverlayState(id, false);
        },
        [setRelocationOverlayState],
    );

    useEffect(() => {
        const pendingIds = pendingRelocationOverlayClearRef.current;
        if (pendingIds.size === 0) {
            return;
        }
        const clearUpdates: Array<{ id: string; operation?: TorrentOperationState }> = [];
        pendingIds.forEach((id) => {
            pendingIds.delete(id);
            activeRelocationOverlayIdsRef.current.delete(id);
            clearUpdates.push({
                id,
                operation: undefined,
            });
        });
        if (clearUpdates.length > 0) {
            updateOperationOverlays(clearUpdates);
        }
    }, [detailData, torrents, updateOperationOverlays]);

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
                    operation: isRecovering ? STATUS.torrentOperation.RECOVERING : undefined,
                },
            ]);
        },
        [updateOperationOverlays],
    );

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
            const errored = torrentsRef.current.filter((torrent) =>
                isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass),
            );
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
            const activeRecoveryPromise = getActiveRecoveryPromiseForFingerprint(fingerprint);
            const activeGateRequest = activeRecoveryGateRequestsRef.current.get(fingerprint);
            const bypassActiveRequestDedup = Boolean(ui?.bypassActiveRequestDedup);
            if (!bypassActiveRequestDedup && activeGateRequest && action !== "recheck") {
                return activeGateRequest;
            }
            if (!bypassActiveRequestDedup && activeRecoveryPromise && action !== "recheck") {
                return activeRecoveryPromise;
            }
            markRecoveryResumed(fingerprint);
            const startedAtMs = Date.now();
            const shouldUseEscalationGrace = isUserInitiatedRecoveryAction(action);
            const suppressFeedback = Boolean(ui?.suppressFeedback);
            if (shouldUseEscalationGrace && action === "resume") {
                if (!suppressFeedback) {
                    showFeedback(t("recovery.modal.in_progress"), "info", RECOVERY_ESCALATION_GRACE_MS);
                }
            }
            const requestPromise: Promise<RecoveryGateOutcome> = (async () => {
                const envelope = torrent.errorEnvelope;
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
                            blockingOutcome = flowResult.blockingOutcome;
                            needsModalOutcome = blockingOutcome;
                        }
                    } catch {
                        blockingOutcome = {
                            kind: "blocked",
                            reason: derivePathReason(envelope.errorClass),
                        };
                    }

                    // Apply the single mapping boundary: upgrade blocked → needs-user-decision
                    // when classification indicates an actionable user choice.
                    const sessionOutcome: RecoveryOutcome | null = blockingOutcome
                        ? upgradeOutcomeForSession(blockingOutcome, flowClassification)
                        : null;
                    const activeRecoveryDuringResolution = getActiveRecoveryPromiseForFingerprint(fingerprint);
                    const hasActiveSession = Boolean(activeRecoveryDuringResolution);
                    if (needsModalOutcome && sessionOutcome?.kind === "needs-user-decision") {
                        needsModalRequiresDecision = true;
                    }

                    const flowOutcome: RecoveryFlowOutcome = sessionOutcome
                        ? {
                              type: "needs-disposition",
                              sessionOutcome,
                              classification: flowClassification,
                          }
                        : { type: "no-outcome" };

                    const waitForEscalationGraceIfNeeded = async (outcome: RecoveryFlowOutcome) => {
                        if (!shouldUseEscalationGrace) {
                            return;
                        }
                        if (outcome.type === "needs-disposition") {
                            const isCertainBlockingOutcome = hasImmediateEscalationCertainty(
                                outcome.classification,
                                outcome.sessionOutcome,
                            );
                            if (isCertainBlockingOutcome) {
                                return;
                            }
                        }
                        const remainingMs = RECOVERY_ESCALATION_GRACE_MS - (Date.now() - startedAtMs);
                        if (remainingMs > 0) {
                            await delay(remainingMs);
                        }
                    };

                    await waitForEscalationGraceIfNeeded(flowOutcome);
                    const disposition = determineDisposition(flowOutcome, {
                        action,
                        hasActiveSession,
                        shouldUseEscalationGrace,
                        suppressFeedback,
                    });

                    switch (disposition.type) {
                        case "fallback-blocked": {
                            const fallbackBlockedOutcome: RecoveryOutcome = {
                                kind: "blocked",
                                reason: derivePathReason(envelope.errorClass),
                                message: "path_check_failed",
                            };
                            if (hasActiveSession) {
                                setRecoverySessionOutcome(fallbackBlockedOutcome, {
                                    classification: flowClassification,
                                    torrent,
                                });
                            }
                            if (disposition.showFeedback) {
                                showFeedback(t("recovery.status.blocked"), "warning");
                            }
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        case "recheck-update": {
                            setRecoverySessionOutcome(disposition.outcome, {
                                classification: flowClassification,
                                torrent,
                            });
                            needsModalSurfaced = true;
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        case "recheck-enqueue": {
                            const entry = createRecoveryQueueEntry(
                                torrent,
                                action,
                                disposition.outcome,
                                disposition.classification,
                                fingerprint,
                            );
                            needsModalSurfaced = true;
                            void enqueueRecoveryEntry(entry);
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        case "show-modal": {
                            if (disposition.joinExisting && activeRecoveryDuringResolution) {
                                setRecoverySessionOutcome(disposition.outcome, {
                                    classification: disposition.classification,
                                    torrent,
                                });
                                needsModalSurfaced = true;
                                return activeRecoveryDuringResolution;
                            }
                            const entry = createRecoveryQueueEntry(
                                torrent,
                                action,
                                disposition.outcome,
                                disposition.classification,
                                fingerprint,
                            );
                            needsModalSurfaced = true;
                            return enqueueRecoveryEntry(entry);
                        }
                        case "blocked": {
                            if (disposition.updateSession && hasActiveSession) {
                                setRecoverySessionOutcome(disposition.outcome, {
                                    classification: flowClassification,
                                    torrent,
                                });
                                needsModalSurfaced = true;
                            }
                            if (disposition.showFeedback) {
                                showFeedback(t("recovery.status.blocked"), "warning");
                            }
                            return {
                                status: "not_required",
                                reason: "blocked",
                            };
                        }
                        case "no-action":
                            return {
                                status: "not_required",
                                reason: "no_blocking_outcome",
                            };
                    }
                } finally {
                    if (import.meta.env.DEV && needsModalRequiresDecision && !needsModalSurfaced) {
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
                                    needsModalOutcome && "reason" in needsModalOutcome
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
                beginRelocationOverlay(relocateTargetId);
            }
            try {
                const outcome = await dispatch(
                    TorrentIntents.ensureAtLocation(targetId, path, {
                        moveData,
                    }),
                );
                if (outcome.status === "applied") {
                    if (relocateTargetId) {
                        queueRelocationOverlayClearOnHeartbeat(relocateTargetId);
                    }
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
                if (relocateTargetId) {
                    clearRelocationOverlayImmediately(relocateTargetId);
                }
                if (outcome.status === "unsupported" && outcome.reason === "method_missing") {
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
                if (relocateTargetId) {
                    clearRelocationOverlayImmediately(relocateTargetId);
                }
                return {
                    status: "failed",
                    reason: "execution_failed",
                };
            }
        },
        [
            beginRelocationOverlay,
            clearRelocationOverlayImmediately,
            dispatch,
            queueRelocationOverlayClearOnHeartbeat,
            refreshAfterRecovery,
            showFeedback,
            t,
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
                        const feedbackKey =
                            flowResult.log === "all_verified_resuming"
                                ? "recovery.feedback.all_verified_resuming"
                                : "recovery.feedback.download_resumed";
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
                                kind: "auto-recovered",
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
                            upgradeOutcomeForSession(outcome, flowResult.classification),
                            {
                                classification: flowResult.classification,
                                torrent,
                            },
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

    // Centralized retry scheduler — all cooldown/in-flight/backoff logic
    // lives in recoveryRetryScheduler.  No duplicate mini state machines.
    const cooldownRefs = useMemo(
        () => ({
            inFlightRef: backgroundRecoveryInFlightRef,
            nextRetryAtRef: backgroundRecoveryNextRetryAtRef,
            attemptCountRef: backgroundRecoveryAttemptCountRef,
        }),
        [backgroundRecoveryInFlightRef, backgroundRecoveryNextRetryAtRef, backgroundRecoveryAttemptCountRef],
    );

    const tryBeginCooldownGatedRecoveryAttempt = useCallback(
        (fingerprint: string) => retryScheduler.tryBeginAttempt(fingerprint, cooldownRefs),
        [cooldownRefs],
    );

    const clearCooldownGatedRecoverySchedule = useCallback(
        (fingerprint: string) => retryScheduler.clearSchedule(fingerprint, cooldownRefs),
        [cooldownRefs],
    );

    const scheduleCooldownGatedRecoveryRetry = useCallback(
        (fingerprint: string) => retryScheduler.scheduleRetry(fingerprint, cooldownRefs),
        [cooldownRefs],
    );

    const finishCooldownGatedRecoveryAttempt = useCallback(
        (fingerprint: string) => retryScheduler.finishAttempt(fingerprint, cooldownRefs),
        [cooldownRefs],
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
            if (!envelope || !isActionableRecoveryErrorClass(envelope.errorClass)) {
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

            const classification = classifyMissingFilesState(envelope, torrent.savePath ?? torrent.downloadDir ?? "", {
                torrentId: torrent.id ?? torrent.hash,
                engineCapabilities,
            });
            const shouldNotifyDriveDetected =
                classification.kind === "volumeLoss" && classification.confidence !== "unknown";

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
                        event: "background_recovery_failed",
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
            const attemptState = tryBeginCooldownGatedRecoveryAttempt(fingerprint);
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
            const activeSessionFingerprint = recoverySession ? getRecoveryFingerprint(recoverySession.torrent) : "";
            torrentsRef.current.forEach((torrent) => {
                const fingerprint = getRecoveryFingerprint(torrent);
                if (activeSessionFingerprint && fingerprint === activeSessionFingerprint) {
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
    }, [executeCooldownGatedAutoRetry, recoverySession, torrentsRef, tryBackgroundRecovery]);

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
                        const toastKey = isAllVerified
                            ? "recovery.feedback.all_verified_resuming"
                            : resumed
                              ? "recovery.feedback.download_resumed"
                              : "recovery.feedback.resume_queued";
                        const tone = isAllVerified || resumed ? "info" : "warning";
                        if (!suppressFeedback) {
                            showFeedback(t(toastKey), tone);
                        }
                        return { status: "applied" };
                    }
                    if (gateResult.status === "not_required" && gateResult.reason === "blocked") {
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

    const downloadMissingInFlight = useRef<Map<string, Promise<DownloadMissingOutcome>>>(new Map());
    const [downloadMissingInFlightKeys, setDownloadMissingInFlightKeys] = useState<Set<string>>(() => new Set());
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
        (torrent: Torrent | TorrentDetail) => downloadMissingInFlightKeys.has(getRecoveryFingerprint(torrent)),
        [downloadMissingInFlightKeys],
    );

    const executeDownloadMissing = useCallback(
        async (target: Torrent | TorrentDetail): Promise<DownloadMissingOutcome> => {
            const key = getRecoveryFingerprint(target);
            setRecoveryOverlayState(target, true);
            const inFlight = downloadMissingInFlight.current.get(key);
            if (inFlight) {
                return inFlight;
            }
            showFeedback(t("recovery.modal.in_progress"), "info", RECOVERY_ESCALATION_GRACE_MS);
            const requestPromise: Promise<DownloadMissingOutcome> = (async () => {
                try {
                    const gateResult = await requestRecovery({
                        torrent: target,
                        action: "downloadMissing",
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
                options: { retryOnly: true },
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
            if (gateResult.status === "not_required" && gateResult.reason === "blocked") {
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
            showFeedback(t("recovery.feedback.retry_failed"), "warning");
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
