import { useCallback, useEffect, useRef } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";
import type { RecoveryRequestCompletionOutcome } from "@/app/context/RecoveryContext";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/context/SessionContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type { RecoverySequenceOptions, MissingFilesClassification, RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { RecoveryGateCallback } from "@/app/types/recoveryGate";
import type { ResumeRecoveryCommandOutcome, RetryRecoveryCommandOutcome } from "@/modules/dashboard/hooks/useRecoveryController.types";
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
import { BACKGROUND_REFRESH_INTERVAL_MS, RECOVERY_ACTIVE_STATE_POLL_INTERVAL_MS, RECOVERY_POLL_INTERVAL_MS, RECOVERY_RETRY_COOLDOWN_MS } from "@/config/logic";
import { clearClassificationOverrideIfPresent, delay, isRecoveryActiveState } from "@/modules/dashboard/hooks/useRecoveryController.shared";
import { isActionableRecoveryErrorClass, shouldUseRecoveryGateForResume } from "@/services/recovery/errorClassificationGuards";

const PROBE_TTL_MS = BACKGROUND_REFRESH_INTERVAL_MS;

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
        return () => {
            relocateOverlayClearRef.current.forEach((cancel) => cancel());
            relocateOverlayClearRef.current.clear();
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
    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options }) => {
            const envelope = torrent.errorEnvelope;
            if (!envelope) {
                return { status: "not_required", reason: "no_error_envelope" };
            }
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
                    blockingOutcome = flowResult.blockingOutcome ?? null;
                }
            } catch {
                blockingOutcome = {
                    kind: "path-needed",
                    reason: derivePathReason(envelope.errorClass),
                };
            }

            if (!blockingOutcome) {
                return {
                    status: "not_required",
                    reason: "no_blocking_outcome",
                };
            }
            if (action === "recheck") {
                return {
                    status: "handled",
                    blockingOutcome,
                };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            const activeRecoveryPromise = getActiveRecoveryPromiseForFingerprint(fingerprint);
            if (activeRecoveryPromise) {
                return activeRecoveryPromise;
            }
            const entry = createRecoveryQueueEntry(torrent, action, blockingOutcome, flowClassification, fingerprint);
            return enqueueRecoveryEntry(entry);
        },
        [runMissingFilesFlow, createRecoveryQueueEntry, enqueueRecoveryEntry, engineCapabilities, getActiveRecoverySignal, getActiveRecoveryPromiseForFingerprint],
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

    const redownloadInFlight = useRef<Set<string>>(new Set());

    const executeRedownload = useCallback(
        async (target: Torrent | TorrentDetail, options?: { recreateFolder?: boolean }) => {
            const key = getRecoveryFingerprint(target);
            if (redownloadInFlight.current.has(key)) return;

            redownloadInFlight.current.add(key);
            try {
                const gateResult = await requestRecovery({
                    torrent: target,
                    action: "redownload",
                    options,
                });
                if (gateResult.status !== "continue") {
                    if (gateResult.status === "handled") {
                        clearCachedProbe(target.id ?? target.hash ?? "");
                        await refreshAfterRecovery(target);
                        if (gateResult.log !== "verify_completed_paused") {
                            showFeedback(t("recovery.feedback.download_resumed"), "info");
                        }
                    }
                    return;
                }
            } catch (err) {
                reportCommandError?.(err);
            } finally {
                redownloadInFlight.current.delete(key);
            }
        },
        [requestRecovery, refreshAfterRecovery, showFeedback, t, reportCommandError],
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
        executeRedownload,
        executeRetryFetch,
    };
}
