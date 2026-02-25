import { useCallback, useEffect, useMemo, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import { scheduler } from "@/app/services/scheduler";
import type { OptimisticStatusEntry, OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import { OPTIMISTIC_CHECKING_GRACE_MS } from "@/config/logic";
import { STATUS } from "@/shared/status";

type InternalOptimisticStatusEntry = OptimisticStatusEntry & {
    state?: TorrentStatus;
    sawCheckingState: boolean;
    pendingCheckingUntilMs?: number;
    pendingStateUntilMs?: number;
};

type InternalOptimisticStatusMap = Record<string, InternalOptimisticStatusEntry>;
type OptimisticStatusUpdate = {
    id: string;
    state?: TorrentStatus;
    operation?: OptimisticStatusEntry["operation"] | null;
};

const removeStateFromEntry = (
    entry: InternalOptimisticStatusEntry,
): InternalOptimisticStatusEntry | null => {
    const nextEntry: InternalOptimisticStatusEntry = {
        ...entry,
        state: undefined,
        sawCheckingState: false,
        pendingCheckingUntilMs: undefined,
        pendingStateUntilMs: undefined,
    };
    return nextEntry.operation ? nextEntry : null;
};

const reconcileOptimisticStatuses = (
    storedStatuses: InternalOptimisticStatusMap,
    torrents: Torrent[],
): InternalOptimisticStatusMap => {
    if (Object.keys(storedStatuses).length === 0) {
        return storedStatuses;
    }

    let nextStatuses: InternalOptimisticStatusMap | null = null;
    const torrentById = new Map(torrents.map((torrent) => [torrent.id, torrent]));
    const nowMs = Date.now();
    const ensureMutableStatuses = () => {
        if (!nextStatuses) {
            nextStatuses = { ...storedStatuses };
        }
        return nextStatuses;
    };

    Object.keys(storedStatuses).forEach((id) => {
        const entry = storedStatuses[id];
        const torrent = torrentById.get(id);
        if (!torrent) {
            const mutableStatuses = ensureMutableStatuses();
            delete mutableStatuses[id];
            return;
        }

        if (!entry.state) {
            return;
        }

        const isChecking = torrent.state === STATUS.torrent.CHECKING;
        const verificationProgress = torrent.verificationProgress;
        const isVerifying = typeof verificationProgress === "number" && verificationProgress < 1;

        if (entry.state !== STATUS.torrent.CHECKING) {
            if (torrent.state === entry.state) {
                const mutableStatuses = ensureMutableStatuses();
                const nextEntry = removeStateFromEntry(entry);
                if (nextEntry) {
                    mutableStatuses[id] = nextEntry;
                } else {
                    delete mutableStatuses[id];
                }
                return;
            }
            const shouldKeepPendingState =
                typeof entry.pendingStateUntilMs === "number" &&
                entry.pendingStateUntilMs > nowMs;
            if (!shouldKeepPendingState) {
                const mutableStatuses = ensureMutableStatuses();
                const nextEntry = removeStateFromEntry(entry);
                if (nextEntry) {
                    mutableStatuses[id] = nextEntry;
                } else {
                    delete mutableStatuses[id];
                }
            }
            return;
        }

        if (isChecking || isVerifying) {
            if (!entry.sawCheckingState) {
                const mutableStatuses = ensureMutableStatuses();
                mutableStatuses[id] = {
                    ...entry,
                    sawCheckingState: true,
                    pendingCheckingUntilMs: undefined,
                };
            }
            return;
        }

        const shouldKeepPendingChecking =
            !entry.sawCheckingState &&
            typeof entry.pendingCheckingUntilMs === "number" &&
            entry.pendingCheckingUntilMs > nowMs;
        if (shouldKeepPendingChecking) {
            return;
        }

        if (entry.sawCheckingState || typeof entry.pendingCheckingUntilMs === "number") {
            const mutableStatuses = ensureMutableStatuses();
            const nextEntry = removeStateFromEntry(entry);
            if (nextEntry) {
                mutableStatuses[id] = nextEntry;
            } else {
                delete mutableStatuses[id];
            }
        }
    });

    return nextStatuses ?? storedStatuses;
};

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [storedOptimisticStatuses, setOptimisticStatuses] = useState<InternalOptimisticStatusMap>({});

    // Optimistic statuses are a UI-only projection and are cleared by:
    // 1) engine-confirmed reconciliation, 2) explicit command failure,
    // 3) a short recheck grace timeout to bridge RPC->heartbeat lag.
    const updateOptimisticStatuses = useCallback((updates: OptimisticStatusUpdate[]) => {
        setOptimisticStatuses((prev) => {
            const next = { ...prev };
            updates.forEach(({ id, state, operation }) => {
                const previous = next[id];
                const nextOperation =
                    operation === undefined
                        ? previous?.operation
                        : operation === null
                          ? undefined
                          : operation;

                if (state) {
                    const isCheckingState = state === STATUS.torrent.CHECKING;
                    next[id] = {
                        ...(previous ?? {
                            sawCheckingState: false,
                        }),
                        operation: nextOperation,
                        state,
                        sawCheckingState: !isCheckingState,
                        pendingCheckingUntilMs: isCheckingState ? Date.now() + OPTIMISTIC_CHECKING_GRACE_MS : undefined,
                        pendingStateUntilMs: isCheckingState ? undefined : Date.now() + OPTIMISTIC_CHECKING_GRACE_MS,
                    };
                    return;
                }

                if (previous?.state) {
                    if (operation === null) {
                        next[id] = {
                            ...previous,
                            operation: undefined,
                        };
                    } else if (operation !== undefined && nextOperation) {
                        next[id] = {
                            ...previous,
                            operation: nextOperation,
                        };
                    }
                    return;
                }

                if (!nextOperation) {
                    delete next[id];
                    return;
                }

                next[id] = {
                    ...(previous ?? {
                        sawCheckingState: false,
                    }),
                    operation: nextOperation,
                    state: undefined,
                    pendingCheckingUntilMs: undefined,
                    pendingStateUntilMs: undefined,
                    sawCheckingState: false,
                };
            });
            return next;
        });
    }, []);

    const optimisticStatuses = useMemo(() => {
        const reconciledStatuses = reconcileOptimisticStatuses(storedOptimisticStatuses, torrents);
        const projectedStatuses: OptimisticStatusMap = {};
        Object.keys(reconciledStatuses).forEach((id) => {
            const entry = reconciledStatuses[id];
            projectedStatuses[id] = {
                state: entry.state,
                operation: entry.operation,
            };
        });
        return projectedStatuses;
    }, [storedOptimisticStatuses, torrents]);

    useEffect(() => {
        const runReconcile = () => {
            setOptimisticStatuses((currentStatuses) => {
                const nextStatuses = reconcileOptimisticStatuses(currentStatuses, torrents);
                return nextStatuses === currentStatuses ? currentStatuses : nextStatuses;
            });
        };

        let nextGraceExpiryDelayMs: number | null = null;
        Object.values(storedOptimisticStatuses).forEach((entry) => {
            if (!entry.state) {
                return;
            }
            if (
                entry.state === STATUS.torrent.CHECKING &&
                !entry.sawCheckingState &&
                typeof entry.pendingCheckingUntilMs === "number"
            ) {
                const delay = Math.max(0, entry.pendingCheckingUntilMs - Date.now());
                if (nextGraceExpiryDelayMs === null || delay < nextGraceExpiryDelayMs) {
                    nextGraceExpiryDelayMs = delay;
                }
            }
            if (entry.state !== STATUS.torrent.CHECKING && typeof entry.pendingStateUntilMs === "number") {
                const delay = Math.max(0, entry.pendingStateUntilMs - Date.now());
                if (nextGraceExpiryDelayMs === null || delay < nextGraceExpiryDelayMs) {
                    nextGraceExpiryDelayMs = delay;
                }
            }
        });

        const cancelImmediateTimer = scheduler.scheduleTimeout(runReconcile, 0);
        const cancelGraceExpiryTimer =
            nextGraceExpiryDelayMs === null
                ? null
                : scheduler.scheduleTimeout(runReconcile, nextGraceExpiryDelayMs + 1);

        return () => {
            cancelImmediateTimer();
            cancelGraceExpiryTimer?.();
        };
    }, [torrents, storedOptimisticStatuses]);

    return {
        optimisticStatuses,
        updateOptimisticStatuses,
    };
}
