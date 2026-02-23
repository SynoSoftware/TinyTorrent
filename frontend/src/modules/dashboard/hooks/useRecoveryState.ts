import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { RecoverySessionInfo } from "@/app/context/RecoveryContext";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import { scheduler } from "@/app/services/scheduler";
import type { RecoveryGateAction, RecoveryGateOutcome } from "@/app/types/recoveryGate";
import type {
    MissingFilesClassification,
    RecoveryOutcome,
} from "@/services/recovery/recovery-controller";
import { pruneMissingFilesStore } from "@/services/recovery/missingFilesStore";
import {
    isRecoveryActiveState,
} from "@/modules/dashboard/hooks/useRecoveryController.shared";
import type {
    RecoveryQueueEntry,
    RecoveryQueueSummary,
    RecoverySessionViewState,
} from "@/modules/dashboard/hooks/useRecoveryController.types";

interface UseRecoveryStateParams {
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
}

export type RecoveryPauseOrigin = "user" | "recovery";

export interface UseRecoveryStateResult {
    state: RecoverySessionViewState;
    recoverySession: RecoverySessionInfo | null;
    withRecoveryBusy: <T>(action: () => Promise<T>) => Promise<T>;
    getActiveRecoverySignal: () => AbortSignal | undefined;
    hasActiveRecoveryRequest: () => boolean;
    abortActiveRecoveryRequest: () => void;
    getActiveRecoveryPromiseForFingerprint: (
        fingerprint: string,
    ) => Promise<RecoveryGateOutcome> | null;
    setRecoverySessionOutcome: (
        outcome: RecoveryOutcome,
        autoCloseAtMs?: number,
        requiresDecision?: boolean,
    ) => void;
    scheduleRecoveryFinalize: (
        delayMs: number,
        result: RecoveryGateOutcome,
        sessionOutcome: RecoveryOutcome,
    ) => boolean;
    createRecoveryQueueEntry: (
        torrent: Torrent | TorrentDetail,
        action: RecoveryGateAction,
        outcome: RecoveryOutcome,
        classification: MissingFilesClassification,
        fingerprint: string,
        requiresDecision?: boolean,
    ) => RecoveryQueueEntry;
    enqueueRecoveryEntry: (
        entry: RecoveryQueueEntry,
    ) => Promise<RecoveryGateOutcome>;
    finalizeRecovery: (result: RecoveryGateOutcome) => void;
    cancelPendingRecoveryQueue: (result?: RecoveryGateOutcome) => void;
    cancelRecoveryForFingerprint: (
        fingerprint: string,
        result?: RecoveryGateOutcome,
    ) => void;
    isRecoverySessionActive: (fingerprint: string) => boolean;
    markRecoveryPausedBySystem: (fingerprint: string) => void;
    markRecoveryPausedByUser: (fingerprint: string) => void;
    markRecoveryCancelled: (fingerprint: string) => void;
    markRecoveryResumed: (fingerprint: string) => void;
    getRecoveryPauseOrigin: (fingerprint: string) => RecoveryPauseOrigin | null;
    isRecoveryCancelled: (fingerprint: string) => boolean;
    isBackgroundRecoveryEligible: (fingerprint: string) => boolean;
    torrentsRef: MutableRefObject<Array<Torrent | TorrentDetail>>;
    silentVolumeRecoveryInFlightRef: MutableRefObject<Set<string>>;
    silentVolumeRecoveryNextRetryAtRef: MutableRefObject<Map<string, number>>;
    silentVolumeRecoveryAttemptCountRef: MutableRefObject<Map<string, number>>;
}

