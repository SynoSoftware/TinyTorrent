import { useCallback, useEffect, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import { useUiClock } from "@/shared/hooks/useUiClock";

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [optimisticStatuses, setOptimisticStatuses] =
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
                        next[id] = {
                            state,
                        } as any;
                    } else {
                        delete next[id];
                    }
                });
                return next;
            });
        },
        []
    );

    useEffect(() => {
        setOptimisticStatuses((prev) => {
            const next = { ...prev };
            torrents.forEach((torrent) => {
                const optimisticState = prev[torrent.id];
                if (!optimisticState) return;
                if (torrent.state === optimisticState.state) {
                    delete next[torrent.id];
                }
            });
            return next;
        });
    }, [torrents]);

    return {
        optimisticStatuses,
        updateOptimisticStatuses,
    };
}
