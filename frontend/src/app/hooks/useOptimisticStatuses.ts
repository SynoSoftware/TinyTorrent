import { useCallback, useEffect, useMemo, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import { scheduler } from "@/app/services/scheduler";
import type {
    OptimisticStatusEntry,
    OptimisticStatusMap,
} from "@/modules/dashboard/types/optimistic";
import { OPTIMISTIC_CHECKING_GRACE_MS } from "@/config/logic";
import { STATUS, type TorrentOperationState } from "@/shared/status";

type InternalOptimisticStatusEntry = OptimisticStatusEntry & {
    state: TorrentStatus;
    sawCheckingState: boolean;
    pendingCheckingUntilMs?: number;
};

type InternalOptimisticStatusMap = Record<string, InternalOptimisticStatusEntry>;
type OperationOverlayMap = Record<string, TorrentOperationState>;

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

const pruneOperationOverlays = (
    overlays: OperationOverlayMap,
    activeTorrentIds: Set<string>,
): OperationOverlayMap => {
    let hasChanges = false;
    const next: OperationOverlayMap = { ...overlays };
    Object.keys(overlays).forEach((id) => {
        if (activeTorrentIds.has(id)) {
            return;
        }
        delete next[id];
        hasChanges = true;
    });
    return hasChanges ? next : overlays;
};

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [storedOptimisticStatuses, setOptimisticStatuses] =
        useState<InternalOptimisticStatusMap>({});
    const [operationOverlays, setOperationOverlays] = useState<OperationOverlayMap>(
        {},
    );
    const activeTorrentIdsSignature = useMemo(
        () => torrents.map((torrent) => torrent.id).filter(Boolean).join("\u001f"),
        [torrents],
    );
    const activeTorrentIds = useMemo(() => {
        if (!activeTorrentIdsSignature) {
            return new Set<string>();
        }
        return new Set(activeTorrentIdsSignature.split("\u001f"));
    }, [activeTorrentIdsSignature]);

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
                                ? Date.now() + OPTIMISTIC_CHECKING_GRACE_MS
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

    const updateOperationOverlays = useCallback(
        (updates: Array<{ id: string; operation?: TorrentOperationState }>) => {
            setOperationOverlays((prev) => {
                const next = { ...prev };
                let hasChanges = false;
                updates.forEach(({ id, operation }) => {
                    if (operation) {
                        if (next[id] !== operation) {
                            hasChanges = true;
                        }
                        next[id] = operation;
                        return;
                    }
                    if (Object.prototype.hasOwnProperty.call(next, id)) {
                        delete next[id];
                        hasChanges = true;
                    }
                });
                const nextOrPruned = pruneOperationOverlays(
                    next,
                    activeTorrentIds,
                );
                return hasChanges || nextOrPruned !== next ? nextOrPruned : prev;
            });
        },
        [activeTorrentIds],
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
        Object.entries(operationOverlays).forEach(([id, operation]) => {
            if (!activeTorrentIds.has(id)) {
                return;
            }
            projectedStatuses[id] = {
                ...(projectedStatuses[id] ?? {}),
                operation,
            };
        });
        return projectedStatuses;
    }, [activeTorrentIds, operationOverlays, storedOptimisticStatuses, torrents]);

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
            setOperationOverlays((currentOverlays) =>
                pruneOperationOverlays(
                    currentOverlays,
                    activeTorrentIds,
                ),
            );
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

        const cancelImmediateTimer = scheduler.scheduleTimeout(runReconcile, 0);
        const cancelGraceExpiryTimer =
            nextGraceExpiryDelayMs === null
                ? null
                : scheduler.scheduleTimeout(
                      runReconcile,
                      nextGraceExpiryDelayMs + 1,
                  );

        return () => {
            cancelImmediateTimer();
            cancelGraceExpiryTimer?.();
        };
    }, [activeTorrentIds, torrents, storedOptimisticStatuses]);

    return {
        optimisticStatuses,
        updateOptimisticStatuses,
        updateOperationOverlays,
    };
}