export function useRecoveryState({
    torrents,
    detailData,
}: UseRecoveryStateParams): UseRecoveryStateResult {
    const [recoverySession, setRecoverySession] =
        useState<RecoverySessionInfo | null>(null);
    const busyCountRef = useRef(0);
    const [isRecoveryBusy, setIsRecoveryBusy] = useState(false);
    const recoveryResolverRef = useRef<
        ((result: RecoveryGateOutcome) => void) | null
    >(null);
    const recoveryFingerprintRef = useRef<string | null>(null);
    const recoveryPromiseRef = useRef<Promise<RecoveryGateOutcome> | null>(
        null,
    );
    const recoveryAutoCloseCancelRef = useRef<(() => void) | null>(null);
    const recoveryAbortControllerRef = useRef<AbortController | null>(null);
    const pendingRecoveryQueueRef = useRef<Array<RecoveryQueueEntry>>([]);
    const [queuedItems, setQueuedItems] = useState<RecoveryQueueSummary[]>([]);
    const torrentsRef = useRef(torrents);
    const recoveryPauseOriginByFingerprintRef = useRef<
        Map<string, RecoveryPauseOrigin>
    >(new Map());
    const recoveryCancelledFingerprintsRef = useRef<Set<string>>(new Set());
    const silentVolumeRecoveryInFlightRef = useRef<Set<string>>(new Set());
    const silentVolumeRecoveryNextRetryAtRef = useRef<Map<string, number>>(
        new Map(),
    );
    const silentVolumeRecoveryAttemptCountRef = useRef<Map<string, number>>(
        new Map(),
    );

    const summarizeQueueEntry = useCallback(
        (entry: RecoveryQueueEntry): RecoveryQueueSummary => {
            const fallbackPath = resolveTorrentPath(entry.torrent);
            const locationLabel =
                (entry.classification.kind === "volumeLoss"
                    ? entry.classification.root
                    : entry.classification.path) ??
                fallbackPath ??
                "";
            return {
                fingerprint: entry.fingerprint,
                torrentName: entry.torrent.name,
                kind: entry.classification.kind,
                locationLabel,
            };
        },
        [],
    );

    const syncQueuedItems = useCallback(() => {
        setQueuedItems(
            pendingRecoveryQueueRef.current.map((entry) =>
                summarizeQueueEntry(entry),
            ),
        );
    }, [summarizeQueueEntry]);

    useEffect(() => {
        syncQueuedItems();
    }, [syncQueuedItems]);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    const clearCooldownTrackingForFingerprint = useCallback(
        (fingerprint: string) => {
            if (!fingerprint) {
                return;
            }
            silentVolumeRecoveryNextRetryAtRef.current.delete(fingerprint);
            silentVolumeRecoveryAttemptCountRef.current.delete(fingerprint);
            silentVolumeRecoveryInFlightRef.current.delete(fingerprint);
        },
        [
            silentVolumeRecoveryAttemptCountRef,
            silentVolumeRecoveryInFlightRef,
            silentVolumeRecoveryNextRetryAtRef,
        ],
    );

    const markRecoveryPausedBySystem = useCallback((fingerprint: string) => {
        if (!fingerprint) {
            return;
        }
        recoveryPauseOriginByFingerprintRef.current.set(fingerprint, "recovery");
        recoveryCancelledFingerprintsRef.current.delete(fingerprint);
    }, []);

    const markRecoveryPausedByUser = useCallback(
        (fingerprint: string) => {
            if (!fingerprint) {
                return;
            }
            recoveryPauseOriginByFingerprintRef.current.set(fingerprint, "user");
            recoveryCancelledFingerprintsRef.current.add(fingerprint);
            clearCooldownTrackingForFingerprint(fingerprint);
        },
        [clearCooldownTrackingForFingerprint],
    );

    const markRecoveryCancelled = useCallback(
        (fingerprint: string) => {
            if (!fingerprint) {
                return;
            }
            recoveryPauseOriginByFingerprintRef.current.delete(fingerprint);
            recoveryCancelledFingerprintsRef.current.add(fingerprint);
            clearCooldownTrackingForFingerprint(fingerprint);
        },
        [clearCooldownTrackingForFingerprint],
    );

    const markRecoveryResumed = useCallback(
        (fingerprint: string) => {
            if (!fingerprint) {
                return;
            }
            recoveryPauseOriginByFingerprintRef.current.delete(fingerprint);
            recoveryCancelledFingerprintsRef.current.delete(fingerprint);
            clearCooldownTrackingForFingerprint(fingerprint);
        },
        [clearCooldownTrackingForFingerprint],
    );

    const getRecoveryPauseOrigin = useCallback(
        (fingerprint: string): RecoveryPauseOrigin | null => {
            if (!fingerprint) {
                return null;
            }
            return (
                recoveryPauseOriginByFingerprintRef.current.get(fingerprint) ??
                null
            );
        },
        [],
    );

    const isRecoveryCancelled = useCallback((fingerprint: string): boolean => {
        if (!fingerprint) {
            return false;
        }
        return recoveryCancelledFingerprintsRef.current.has(fingerprint);
    }, []);

    const isBackgroundRecoveryEligible = useCallback(
        (fingerprint: string): boolean => {
            if (!fingerprint) {
                return false;
            }
            return (
                recoveryPauseOriginByFingerprintRef.current.get(fingerprint) ===
                    "recovery" &&
                !recoveryCancelledFingerprintsRef.current.has(fingerprint)
            );
        },
        [],
    );

    const withRecoveryBusy = useCallback(
        async <T,>(action: () => Promise<T>) => {
            busyCountRef.current += 1;
            if (busyCountRef.current === 1) {
                setIsRecoveryBusy(true);
            }
            try {
                return await action();
            } finally {
                busyCountRef.current = Math.max(0, busyCountRef.current - 1);
                if (busyCountRef.current === 0) {
                    setIsRecoveryBusy(false);
                }
            }
        },
        [],
    );

    const clearRecoveryAutoCloseTimer = useCallback(() => {
        recoveryAutoCloseCancelRef.current?.();
        recoveryAutoCloseCancelRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            clearRecoveryAutoCloseTimer();
        };
    }, [clearRecoveryAutoCloseTimer]);

    useEffect(() => {
        const presentFingerprints = new Set<string>();
        const reconcileRecoveryOwnership = (torrent: Torrent | TorrentDetail) => {
            const fingerprint = getRecoveryFingerprint(torrent);
            if (!fingerprint) return;
            presentFingerprints.add(fingerprint);
            // Active engine states take precedence over stale recovery metadata.
            // Once active, recovery pause ownership must be cleared.
            if (isRecoveryActiveState(torrent.state)) {
                markRecoveryResumed(fingerprint);
            }
        };

        torrents.forEach((torrent) => {
            reconcileRecoveryOwnership(torrent);
        });

        if (detailData) {
            reconcileRecoveryOwnership(detailData);
        }

        recoveryPauseOriginByFingerprintRef.current.forEach((_, fingerprint) => {
            if (!presentFingerprints.has(fingerprint)) {
                recoveryPauseOriginByFingerprintRef.current.delete(fingerprint);
            }
        });
        recoveryCancelledFingerprintsRef.current.forEach((fingerprint) => {
            if (!presentFingerprints.has(fingerprint)) {
                recoveryCancelledFingerprintsRef.current.delete(fingerprint);
            }
        });
        silentVolumeRecoveryNextRetryAtRef.current.forEach((_, fingerprint) => {
            if (!presentFingerprints.has(fingerprint)) {
                silentVolumeRecoveryNextRetryAtRef.current.delete(fingerprint);
            }
        });
        silentVolumeRecoveryAttemptCountRef.current.forEach((_, fingerprint) => {
            if (!presentFingerprints.has(fingerprint)) {
                silentVolumeRecoveryAttemptCountRef.current.delete(fingerprint);
            }
        });
        silentVolumeRecoveryInFlightRef.current.forEach((fingerprint) => {
            if (!presentFingerprints.has(fingerprint)) {
                silentVolumeRecoveryInFlightRef.current.delete(fingerprint);
            }
        });
    }, [
        detailData,
        markRecoveryResumed,
        torrents,
    ]);

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

    const startRecoverySession = useCallback(
        (entry: RecoveryQueueEntry) => {
            clearRecoveryAutoCloseTimer();
            recoveryAbortControllerRef.current?.abort();
            recoveryAbortControllerRef.current = new AbortController();
            setRecoverySession({
                torrent: entry.torrent,
                action: entry.action,
                outcome: entry.outcome,
                classification: entry.classification,
                requiresDecision: entry.requiresDecision,
            });
            recoveryResolverRef.current = entry.resolve;
            recoveryFingerprintRef.current = entry.fingerprint;
            recoveryPromiseRef.current = entry.promise;
        },
        [clearRecoveryAutoCloseTimer],
    );

    const processNextRecoveryQueueEntry = useCallback(() => {
        if (recoveryResolverRef.current) return;
        const next = pendingRecoveryQueueRef.current.shift();
        syncQueuedItems();
        if (!next) return;
        startRecoverySession(next);
    }, [startRecoverySession, syncQueuedItems]);

    const createRecoveryQueueEntry = useCallback(
        (
            torrent: Torrent | TorrentDetail,
            action: RecoveryGateAction,
            outcome: RecoveryOutcome,
            classification: MissingFilesClassification,
            fingerprint: string,
            requiresDecision = true,
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
                requiresDecision,
                fingerprint,
                promise,
                resolve: resolver,
            };
        },
        [],
    );

    const enqueueRecoveryEntry = useCallback(
        (entry: RecoveryQueueEntry) => {
            if (!recoveryResolverRef.current) {
                startRecoverySession(entry);
                return entry.promise;
            }
            if (recoveryFingerprintRef.current === entry.fingerprint) {
                if (recoveryPromiseRef.current) {
                    return recoveryPromiseRef.current;
                }
            }
            const duplicate = pendingRecoveryQueueRef.current.find(
                (pending) => pending.fingerprint === entry.fingerprint,
            );
            if (duplicate) {
                return duplicate.promise;
            }
            pendingRecoveryQueueRef.current.push(entry);
            syncQueuedItems();
            return entry.promise;
        },
        [startRecoverySession, syncQueuedItems],
    );

    const finalizeRecovery = useCallback(
        (result: RecoveryGateOutcome) => {
            const finalizedFingerprint = recoveryFingerprintRef.current;
            clearRecoveryAutoCloseTimer();
            recoveryAbortControllerRef.current?.abort();
            recoveryAbortControllerRef.current = null;
            const resolver = recoveryResolverRef.current;
            recoveryResolverRef.current = null;
            recoveryFingerprintRef.current = null;
            recoveryPromiseRef.current = null;
            setRecoverySession(null);
            resolver?.(result);
            if (
                finalizedFingerprint &&
                result.status === "cancelled"
            ) {
                markRecoveryCancelled(finalizedFingerprint);
            }
            processNextRecoveryQueueEntry();
        },
        [
            clearRecoveryAutoCloseTimer,
            markRecoveryCancelled,
            processNextRecoveryQueueEntry,
        ],
    );

    const cancelPendingRecoveryQueue = useCallback(
        (result: RecoveryGateOutcome = { status: "cancelled" }) => {
            if (pendingRecoveryQueueRef.current.length === 0) return;
            const queued = pendingRecoveryQueueRef.current;
            pendingRecoveryQueueRef.current = [];
            queued.forEach((entry) => {
                entry.resolve(result);
                if (result.status === "cancelled") {
                    markRecoveryCancelled(entry.fingerprint);
                }
            });
            syncQueuedItems();
        },
        [markRecoveryCancelled, syncQueuedItems],
    );

    const isRecoverySessionActive = useCallback((fingerprint: string) => {
        return recoveryFingerprintRef.current === fingerprint;
    }, []);

    const getActiveRecoverySignal = useCallback(
        () => recoveryAbortControllerRef.current?.signal,
        [],
    );

    const hasActiveRecoveryRequest = useCallback(
        () => Boolean(recoveryResolverRef.current),
        [],
    );

    const abortActiveRecoveryRequest = useCallback(() => {
        recoveryAbortControllerRef.current?.abort();
    }, []);

    const getActiveRecoveryPromiseForFingerprint = useCallback(
        (fingerprint: string): Promise<RecoveryGateOutcome> | null => {
            if (recoveryFingerprintRef.current !== fingerprint) {
                return null;
            }
            return recoveryPromiseRef.current;
        },
        [],
    );

    const setRecoverySessionOutcome = useCallback(
        (
            outcome: RecoveryOutcome,
            autoCloseAtMs?: number,
            requiresDecision?: boolean,
        ) => {
            setRecoverySession((previous) => {
                if (!previous) {
                    return previous;
                }
                return {
                    ...previous,
                    outcome,
                    requiresDecision:
                        requiresDecision ?? previous.requiresDecision,
                    autoCloseAtMs,
                };
            });
        },
        [],
    );

    const scheduleRecoveryFinalize = useCallback(
        (
            delayMs: number,
            result: RecoveryGateOutcome,
            sessionOutcome: RecoveryOutcome,
        ) => {
            if (delayMs <= 0 || !recoveryResolverRef.current) {
                return false;
            }
            clearRecoveryAutoCloseTimer();
            const autoCloseAtMs = Date.now() + delayMs;
            setRecoverySessionOutcome(sessionOutcome, autoCloseAtMs);
            recoveryAutoCloseCancelRef.current = scheduler.scheduleTimeout(
                () => {
                    recoveryAutoCloseCancelRef.current = null;
                    finalizeRecovery(result);
                },
                delayMs,
            );
            return true;
        },
        [clearRecoveryAutoCloseTimer, finalizeRecovery, setRecoverySessionOutcome],
    );

    const cancelRecoveryForFingerprint = useCallback(
        (
            fingerprint: string,
            result: RecoveryGateOutcome = { status: "cancelled" },
        ) => {
            if (!fingerprint) return;

            if (pendingRecoveryQueueRef.current.length > 0) {
                const remainingQueue: RecoveryQueueEntry[] = [];
                pendingRecoveryQueueRef.current.forEach((entry) => {
                    if (entry.fingerprint === fingerprint) {
                        entry.resolve(result);
                        return;
                    }
                    remainingQueue.push(entry);
                });
                pendingRecoveryQueueRef.current = remainingQueue;
                syncQueuedItems();
            }

            if (
                recoverySession &&
                getRecoveryFingerprint(recoverySession.torrent) === fingerprint
            ) {
                finalizeRecovery(result);
            } else if (result.status === "cancelled") {
                markRecoveryCancelled(fingerprint);
            }
        },
        [
            finalizeRecovery,
            markRecoveryCancelled,
            recoverySession,
            syncQueuedItems,
        ],
    );

    const isDetailRecoveryBlocked = useMemo(() => {
        if (!detailData || !recoverySession) return false;
        return (
            getRecoveryFingerprint(detailData) ===
            getRecoveryFingerprint(recoverySession.torrent)
        );
    }, [detailData, recoverySession]);

    const state = useMemo(
        () => ({
            session: recoverySession,
            isBusy: isRecoveryBusy,
            isDetailRecoveryBlocked,
            queuedCount: queuedItems.length,
            queuedItems,
        }),
        [recoverySession, isRecoveryBusy, isDetailRecoveryBlocked, queuedItems],
    );

    return {
        state,
        recoverySession,
        withRecoveryBusy,
        getActiveRecoverySignal,
        hasActiveRecoveryRequest,
        abortActiveRecoveryRequest,
        getActiveRecoveryPromiseForFingerprint,
        setRecoverySessionOutcome,
        scheduleRecoveryFinalize,
        createRecoveryQueueEntry,
        enqueueRecoveryEntry,
        finalizeRecovery,
        cancelPendingRecoveryQueue,
        cancelRecoveryForFingerprint,
        isRecoverySessionActive,
        markRecoveryPausedBySystem,
        markRecoveryPausedByUser,
        markRecoveryCancelled,
        markRecoveryResumed,
        getRecoveryPauseOrigin,
        isRecoveryCancelled,
        isBackgroundRecoveryEligible,
        torrentsRef,
        silentVolumeRecoveryInFlightRef,
        silentVolumeRecoveryNextRetryAtRef,
        silentVolumeRecoveryAttemptCountRef,
    };
}
