import { useEffect, useRef } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { subscribeUiClock } from "@/shared/hooks/useUiClock";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import STATUS from "@/shared/status";

type SpeedHistoryMap = Record<string, number[]>;

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
    const historyRef = useRef<SpeedHistoryMap>({});
    const torrentsRef = useRef<Torrent[]>(torrents);
    const client = useTorrentClient();
    const updateTokenRef = useRef(0);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    useEffect(() => {
        const updateHistory = () => {
            const currentTorrents = torrentsRef.current;
            const seenIds = new Set<string>();
            currentTorrents.forEach((torrent) => seenIds.add(torrent.id));

            const fetchHistory = client.getSpeedHistory;
            if (typeof fetchHistory !== "function") {
                Object.keys(historyRef.current).forEach((id) => {
                    if (!seenIds.has(id)) {
                        delete historyRef.current[id];
                    }
                });
                return;
            }

            const token = updateTokenRef.current + 1;
            updateTokenRef.current = token;

            (async () => {
                const updates: Record<string, number[]> = {};
                await Promise.all(
                    currentTorrents.map(async (t) => {
                        try {
                            const data = await fetchHistory.call(client, t.id);
                            if (
                                !data ||
                                !Array.isArray(data.down) ||
                                !Array.isArray(data.up)
                            ) {
                                return;
                            }
                            const isSeeding =
                                t.state === STATUS.torrent.SEEDING;
                            updates[t.id] = isSeeding ? data.up : data.down;
                        } catch {
                            // Keep existing history on transient failures.
                        }
                    })
                );

                if (updateTokenRef.current !== token) {
                    return;
                }

                if (Object.keys(updates).length > 0) {
                    Object.assign(historyRef.current, updates);
                }

                Object.keys(historyRef.current).forEach((id) => {
                    if (!seenIds.has(id)) {
                        delete historyRef.current[id];
                    }
                });
            })();
        };

        updateHistory();
        return subscribeUiClock(updateHistory);
    }, [client]);

    return historyRef;
};
