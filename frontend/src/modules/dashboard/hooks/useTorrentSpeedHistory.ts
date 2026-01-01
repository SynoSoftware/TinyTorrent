import { useEffect, useRef } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { subscribeUiClock } from "@/shared/hooks/useUiClock";

type SpeedHistoryMap = Record<string, number[]>;

const getCurrentSpeed = (torrent: Torrent) => {
    if (torrent.state === "downloading") {
        return torrent.speed.down;
    }
    if (torrent.state === "seeding") {
        return torrent.speed.up;
    }
    return 0;
};

export const useTorrentSpeedHistory = (
    torrents: Torrent[],
    historyLimit: number
) => {
    const historyRef = useRef<SpeedHistoryMap>({});
    const torrentsRef = useRef<Torrent[]>(torrents);

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    useEffect(() => {
        const updateHistory = () => {
            const next = historyRef.current;
            const seenIds = new Set<string>();
            torrentsRef.current.forEach((torrent) => {
                seenIds.add(torrent.id);
                const history = next[torrent.id] ?? [];
                history.push(getCurrentSpeed(torrent));
                if (history.length > historyLimit) {
                    history.splice(0, history.length - historyLimit);
                }
                next[torrent.id] = history;
            });
            Object.keys(next).forEach((id) => {
                if (!seenIds.has(id)) {
                    delete next[id];
                }
            });
        };

        updateHistory();
        return subscribeUiClock(updateHistory);
    }, [historyLimit]);

    return historyRef;
};
