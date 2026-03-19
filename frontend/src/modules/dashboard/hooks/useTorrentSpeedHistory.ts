import { useEffect, useRef } from "react";

import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { performance } = registry;

type SpeedHistoryMap = Record<string, SpeedHistorySnapshot>;

const HISTORY_POINTS = performance.historyDataPoints;

const appendSample = (history: readonly number[], sample: number) => {
    const normalizedSample = Number.isFinite(sample) ? sample : 0;
    if (history.length >= HISTORY_POINTS) {
        return [...history.slice(-(HISTORY_POINTS - 1)), normalizedSample];
    }
    return [...history, normalizedSample];
};

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
    const historyRef = useRef<SpeedHistoryMap>({});

    useEffect(() => {
        const previousHistory = historyRef.current;
        const nextHistory: SpeedHistoryMap = {};

        torrents.forEach((torrent) => {
            const previous = previousHistory[torrent.id];
            nextHistory[torrent.id] = {
                down: appendSample(previous?.down ?? [], torrent.speed.down),
                up: appendSample(previous?.up ?? [], torrent.speed.up),
            };
        });

        historyRef.current = nextHistory;
    }, [torrents]);

    return historyRef;
};

