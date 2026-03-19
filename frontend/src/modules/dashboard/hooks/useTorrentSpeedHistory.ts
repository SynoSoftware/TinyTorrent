import { useRef } from "react";

import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { performance } = registry;

type SpeedHistoryMap = Record<string, SpeedHistorySnapshot>;

const HISTORY_POINTS = performance.historyDataPoints;

const createHistoryBuffer = () => new Array(HISTORY_POINTS).fill(0);

const appendSample = (history: readonly number[], sample: number) => {
    const normalizedSample = Number.isFinite(sample) ? sample : 0;
    if (history.length >= HISTORY_POINTS) {
        return [...history.slice(-(HISTORY_POINTS - 1)), normalizedSample];
    }
    return [...history, normalizedSample];
};

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
    const historyRef = useRef<SpeedHistoryMap>({});
    const previousHistory = historyRef.current;
    const nextHistory: SpeedHistoryMap = {};

    torrents.forEach((torrent) => {
        const previous = previousHistory[torrent.id];
        nextHistory[torrent.id] = {
            down: previous
                ? appendSample(previous.down, torrent.speed.down)
                : createHistoryBuffer(),
            up: previous
                ? appendSample(previous.up, torrent.speed.up)
                : createHistoryBuffer(),
        };
    });

    historyRef.current = nextHistory;

    return historyRef;
};

