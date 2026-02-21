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
import { BACKGROUND_REFRESH_INTERVAL_MS, RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS, RECOVERY_ESCALATION_GRACE_MS, RECOVERY_POLL_INTERVAL_MS, RECOVERY_RETRY_COOLDOWN_MS } from "@/config/logic";
import { clearClassificationOverrideIfPresent, delay, isRecoveryActiveState } from "@/modules/dashboard/hooks/useRecoveryController.shared";
import { isActionableRecoveryErrorClass, shouldUseRecoveryGateForResume } from "@/services/recovery/errorClassificationGuards";

const PROBE_TTL_MS = BACKGROUND_REFRESH_INTERVAL_MS;
const isUserInitiatedRecoveryAction = (
    action: RecoveryGateAction,
): action is "resume" | "downloadMissing" =>
    action === "resume" || action === "downloadMissing";

const hasMeaningfulRecoveryDecision = (outcome: RecoveryOutcome | null): boolean =>
    outcome?.kind === "path-needed";

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
        activeRecoveryEligibleRef,
        silentVolumeRecoveryInFlightRef,
        silentVolumeRecoveryNextRetryAtRef,
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
        async ({ torrent, action, options }) => {
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
            const startedAtMs = Date.now();
            const shouldUseEscalationGrace =
                isUserInitiatedRecoveryAction(action);
            if (shouldUseEscalationGrace && action === "resume") {
                showFeedback(
                    t("recovery.modal.in_progress"),
                    "info",
                    RECOVERY_ESCALATION_GRACE_MS,
                );
            }
            const requestPromise: Promise<RecoveryGateOutcome> = (async () => {
                const envelope = torrent.errorEnvelope;
                let needsModalComputed = false;
                let needsModalSurfaced = false;
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

                    if (!blockingOutcome) {
                        if (shouldUseEscalationGrace) {
                            const remainingMs =
                                RECOVERY_ESCALATION_GRACE_MS -
                                (Date.now() - startedAtMs);
                            if (remainingMs > 0) {
                                await delay(remainingMs);
                            }
                            showFeedback(t("recovery.status.blocked"), "warning");
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
                    const activeRecoveryDuringResolution = getActiveRecoveryPromiseForFingerprint(fingerprint);
                    if (action === "recheck") {
                        if (activeRecoveryDuringResolution) {
                            setRecoverySessionOutcome(blockingOutcome);
                            needsModalSurfaced = true;
                            return {
                                status: "handled",
                                blockingOutcome,
                            };
                        }
                        const entry = createRecoveryQueueEntry(torrent, action, blockingOutcome, flowClassification, fingerprint);
                        needsModalSurfaced = true;
                        void enqueueRecoveryEntry(entry);
                        return {
                            status: "handled",
                            blockingOutcome,
                        };
                    }

                    const hasDecision =
                        hasMeaningfulRecoveryDecision(blockingOutcome);
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
                            setRecoverySessionOutcome(blockingOutcome);
                            needsModalSurfaced = true;
                        }
                        showFeedback(t("recovery.status.blocked"), "warning");
                        return {
                            status: "not_required",
                            reason: "blocked",
                        };
                    }
                    if (activeRecoveryDuringResolution) {
                        setRecoverySessionOutcome(blockingOutcome);
                        needsModalSurfaced = true;
                        return activeRecoveryDuringResolution;
                    }
                    const entry = createRecoveryQueueEntry(torrent, action, blockingOutcome, flowClassification, fingerprint);
                    needsModalSurfaced = true;
                    return enqueueRecoveryEntry(entry);
                } finally {
                    if (
                        import.meta.env.DEV &&
                        needsModalComputed &&
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
        [runMissingFilesFlow, createRecoveryQueueEntry, enqueueRecoveryEntry, engineCapabilities, getActiveRecoverySignal, getActiveRecoveryPromiseForFingerprint, setRecoverySessionOutcome, showFeedback, t],
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
                    const pausedAfterVerify = flowResult.log === "verify_completed_paused";
                    clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                    if (targetKey) {
                        clearCachedProbe(targetKey);
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
                        setRecoverySessionOutcome(outcome);
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
        [runMissingFilesFlow, refreshAfterRecovery, showFeedback, t, getActiveRecoverySignal, setRecoverySessionOutcome, scheduleRecoveryFinalize, finalizeRecovery],
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

    const trySilentVolumeLossRecovery = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            if (recoverySession) return;
            if (torrent.state !== STATUS.torrent.MISSING_FILES && torrent.state !== STATUS.torrent.ERROR) {
                return;
            }
            const envelope = torrent.errorEnvelope;
            if (!envelope || !isActionableRecoveryErrorClass(envelope.errorClass)) {
                return;
            }
            const fingerprint = getRecoveryFingerprint(torrent);
            if (!fingerprint) return;
            if (!activeRecoveryEligibleRef.current.has(fingerprint)) {
                return;
            }
            if (silentVolumeRecoveryInFlightRef.current.has(fingerprint)) {
                return;
            }
            const nextRetryAt = silentVolumeRecoveryNextRetryAtRef.current.get(fingerprint) ?? 0;
            if (Date.now() < nextRetryAt) {
                return;
            }

            const classification = classifyMissingFilesState(envelope, torrent.savePath ?? torrent.downloadDir ?? "", {
                torrentId: torrent.id ?? torrent.hash,
                engineCapabilities,
            });
            const canSilentResolveVolumeLoss = classification.kind === "volumeLoss" && classification.confidence !== "unknown";
            const canSilentResolvePathLoss = classification.kind === "pathLoss" && classification.confidence === "certain" && shellAgent.isAvailable;
            if (!canSilentResolveVolumeLoss && !canSilentResolvePathLoss) {
                return;
            }

            silentVolumeRecoveryInFlightRef.current.add(fingerprint);
            try {
                const flowResult = await runMissingFilesFlow(torrent);
                if (flowResult?.status === "resolved") {
                    clearVerifyGuardEntry(fingerprint);
                    const targetKey = torrent.id ?? torrent.hash ?? "";
                    if (targetKey) {
                        clearCachedProbe(targetKey);
                    }
                    silentVolumeRecoveryNextRetryAtRef.current.delete(fingerprint);
                    await refreshAfterRecovery(torrent);
                    const targetId = torrent.id ?? torrent.hash;
                    if (targetId && canSilentResolveVolumeLoss) {
                        const resumed = await waitForActiveState(String(targetId));
                        if (resumed) {
                            showFeedback(t("recovery.toast_drive_detected"), "info");
                        }
                    }
                    return;
                }
                silentVolumeRecoveryNextRetryAtRef.current.set(fingerprint, Date.now() + RECOVERY_RETRY_COOLDOWN_MS);
            } catch (err) {
                infraLogger.error(
                    {
                        scope: "recovery_controller",
                        event: "silent_volume_recovery_failed",
                        message: "Silent volume-loss recovery failed",
                        details: { fingerprint },
                    },
                    err,
                );
                silentVolumeRecoveryNextRetryAtRef.current.set(fingerprint, Date.now() + RECOVERY_RETRY_COOLDOWN_MS);
            } finally {
                silentVolumeRecoveryInFlightRef.current.delete(fingerprint);
            }
        },
        [
            engineCapabilities,
            recoverySession,
            activeRecoveryEligibleRef,
            silentVolumeRecoveryInFlightRef,
            silentVolumeRecoveryNextRetryAtRef,
            refreshAfterRecovery,
            runMissingFilesFlow,
            showFeedback,
            t,
            waitForActiveState,
        ],
    );

    useEffect(() => {
        const runSilentRecoveryPass = () => {
            if (recoverySession) return;
            torrentsRef.current.forEach((torrent) => {
                void trySilentVolumeLossRecovery(torrent);
            });
        };

        runSilentRecoveryPass();
        const task = scheduler.scheduleRecurringTask(runSilentRecoveryPass, RECOVERY_POLL_INTERVAL_MS);
        return () => {
            task.cancel();
        };
    }, [recoverySession, trySilentVolumeLossRecovery, torrentsRef]);

    const resumeTorrentWithRecovery = useCallback(
        async (torrent: Torrent | TorrentDetail): Promise<ResumeRecoveryCommandOutcome> => {
            try {
                const id = torrent.id ?? torrent.hash;
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
                        const resumed = await waitForActiveState(id);
                        const isAllVerified = gateResult.log === "all_verified_resuming";
                        const toastKey = isAllVerified ? "recovery.feedback.all_verified_resuming" : resumed ? "recovery.feedback.download_resumed" : "recovery.feedback.resume_queued";
                        const tone = isAllVerified || resumed ? "info" : "warning";
                        showFeedback(t(toastKey), tone);
                        return { status: "applied" };
                    }
                    if (
                        gateResult.status === "not_required" &&
                        gateResult.reason === "blocked"
                    ) {
                        showFeedback(t("recovery.status.blocked"), "warning");
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
                        return { status: "applied" };
                    }
                    if (gateResult.status === "cancelled") {
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
                return { status: "applied" };
            } catch {
                return {
                    status: "failed",
                    reason: "execution_failed",
                };
            }
        },
        [dispatch, requestRecovery, refreshAfterRecovery, showFeedback, t, waitForActiveState],
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
            }
        },
        [
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

            if (gateResult.status === "handled" && Boolean(gateResult.blockingOutcome)) {
                showFeedback(t("recovery.feedback.retry_failed"), "warning");
                return {
                    status: "not_applied",
                    shouldCloseModal: false,
                    reason: "blocked",
                };
            }
            if (gateResult.status === "handled" && !gateResult.blockingOutcome) {
                return { status: "applied", shouldCloseModal: true };
            }
            if (
                gateResult.status === "not_required" &&
                gateResult.reason === "blocked"
            ) {
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
    };
}
