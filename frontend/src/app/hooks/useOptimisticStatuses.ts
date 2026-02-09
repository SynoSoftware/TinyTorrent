import { useCallback, useEffect, useMemo, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import type {
    OptimisticStatusEntry,
    OptimisticStatusMap,
} from "@/modules/dashboard/types/optimistic";
import { STATUS } from "@/shared/status";

type InternalOptimisticStatusEntry = OptimisticStatusEntry & {
    sawCheckingState: boolean;
    pendingCheckingUntilMs?: number;
};

type InternalOptimisticStatusMap = Record<string, InternalOptimisticStatusEntry>;
const CHECKING_OPTIMISTIC_GRACE_MS = 5000;

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

        const isChecking = torrent.state === STATUS.torrent.CHECKING;
        const verificationProgress = torrent.verificationProgress;
        const isVerifying =
            typeof verificationProgress === "number" && verificationProgress < 1;

        if (entry.state !== STATUS.torrent.CHECKING) {
            if (!isChecking && !isVerifying) {
                const mutableStatuses = ensureMutableStatuses();
                delete mutableStatuses[id];
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

        if (
            entry.sawCheckingState ||
            typeof entry.pendingCheckingUntilMs === "number"
        ) {
            const mutableStatuses = ensureMutableStatuses();
            delete mutableStatuses[id];
        }
    });

    return nextStatuses ?? storedStatuses;
};

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [storedOptimisticStatuses, setOptimisticStatuses] =
        useState<InternalOptimisticStatusMap>({});

    // Optimistic statuses are a UI-only projection and are cleared by:
    // 1) engine-confirmed reconciliation, 2) explicit command failure,
    // 3) a short recheck grace timeout to bridge RPC->heartbeat lag.
    const updateOptimisticStatuses = useCallback(
        (updates: Array<{ id: string; state?: TorrentStatus }>) => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                updates.forEach(({ id, state }) => {
                    if (state) {
                        const isCheckingState =
                            state === STATUS.torrent.CHECKING;
                        next[id] = {
                            state,
                            sawCheckingState: !isCheckingState,
                            pendingCheckingUntilMs: isCheckingState
                                ? Date.now() + CHECKING_OPTIMISTIC_GRACE_MS
                                : undefined,
                        };
                    } else {
                        delete next[id];
                    }
                });
                return next;
            });
        },
        []
    );

    const optimisticStatuses = useMemo(() => {
        const reconciledStatuses = reconcileOptimisticStatuses(
            storedOptimisticStatuses,
            torrents,
        );
        const projectedStatuses: OptimisticStatusMap = {};
        Object.keys(reconciledStatuses).forEach((id) => {
            projectedStatuses[id] = { state: reconciledStatuses[id].state };
        });
        return projectedStatuses;
    }, [storedOptimisticStatuses, torrents]);

    useEffect(() => {
        const runReconcile = () => {
            setOptimisticStatuses((currentStatuses) => {
                const nextStatuses = reconcileOptimisticStatuses(
                    currentStatuses,
                    torrents,
                );
                return nextStatuses === currentStatuses
                    ? currentStatuses
                    : nextStatuses;
            });
        };

        let nextGraceExpiryDelayMs: number | null = null;
        Object.values(storedOptimisticStatuses).forEach((entry) => {
            if (
                entry.state !== STATUS.torrent.CHECKING ||
                entry.sawCheckingState ||
                typeof entry.pendingCheckingUntilMs !== "number"
            ) {
                return;
            }
            const delay = Math.max(0, entry.pendingCheckingUntilMs - Date.now());
            if (nextGraceExpiryDelayMs === null || delay < nextGraceExpiryDelayMs) {
                nextGraceExpiryDelayMs = delay;
            }
        });

        const immediateTimer = window.setTimeout(runReconcile, 0);
        const graceExpiryTimer =
            nextGraceExpiryDelayMs === null
                ? null
                : window.setTimeout(runReconcile, nextGraceExpiryDelayMs + 1);

        return () => {
            window.clearTimeout(immediateTimer);
            if (graceExpiryTimer !== null) {
                window.clearTimeout(graceExpiryTimer);
            }
        };
    }, [torrents, storedOptimisticStatuses]);

    return {
        optimisticStatuses,
        updateOptimisticStatuses,
    };
}
