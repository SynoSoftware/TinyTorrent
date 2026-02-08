import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import type { MutableRefObject } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { scheduler } from "@/app/services/scheduler";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import { STATUS } from "@/shared/status";
import type { FeedbackTone } from "@/shared/types/feedback";
import {
    classifyMissingFilesState,
    probeMissingFiles,
    pollPathAvailability,
    clearVerifyGuardEntry,
    runMissingFilesRecoverySequence,
    type MissingFilesClassification,
    type RecoveryOutcome,
    type RecoverySequenceOptions,
} from "@/services/recovery/recovery-controller";
import {
    getProbe as getCachedProbe,
    setProbe as setCachedProbe,
    clearProbe as clearCachedProbe,
    pruneMissingFilesStore,
    setClassificationOverride,
    getClassificationOverride,
} from "@/services/recovery/missingFilesStore";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import type {
    InlineSetLocationState,
    RecoverySessionInfo,
    SetLocationCapability,
    SetLocationOptions,
    SetLocationSurface,
} from "@/app/context/RecoveryContext";
import { useSession } from "@/app/context/SessionContext";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import { useTranslation } from "react-i18next";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { shellAgent } from "@/app/agents/shell-agent";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

const PROBE_TTL_MS = 5000;
const PROBE_RUN_INTERVAL_MS = 5000;
const VOLUME_LOSS_CHECK_INTERVAL_MS = 2000;
const PICK_PATH_SUCCESS_DELAY_MS = 600;
const RECOVERY_ACTIONABLE_ERROR_CLASSES = new Set([
    "missingFiles",
    "permissionDenied",
    "diskFull",
]);

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });

const getRecoveryFingerprint = (torrent: Torrent | TorrentDetail) =>
    torrent.errorEnvelope?.fingerprint ??
    torrent.hash ??
    torrent.id ??
    "<no-recovery-fingerprint>";

const derivePathReason = (errorClass?: string | null) => {
    switch (errorClass) {
        case "permissionDenied":
            return "unwritable";
        case "diskFull":
            return "disk-full";
        case "missingFiles":
            return "missing";
        default:
            return "missing";
    }
};

const isRecoveryActiveState = (state?: string) => {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return (
        normalized === STATUS.torrent.DOWNLOADING ||
        normalized === STATUS.torrent.SEEDING ||
        normalized === STATUS.torrent.QUEUED
    );
};

const isActionableRecoveryErrorClass = (errorClass?: string | null) =>
    Boolean(
        errorClass && RECOVERY_ACTIONABLE_ERROR_CLASSES.has(errorClass),
    );

const shouldUseRecoveryGateForResume = (torrent: Torrent | TorrentDetail) => {
    if (!isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass)) {
        return false;
    }
    return (
        torrent.state === STATUS.torrent.PAUSED ||
        torrent.state === STATUS.torrent.ERROR ||
        torrent.state === STATUS.torrent.MISSING_FILES
    );
};

const clearClassificationOverrideIfPresent = (id?: string | number) => {
    if (id === undefined || id === null) return;
    if (getClassificationOverride(id) === undefined) return;
    setClassificationOverride(id, undefined);
};

type RecoveryQueueEntry = {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
    outcome: RecoveryOutcome;
    classification: MissingFilesClassification;
    fingerprint: string;
    promise: Promise<RecoveryGateOutcome>;
    resolve: (result: RecoveryGateOutcome) => void;
};

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
}

interface RecoverySessionState {
    session: RecoverySessionInfo | null;
    isBusy: boolean;
    lastOutcome: RecoveryOutcome | null;
    isDetailRecoveryBlocked: boolean;
}

interface RecoveryModalActions {
    close: () => void;
    retry: () => Promise<void>;
    autoRetry: () => Promise<void>;
    recreateFolder: () => Promise<void>;
    pickPath: (path: string) => Promise<void>;
}

interface InlineEditorControls {
    state: InlineSetLocationState | null;
    cancel: () => void;
    release: () => void;
    confirm: () => Promise<boolean>;
    change: (value: string) => void;
}

interface RecoveryActions {
    executeRedownload: (
        target: Torrent | TorrentDetail,
        options?: { recreateFolder?: boolean },
    ) => Promise<void>;
    executeRetryFetch: (target: Torrent | TorrentDetail) => Promise<void>;
    resumeTorrentWithRecovery: (
        torrent: Torrent | TorrentDetail,
    ) => Promise<void>;
    probeMissingFilesIfStale: (
        torrent: Torrent | TorrentDetail,
    ) => Promise<void>;
    handlePrepareDelete: (torrent: Torrent, deleteData?: boolean) => void;
    getRecoverySessionForKey: (
        torrentKey: string | null,
    ) => RecoverySessionInfo | null;
}

