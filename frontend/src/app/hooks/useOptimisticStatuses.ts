import { useCallback, useEffect, useMemo, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import { STATUS } from "@/shared/status";

const reconcileOptimisticStatuses = (
    storedStatuses: OptimisticStatusMap,
    torrents: Torrent[],
): OptimisticStatusMap => {
    if (Object.keys(storedStatuses).length === 0) {
        return storedStatuses;
    }

    let nextStatuses: OptimisticStatusMap | null = null;
    const torrentById = new Map(torrents.map((torrent) => [torrent.id, torrent]));

    Object.keys(storedStatuses).forEach((id) => {
        const torrent = torrentById.get(id);
        if (!torrent) {
            if (!nextStatuses) {
                nextStatuses = { ...storedStatuses };
            }
            delete nextStatuses[id];
            return;
        }

        const isChecking = torrent.state === STATUS.torrent.CHECKING;
        const verificationProgress = torrent.verificationProgress;
        const isVerifying =
            typeof verificationProgress === "number" && verificationProgress < 1;
        if (!isChecking && !isVerifying) {
            if (!nextStatuses) {
                nextStatuses = { ...storedStatuses };
            }
            delete nextStatuses[id];
        }
    });

    return nextStatuses ?? storedStatuses;
};

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [storedOptimisticStatuses, setOptimisticStatuses] =
        useState<OptimisticStatusMap>({});

    // Optimistic statuses are a UI-only projection and must be cleared
    // only by engine-confirmed reconciliation or explicit failure.
    // Remove time-based expiry to enforce that invariant.
    const updateOptimisticStatuses = useCallback(
        (updates: Array<{ id: string; state?: TorrentStatus }>) => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                updates.forEach(({ id, state }) => {
                    if (state) {
                        next[id] = { state };
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
        return reconcileOptimisticStatuses(storedOptimisticStatuses, torrents);
    }, [storedOptimisticStatuses, torrents]);

    useEffect(() => {
        const pruneTimer = window.setTimeout(() => {
            setOptimisticStatuses((currentStatuses) => {
                const nextStatuses = reconcileOptimisticStatuses(
                    currentStatuses,
                    torrents,
                );
                return nextStatuses === currentStatuses
                    ? currentStatuses
                    : nextStatuses;
            });
        }, 0);

        return () => {
            window.clearTimeout(pruneTimer);
        };
    }, [torrents, storedOptimisticStatuses]);

    return {
        optimisticStatuses,
        updateOptimisticStatuses,
    };
}
