import { useEffect, useRef } from "react";

import { CONFIG } from "@/config/logic";
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

const HISTORY_POINTS = CONFIG.performance.history_data_points;
const createZeroHistory = () =>
    new Array(HISTORY_POINTS).fill(0);

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
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
                const history = next[torrent.id] ?? createZeroHistory();
                history.push(getCurrentSpeed(torrent));
                if (history.length > HISTORY_POINTS) {
                    history.splice(0, history.length - HISTORY_POINTS);
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
    }, []);

    return historyRef;
};