export interface RecoveryControllerResult {
    state: RecoverySessionState;
    modal: RecoveryModalActions;
    inlineEditor: InlineEditorControls;
    setLocation: {
        capability: SetLocationCapability;
        handler: (
            torrent: Torrent | TorrentDetail,
            options?: SetLocationOptions,
        ) => Promise<void>;
    };
    actions: RecoveryActions;
}

export function useRecoveryController({
    services,
    data,
    refresh,
    dispatch,
}: UseRecoveryControllerParams): RecoveryControllerResult {
    const { client } = services;

    const { canBrowse, supportsManual } = useUiModeCapabilities();
    const setLocationCapability = useMemo(
        () => ({ canBrowse, supportsManual }),
        [canBrowse, supportsManual],
    );
    const { engineCapabilities, reportCommandError } = useSession();
    const { showFeedback } = useActionFeedback();
    const { t } = useTranslation();
    const { torrents, detailData } = data;
    const {
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
        clearDetail,
        pendingDeletionHashesRef,
    } = refresh;

    const [recoverySession, setRecoverySession] =
        useState<RecoverySessionInfo | null>(null);
    const recoveryResolverRef = useRef<
        ((result: RecoveryGateOutcome) => void) | null
    >(null);
    const recoveryFingerprintRef = useRef<string | null>(null);
    const recoveryPromiseRef = useRef<Promise<RecoveryGateOutcome> | null>(
        null,
    );
    const recoveryAbortControllerRef = useRef<AbortController | null>(null);
    const pendingRecoveryQueueRef = useRef<Array<RecoveryQueueEntry>>([]);
    const volumeLossPollingRef = useRef(new Set<string>());
    const torrentsRef = useRef(torrents);
    const inlineOwnerRef = useRef<{
        surface: SetLocationSurface;
        torrentKey: string;
    } | null>(null);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    useEffect(() => {
        const activeIds: Array<string | number> = [];
        torrents.forEach((torrent) => {
            const torrentId = torrent.id;
            if (torrentId) {
                activeIds.push(torrentId);
            }
            const torrentHash = torrent.hash;
            if (torrentHash) {
                activeIds.push(torrentHash);
            }
        });
        if (detailData) {
            const detailId = detailData.id;
            if (detailId) {
                activeIds.push(detailId);
            }
            const detailHash = detailData.hash;
            if (detailHash) {
                activeIds.push(detailHash);
            }
        }
        pruneMissingFilesStore(activeIds);
    }, [detailData, torrents]);

    const runMissingFilesFlow = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: RecoverySequenceOptions,
            signal?: AbortSignal,
        ) => {
            const activeClient = client;
            const envelope = torrent.errorEnvelope;
            if (!activeClient || !envelope) return null;
            if (!isActionableRecoveryErrorClass(envelope.errorClass)) {
                const classificationKey = torrent.id ?? torrent.hash;
                clearClassificationOverrideIfPresent(classificationKey);
                return null;
            }

            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                {
                    torrentId: torrent.id ?? torrent.hash,
                    engineCapabilities,
                },
            );
            const classificationKey = torrent.id ?? torrent.hash;
            if (classificationKey) {
                setClassificationOverride(classificationKey, classification);
            }

            try {
                const missingBytes =
                    typeof torrent.leftUntilDone === "number"
                        ? torrent.leftUntilDone
                        : null;
                const id = torrent.id ?? torrent.hash;
                const cachedProbe = id ? getCachedProbe(id) : undefined;
                const isLocalExecution =
                    engineCapabilities.executionModel === "local";
                const isLocalEmpty =
                    isLocalExecution &&
                    cachedProbe?.kind === "data_missing" &&
                    cachedProbe.expectedBytes > 0 &&
                    cachedProbe.onDiskBytes === 0;
                const sequenceOptions: RecoverySequenceOptions = {
                    ...options,
                    missingBytes,
                    skipVerifyIfEmpty:
                        options?.skipVerifyIfEmpty ?? isLocalEmpty,
                    autoCreateMissingFolder:
                        options?.autoCreateMissingFolder ?? isLocalExecution,
                };
                if (signal) {
                    sequenceOptions.signal = signal;
                }
                return await runMissingFilesRecoverySequence({
                    client: activeClient,
                    torrent,
                    envelope,
                    classification,
                    engineCapabilities,
                    options: sequenceOptions,
                });
            } catch (err) {
                console.error("missing files recovery flow failed", err);
                throw err;
            }
        },
        [client, engineCapabilities],
    );

    const probeMissingFilesIfStale = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const activeClient = client;
            if (!activeClient) return;
            if (
                !isActionableRecoveryErrorClass(
                    torrent.errorEnvelope?.errorClass,
                )
            ) {
                return;
            }
            const id = torrent.id ?? torrent.hash;
            if (!id) return;

            const cached = getCachedProbe(id);
            if (cached && Date.now() - cached.ts < PROBE_TTL_MS) {
                return;
            }

            try {
                const probe = await probeMissingFiles(
                    torrent,
                    activeClient,
                    engineCapabilities,
                );
                setCachedProbe(id, probe);
            } catch (err) {
                console.error("probeMissingFiles failed", err);
            }
        },
        [client, engineCapabilities],
    );

    useEffect(() => {
        const runProbe = () => {
            const errored = torrentsRef.current.filter(
                (torrent) =>
                    isActionableRecoveryErrorClass(
                        torrent.errorEnvelope?.errorClass,
                    ),
            );
            errored.forEach((torrent) => {
                void probeMissingFilesIfStale(torrent);
            });
        };
        runProbe();
        const probeTask = scheduler.scheduleRecurringTask(
            runProbe,
            PROBE_RUN_INTERVAL_MS,
        );
        return () => probeTask.cancel();
    }, [probeMissingFilesIfStale]);

    useEffect(() => {
        torrents.forEach((torrent) => {
            if (torrent.state !== STATUS.torrent.CHECKING) {
                clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
            }
        });
    }, [torrents]);

    const startRecoverySession = useCallback((entry: RecoveryQueueEntry) => {
        recoveryAbortControllerRef.current?.abort();
        recoveryAbortControllerRef.current = new AbortController();
        setRecoverySession({
            torrent: entry.torrent,
            action: entry.action,
            outcome: entry.outcome,
            classification: entry.classification,
        });
        recoveryResolverRef.current = entry.resolve;
        recoveryFingerprintRef.current = entry.fingerprint;
        recoveryPromiseRef.current = entry.promise;
    }, []);

    const processNextRecoveryQueueEntry = useCallback(() => {
        if (recoverySession) return;
        const next = pendingRecoveryQueueRef.current.shift();
        if (!next) return;
        startRecoverySession(next);
    }, [recoverySession, startRecoverySession]);

    const createRecoveryQueueEntry = useCallback(
        (
            torrent: Torrent | TorrentDetail,
            action: RecoveryGateAction,
            outcome: RecoveryOutcome,
            classification: MissingFilesClassification,
            fingerprint: string,
        ): RecoveryQueueEntry => {
            let resolver: (result: RecoveryGateOutcome) => void = () => {};
            const promise = new Promise<RecoveryGateOutcome>((resolve) => {
                resolver = resolve;
            });
            return {
                torrent,
                action,
                outcome,
                classification,
                fingerprint,
                promise,
                resolve: resolver,
            };
        },
        [],
    );

    const enqueueRecoveryEntry = useCallback(
        (entry: ReturnType<typeof createRecoveryQueueEntry>) => {
            if (!recoverySession) {
                startRecoverySession(entry);
                return entry.promise;
            }
            const duplicate = pendingRecoveryQueueRef.current.find(
                (pending) => pending.fingerprint === entry.fingerprint,
            );
            if (duplicate) {
                return duplicate.promise;
            }
            pendingRecoveryQueueRef.current.push(entry);
            return entry.promise;
        },
        [recoverySession, startRecoverySession],
    );

    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options }) => {
            const envelope = torrent.errorEnvelope;
            if (!envelope) return null;
            if (action === "setLocation") return null;
            if (!isActionableRecoveryErrorClass(envelope.errorClass)) {
                const key = torrent.id ?? torrent.hash;
                clearClassificationOverrideIfPresent(key);
                return null;
            }

            const downloadDir = torrent.savePath ?? torrent.downloadDir ?? "";
            const fallbackClassification = classifyMissingFilesState(
                envelope,
                downloadDir,
                {
                    torrentId: torrent.id ?? torrent.hash,
                    engineCapabilities,
                },
            );
            let flowClassification: MissingFilesClassification =
                fallbackClassification;

            let blockingOutcome: RecoveryOutcome | null = null;
            try {
                const flowResult = await runMissingFilesFlow(
                    torrent,
                    options,
                    recoveryAbortControllerRef.current?.signal,
                );
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

            if (!blockingOutcome) return null;
            if (action === "recheck") {
                return {
                    status: "handled",
                    blockingOutcome,
                };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            if (recoveryFingerprintRef.current === fingerprint) {
                return recoveryPromiseRef.current ?? null;
            }
            const entry = createRecoveryQueueEntry(
                torrent,
                action,
                blockingOutcome,
                flowClassification,
                fingerprint,
            );
            return enqueueRecoveryEntry(entry);
        },
        [
            runMissingFilesFlow,
            createRecoveryQueueEntry,
            enqueueRecoveryEntry,
            engineCapabilities,
        ],
    );

    const finalizeRecovery = useCallback(
        (result: RecoveryGateOutcome) => {
            recoveryAbortControllerRef.current?.abort();
            recoveryAbortControllerRef.current = null;
            const resolver = recoveryResolverRef.current;
            recoveryResolverRef.current = null;
            recoveryFingerprintRef.current = null;
            recoveryPromiseRef.current = null;
            setRecoverySession(null);
            resolver?.(result);
            processNextRecoveryQueueEntry();
        },
        [processNextRecoveryQueueEntry],
    );

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        recoveryAbortControllerRef.current?.abort();
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    const refreshAfterRecovery = useCallback(
        async (target: Torrent | TorrentDetail) => {
            await refreshTorrents?.();
            await refreshSessionStatsData?.();
            if (detailData?.id === target.id) {
                await refreshDetailData();
            }
        },
        [
            refreshDetailData,
            refreshSessionStatsData,
            refreshTorrents,
            detailData,
        ],
    );

    const resolveRecoverySession = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: RecoverySequenceOptions & {
                delayAfterSuccessMs?: number;
                notifyDriveDetected?: boolean;
            },
        ) => {
            try {
                const {
                    delayAfterSuccessMs,
                    notifyDriveDetected,
                    ...sequenceOptions
                } = options ?? {};
                const flowResult = await runMissingFilesFlow(
                    torrent,
                    sequenceOptions,
                    recoveryAbortControllerRef.current?.signal,
                );
                if (!flowResult) return false;
                if (flowResult.status === "resolved") {
                    const targetKey = torrent.id ?? torrent.hash ?? "";
                    clearVerifyGuardEntry(getRecoveryFingerprint(torrent));
                    if (targetKey) {
                        clearCachedProbe(targetKey);
                    }
                    try {
                        await refreshAfterRecovery(torrent);
                    } catch (err) {
                        console.error("refresh after recovery failed", err);
                    }
                    if (notifyDriveDetected) {
                        showFeedback(
                            t("recovery.toast_drive_detected"),
                            "info",
                        );
                    }
                    const feedbackKey =
                        flowResult.log === "all_verified_resuming"
                            ? "recovery.feedback.all_verified_resuming"
                            : "recovery.feedback.download_resumed";
                    showFeedback(t(feedbackKey), "info");
                    if (delayAfterSuccessMs && delayAfterSuccessMs > 0) {
                        await delay(delayAfterSuccessMs);
                    }
                    finalizeRecovery({ status: "handled" });
                    return true;
                }
                if (flowResult.status === "needsModal") {
                    const outcome = flowResult.blockingOutcome;
                    if (outcome) {
                        setRecoverySession((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      outcome,
                                  }
                                : prev,
                        );
                    }
                }
                return false;
            } catch (err) {
                console.error(
                    "recovery resolution failed for recreate/pick-path",
                    err,
                );
                return false;
            }
        },
        [
            runMissingFilesFlow,
            refreshAfterRecovery,
            showFeedback,
            t,
            finalizeRecovery,
        ],
    );

    useEffect(() => {
        torrents.forEach((torrent) => {
            const id = torrent.id ?? torrent.hash;
            if (!id) return;
            if (
                isActionableRecoveryErrorClass(
                    torrent.errorEnvelope?.errorClass,
                )
            ) {
                return;
            }
            clearClassificationOverrideIfPresent(id);
        });
    }, [torrents]);

    useEffect(() => {
        if (engineCapabilities.executionModel !== "local") return;
        const task = scheduler.scheduleRecurringTask(() => {
            const currentTorrents = torrentsRef.current;
            if (
                !client ||
                !engineCapabilities.canCheckFreeSpace ||
                !currentTorrents.length
            ) {
                return;
            }
            currentTorrents.forEach((torrent) => {
                const id = torrent.id ?? torrent.hash;
                if (!id) return;
                if (volumeLossPollingRef.current.has(id)) return;
                if (
                    recoverySession &&
                    getRecoveryFingerprint(recoverySession.torrent) ===
                        getRecoveryFingerprint(torrent)
                ) {
                    return;
                }
                const downloadDir =
                    torrent.savePath ?? torrent.downloadDir ?? torrent.savePath;
                const classification = classifyMissingFilesState(
                    torrent.errorEnvelope ?? null,
                    downloadDir,
                    {
                        torrentId: id,
                        engineCapabilities,
                    },
                );
                if (classification.kind !== "volumeLoss") return;
                if (!downloadDir) return;
                volumeLossPollingRef.current.add(id);
                void pollPathAvailability(client, downloadDir).then((probe) => {
                    volumeLossPollingRef.current.delete(id);
                    if (probe.success && torrent.errorEnvelope) {
                        void resolveRecoverySession(torrent, {
                            notifyDriveDetected: true,
                        });
                    }
                });
            });
        }, VOLUME_LOSS_CHECK_INTERVAL_MS);
        return () => task.cancel();
    }, [
        client,
        recoverySession,
        resolveRecoverySession,
        engineCapabilities,
        engineCapabilities.executionModel,
        engineCapabilities.canCheckFreeSpace,
    ]);

    const waitForActiveState = useCallback(
        async (torrentId: string, timeoutMs = 1000) => {
            if (!client || !client.getTorrentDetails) {
                return true;
            }
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                try {
                    const detail = await client.getTorrentDetails(torrentId);
                    if (detail && isRecoveryActiveState(detail.state)) {
                        return true;
                    }
                } catch {
                    // best-effort; keep polling
                }
                await delay(200);
            }
            return false;
        },
        [client],
    );

    const resumeTorrentWithRecovery = useCallback(
        async (torrent: Torrent | TorrentDetail) => {
            const id = torrent.id ?? torrent.hash;
            if (!id) return;
            if (shouldUseRecoveryGateForResume(torrent)) {
                const gateResult = await requestRecovery({
                    torrent,
                    action: "resume",
                });
                if (gateResult?.status === "handled") {
                    try {
                        await refreshAfterRecovery(torrent);
                    } catch (err) {
                        console.error("refresh after recovery failed", err);
                    }
                    const resumed = await waitForActiveState(id);
                    const isAllVerified =
                        gateResult.log === "all_verified_resuming";
                    const toastKey = isAllVerified
                        ? "recovery.feedback.all_verified_resuming"
                        : resumed
                          ? "recovery.feedback.download_resumed"
                          : "recovery.feedback.resume_queued";
                    const tone: FeedbackTone =
                        isAllVerified || resumed ? "info" : "warning";
                    showFeedback(t(toastKey), tone);
                    return;
                }
            if (gateResult?.status === "continue") {
                const outcome = await dispatch(
                    TorrentIntents.ensureActive(id),
                );
                if (outcome.status !== "applied") return;
                return;
            }
            if (!gateResult) {
                const outcome = await dispatch(
                    TorrentIntents.ensureActive(id),
                );
                if (outcome.status !== "applied") return;
                return;
            }
            return;
        }
        const outcome = await dispatch(TorrentIntents.ensureActive(id));
        if (outcome.status !== "applied") return;
    },
        [
            dispatch,
            requestRecovery,
            refreshAfterRecovery,
            showFeedback,
            t,
            waitForActiveState,
        ],
    );

    const redownloadInFlight = useRef<Set<string>>(new Set());

    const executeRedownload = useCallback(
        async (
            target: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean },
        ) => {
            const key = getRecoveryFingerprint(target);
            if (redownloadInFlight.current.has(key)) return;

            redownloadInFlight.current.add(key);
            try {
                const gateResult = await requestRecovery({
                    torrent: target,
                    action: "redownload",
                    options,
                });
                if (gateResult && gateResult.status !== "continue") {
                    if (gateResult.status === "handled") {
                        clearCachedProbe(target.id ?? target.hash ?? "");
                        await refreshAfterRecovery(target);
                        showFeedback(
                            t("recovery.feedback.download_resumed"),
                            "info",
                        );
                    }
                    return;
                }
            } catch (err) {
                reportCommandError?.(err);
            } finally {
                redownloadInFlight.current.delete(key);
            }
        },
        [
            requestRecovery,
            refreshAfterRecovery,
            showFeedback,
            t,
            reportCommandError,
        ],
    );

    const executeRetryFetch = useCallback(
        async (target: Torrent | TorrentDetail) => {
            const activeClient = client;
            if (!activeClient) return;
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
                console.error("refresh after retry probe failed", err);
            }

            if (gateResult && gateResult.status !== "continue") {
                showFeedback(t("recovery.feedback.retry_failed"), "warning");
            }
        },
        [client, requestRecovery, refreshAfterRecovery, showFeedback, t],
    );

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeRetryFetch(recoverySession.torrent);
        handleRecoveryClose();
    }, [executeRetryFetch, recoverySession, handleRecoveryClose]);

    const handleRecoveryAutoRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await resolveRecoverySession(recoverySession.torrent, {
            notifyDriveDetected: true,
        });
    }, [recoverySession, resolveRecoverySession]);

    const handleRecoveryRecreateFolder = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await resolveRecoverySession(recoverySession.torrent, {
            recreateFolder: true,
        });
    }, [recoverySession, resolveRecoverySession]);

    const recoveryRequestBrowse = useCallback(
        async (currentPath?: string | null) => {
            if (!setLocationCapability.canBrowse) return null;
            try {
                return (
                    (await shellAgent.browseDirectory(
                        currentPath ?? undefined,
                    )) ?? null
                );
            } catch {
                return null;
            }
        },
        [setLocationCapability.canBrowse, shellAgent],
    );

    const handleRecoveryPickPath = useCallback(
        async (path: string) => {
            if (!recoverySession?.torrent) return;
            const outcome = await dispatch(
                TorrentIntents.ensureAtLocation(
                    recoverySession.torrent.id ?? recoverySession.torrent.hash,
                    path,
                ),
            );
            if (outcome.status !== "applied") return;
            const updatedTorrent: Torrent | TorrentDetail = {
                ...recoverySession.torrent,
                downloadDir: path,
                savePath: path,
            };
            await resolveRecoverySession(updatedTorrent, {
                delayAfterSuccessMs: PICK_PATH_SUCCESS_DELAY_MS,
            });
        },
        [dispatch, recoverySession, resolveRecoverySession],
    );

    const setLocationAndRecover = useCallback(
        async (torrent: Torrent | TorrentDetail, path: string) => {
            const updatedTorrent: Torrent | TorrentDetail = {
                ...torrent,
                downloadDir: path,
                savePath: path,
            };
            await resumeTorrentWithRecovery(updatedTorrent);
        },
        [resumeTorrentWithRecovery],
    );

    type ManualEditorState = InlineSetLocationState;
    type ManualEditorAction =
        | {
              type: "open";
              payload: {
                  surface: SetLocationSurface;
                  torrentKey: string;
                  draft: string;
                  intentId: number;
              };
          }
        | { type: "update"; payload: { draft: string } }
        | { type: "submitting" }
        | { type: "verifying"; payload: { fingerprint: string } }
        | { type: "error"; payload: { message: string } }
        | { type: "close" }
        | { type: "set"; payload: ManualEditorState | null };

    const manualEditorReducer = (
        state: ManualEditorState | null,
        action: ManualEditorAction,
    ): ManualEditorState | null => {
        if (!state && action.type !== "open") {
            return state;
        }
        switch (action.type) {
            case "open":
                return {
                    surface: action.payload.surface,
                    torrentKey: action.payload.torrentKey,
                    initialPath: action.payload.draft,
                    inputPath: action.payload.draft,
                    status: "idle",
                    intentId: action.payload.intentId,
                    awaitingRecoveryFingerprint: null,
                    error: undefined,
                };
            case "update":
                return {
                    ...state!,
                    inputPath: action.payload.draft,
                    error: undefined,
                };
            case "submitting":
                return {
                    ...state!,
                    status: "submitting",
                    error: undefined,
                };
            case "verifying":
                return {
                    ...state!,
                    status: "verifying",
                    awaitingRecoveryFingerprint: action.payload.fingerprint,
                    error: undefined,
                };
            case "error":
                return {
                    ...state!,
                    status: "idle",
                    error: action.payload.message,
                    awaitingRecoveryFingerprint: null,
                };
            case "close":
                return null;
            case "set":
                return action.payload;
            default:
                return state;
        }
    };

    const inlineSetLocationStateRef = useRef<ManualEditorState | null>(null);
    const inlineDraftsRef = useRef(new Map<string, string>());
    const inlineIntentCounterRef = useRef(0);
    const [inlineSetLocationState, dispatchInlineSetLocation] = useReducer(
        manualEditorReducer,
        null,
    );

    const setInlineSetLocationState = useCallback(
        (value: ManualEditorState | null) => {
            dispatchInlineSetLocation({
                type: "set",
                payload: value,
            });
        },
        [],
    );

    useEffect(() => {
        inlineSetLocationStateRef.current = inlineSetLocationState;
    }, [inlineSetLocationState]);

    const closeManualEditor = useCallback(() => {
        dispatchInlineSetLocation({ type: "close" });
    }, []);

    /* Inline manual editor helpers removed — not referenced elsewhere. */

    useEffect(() => {
        if (
            !inlineSetLocationState ||
            inlineSetLocationState.status !== "verifying"
        )
            return;
        const torrentKey = inlineSetLocationState.torrentKey;
        if (!recoverySession) {
            closeManualEditor();
            return;
        }
        const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
        if (sessionKey !== torrentKey) {
            return;
        }
    }, [inlineSetLocationState, recoverySession, closeManualEditor]);

    const getDraftPathForTorrent = useCallback(
        (key: string | null, fallback: string): string => {
            if (!key) return fallback;
            return inlineDraftsRef.current.get(key) ?? fallback;
        },
        [],
    );

    const saveDraftForTorrent = useCallback(
        (key: string | null, path: string) => {
            if (!key) return;
            inlineDraftsRef.current.set(key, path);
        },
        [],
    );

    const clearDraftForTorrent = useCallback((key: string | null) => {
        if (!key) return;
        inlineDraftsRef.current.delete(key);
    }, []);

    const getTorrentByKey = useCallback(
        (key: string | null) => {
            if (!key) return null;
            const found =
                torrents.find(
                    (torrent) => getRecoveryFingerprint(torrent) === key,
                ) ?? null;
            if (found) return found;
            if (detailData && getRecoveryFingerprint(detailData) === key) {
                return detailData;
            }
            return null;
        },
        [detailData, torrents],
    );

    useEffect(() => {
        const validKeys = new Set<string>();
        torrents.forEach((torrent) => {
            const key = getRecoveryFingerprint(torrent);
            if (key) validKeys.add(key);
        });
        if (detailData) {
            const detailKey = getRecoveryFingerprint(detailData);
            if (detailKey) validKeys.add(detailKey);
        }
        inlineDraftsRef.current.forEach((_, key) => {
            if (!validKeys.has(key)) {
                inlineDraftsRef.current.delete(key);
            }
        });
    }, [detailData, torrents]);

    const openInlineSetLocationState = useCallback(
        (state: Omit<InlineSetLocationState, "intentId">) => {
            const torrentKey = state.torrentKey || null;
            const resolvedPath = getDraftPathForTorrent(
                torrentKey,
                state.inputPath,
            );
            inlineIntentCounterRef.current += 1;
            const next: InlineSetLocationState = {
                ...state,
                inputPath: resolvedPath,
                initialPath: state.initialPath ?? state.inputPath,
                intentId: inlineIntentCounterRef.current,
                awaitingRecoveryFingerprint: null,
            };
            if (torrentKey) {
                inlineDraftsRef.current.set(torrentKey, resolvedPath);
            }
            inlineSetLocationStateRef.current = next;
            setInlineSetLocationState(next);
            return next;
        },
        [getDraftPathForTorrent, setInlineSetLocationState],
    );

    const patchInlineSetLocationState = useCallback(
        (patch: Partial<Omit<InlineSetLocationState, "intentId">>) => {
            const current = inlineSetLocationStateRef.current;
            if (!current) return;
            const next = { ...current, ...patch };
            inlineSetLocationStateRef.current = next;
            setInlineSetLocationState(next);
            return next;
        },
        [setInlineSetLocationState],
    );

    const cancelInlineSetLocation = useCallback(() => {
        inlineSetLocationStateRef.current = null;
        setInlineSetLocationState(null);
    }, [setInlineSetLocationState]);

    const confirmInlineSetLocation = useCallback(async (): Promise<boolean> => {
        const current = inlineSetLocationStateRef.current;
        if (!current) return false;
        const intentId = current.intentId;
        const trimmed = current.inputPath.trim();
        if (!trimmed) {
            patchInlineSetLocationState({
                error: t("directory_browser.validation_required"),
            });
            return false;
        }
        const torrentKey = current.torrentKey || null;
        const targetTorrent = getTorrentByKey(torrentKey);
        if (!targetTorrent) {
            patchInlineSetLocationState({
                error: t("recovery.errors.missing_client_or_detail"),
            });
            return false;
        }
        patchInlineSetLocationState({
            status: "submitting",
            error: undefined,
            inputPath: trimmed,
        });
        saveDraftForTorrent(torrentKey, trimmed);
        if (inlineSetLocationStateRef.current?.intentId !== intentId) {
            return false;
        }
        try {
            await setLocationAndRecover(targetTorrent, trimmed);
            clearDraftForTorrent(torrentKey);
            if (inlineSetLocationStateRef.current?.intentId !== intentId) {
                return true;
            }
            const fingerprint = getRecoveryFingerprint(targetTorrent);
            patchInlineSetLocationState({
                status: "verifying",
                awaitingRecoveryFingerprint: fingerprint,
                error: undefined,
            });
            return true;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            if (inlineSetLocationStateRef.current?.intentId === intentId) {
                patchInlineSetLocationState({
                    status: "idle",
                    error: message,
                    awaitingRecoveryFingerprint: null,
                });
            }
            return false;
        }
    }, [
        patchInlineSetLocationState,
        saveDraftForTorrent,
        setLocationAndRecover,
        t,
        getTorrentByKey,
        clearDraftForTorrent,
    ]);

    const handleInlineLocationChange = useCallback(
        (value: string) => {
            const currentKey = inlineSetLocationStateRef.current?.torrentKey;
            if (currentKey) {
                saveDraftForTorrent(currentKey, value);
            }
            patchInlineSetLocationState({
                inputPath: value,
                error: undefined,
            });
        },
        [patchInlineSetLocationState, saveDraftForTorrent],
    );

    const releaseInlineSetLocation = useCallback(() => {
        inlineOwnerRef.current = null;
        const current = inlineSetLocationStateRef.current;
        inlineSetLocationStateRef.current = null;
        setInlineSetLocationState(null);
        if (current) {
            clearDraftForTorrent(current.torrentKey);
        }
    }, [clearDraftForTorrent, setInlineSetLocationState]);

    const isInlineOwner = useCallback(
        (surface: SetLocationSurface, torrentKey: string) => {
            const owner = inlineOwnerRef.current;
            if (!owner) return false;
            return owner.surface === surface && owner.torrentKey === torrentKey;
        },
        [],
    );

    const tryAcquireInlineOwner = useCallback(
        (surface: SetLocationSurface, torrentKey: string) => {
            const owner = inlineOwnerRef.current;
            if (!owner) {
                inlineOwnerRef.current = { surface, torrentKey };
                return "acquired" as const;
            }
            if (isInlineOwner(surface, torrentKey)) {
                return "already-owned" as const;
            }
            return "conflict" as const;
        },
        [isInlineOwner],
    );

    const openManualEditorForTorrent = useCallback(
        (surface: SetLocationSurface, torrentKey: string, basePath: string) => {
            if (!torrentKey) return;
            const acquisition = tryAcquireInlineOwner(surface, torrentKey);
            if (acquisition === "conflict" || acquisition === "already-owned") {
                return;
            }
            releaseInlineSetLocation();
            openInlineSetLocationState({
                surface,
                torrentKey,
                initialPath: basePath,
                inputPath: basePath,
                status: "idle",
            });
        },
        [
            releaseInlineSetLocation,
            openInlineSetLocationState,
            tryAcquireInlineOwner,
        ],
    );

    /* releaseInlineOwner removed — inline owner released via other helpers */

    useEffect(() => {
        const current = inlineSetLocationStateRef.current;
        if (!current) return;
        clearDraftForTorrent(current.torrentKey);
        releaseInlineSetLocation();
    }, [
        setLocationCapability.canBrowse,
        clearDraftForTorrent,
        releaseInlineSetLocation,
    ]);

    const handleSetLocation = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: SetLocationOptions,
        ): Promise<void> => {
            const surface = options?.surface ?? "general-tab";
            const basePath = resolveTorrentPath(torrent);
            const torrentKey = getRecoveryFingerprint(torrent);
            const requestedManual = options?.mode === "manual";
            if (
                !requestedManual &&
                setLocationCapability.canBrowse &&
                recoveryRequestBrowse
            ) {
                const pickedPath = await recoveryRequestBrowse(
                    basePath || undefined,
                );
                if (pickedPath) {
                    await setLocationAndRecover(torrent, pickedPath);
                    return;
                }
            }
            if (setLocationCapability.supportsManual) {
                openManualEditorForTorrent(surface, torrentKey, basePath);
            }
        },
        [
            recoveryRequestBrowse,
            setLocationAndRecover,
            setLocationCapability,
            openManualEditorForTorrent,
        ],
    );

    useEffect(() => {
        const current = inlineSetLocationState;
        if (!current || current.status !== "verifying") return;
        const torrentKey = current.torrentKey;
        if (!recoverySession) {
            clearDraftForTorrent(torrentKey);
            cancelInlineSetLocation();
            return;
        }
        const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
        if (sessionKey !== torrentKey) {
            return;
        }
    }, [
        cancelInlineSetLocation,
        clearDraftForTorrent,
        inlineSetLocationState,
        recoverySession,
    ]);

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
            const fingerprint = getRecoveryFingerprint(torrent);
            clearVerifyGuardEntry(fingerprint);
            clearCachedProbe(key);
            if (targetId) {
                volumeLossPollingRef.current.delete(targetId);
            }
            pendingRecoveryQueueRef.current =
                pendingRecoveryQueueRef.current.filter(
                    (entry) => entry.fingerprint !== fingerprint,
                );
            if (
                recoverySession &&
                getRecoveryFingerprint(recoverySession.torrent) === fingerprint
            ) {
                finalizeRecovery({ status: "cancelled" });
            }
        },
        [
            clearDetail,
            detailData,
            finalizeRecovery,
            recoverySession,
            pendingDeletionHashesRef,
        ],
    );

    const isDetailRecoveryBlocked = useMemo(() => {
        if (!detailData || !recoverySession) return false;
        return (
            getRecoveryFingerprint(detailData) ===
            getRecoveryFingerprint(recoverySession.torrent)
        );
    }, [detailData, recoverySession]);

    const getRecoverySessionForKey = useCallback(
        (torrentKey: string | null) => {
            if (!torrentKey || !recoverySession) return null;
            const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
            if (!sessionKey) return null;
            return sessionKey === torrentKey ? recoverySession : null;
        },
        [recoverySession],
    );

    return {
        state: {
            session: recoverySession,
            isBusy: Boolean(recoverySession),
            lastOutcome: null,
            isDetailRecoveryBlocked,
        },
        modal: {
            close: handleRecoveryClose,
            retry: handleRecoveryRetry,
            autoRetry: handleRecoveryAutoRetry,
            recreateFolder: handleRecoveryRecreateFolder,
            pickPath: handleRecoveryPickPath,
        },
        inlineEditor: {
            state: inlineSetLocationState,
            cancel: cancelInlineSetLocation,
            release: releaseInlineSetLocation,
            confirm: confirmInlineSetLocation,
            change: handleInlineLocationChange,
        },
        setLocation: {
            capability: setLocationCapability,
            handler: handleSetLocation,
        },
        actions: {
            executeRedownload,
            executeRetryFetch,
            resumeTorrentWithRecovery,
            probeMissingFilesIfStale,
            handlePrepareDelete,
            getRecoverySessionForKey,
        },
    };
}

export default useRecoveryController;

