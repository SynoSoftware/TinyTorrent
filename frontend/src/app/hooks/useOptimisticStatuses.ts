import { useCallback, useEffect, useState } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";

export type OptimisticStatusMap = Record<
    string,
    { state: TorrentStatus; expiresAt: number }
>;

export function useOptimisticStatuses(torrents: Torrent[]) {
    const [optimisticStatuses, setOptimisticStatuses] =
        useState<OptimisticStatusMap>({});

    const updateOptimisticStatuses = useCallback(
        (updates: Array<{ id: string; state?: TorrentStatus }>) => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                updates.forEach(({ id, state }) => {
                    if (state) {
                        next[id] = {
                            state,
                            expiresAt: Date.now() + 3000,
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

    useEffect(() => {
        const interval = window.setInterval(() => {
            setOptimisticStatuses((prev) => {
                const next = { ...prev };
                const now = Date.now();
                Object.entries(prev).forEach(([id, entry]) => {
                    if (entry.expiresAt <= now) {
                        delete next[id];
                    }
                });
                return next;
            });
        }, 500);
        return () => window.clearInterval(interval);
    }, []);

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
