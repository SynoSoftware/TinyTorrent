import { useRef } from "react";

import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { performance } = registry;

type SpeedHistoryMap = Record<string, SpeedHistorySnapshot>;

const HISTORY_POINTS = performance.historyDataPoints;

const createHistoryBuffer = () => new Array(HISTORY_POINTS).fill(0);

const areArraysEqual = (a: readonly number[], b: readonly number[]) => {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
            return false;
        }
    }
    return true;
};

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
    let hasChanges = false;

    torrents.forEach((torrent) => {
        const previous = previousHistory[torrent.id];
        const nextSnapshot = previous
            ? {
                  down: appendSample(previous.down, torrent.speed.down),
                  up: appendSample(previous.up, torrent.speed.up),
              }
            : {
                  down: createHistoryBuffer(),
                  up: createHistoryBuffer(),
              };
        const snapshot =
            previous &&
            areArraysEqual(previous.down, nextSnapshot.down) &&
            areArraysEqual(previous.up, nextSnapshot.up)
                ? previous
                : nextSnapshot;
        if (snapshot !== previous) {
            hasChanges = true;
        }
        nextHistory[torrent.id] = snapshot;
    });

    const previousIds = Object.keys(previousHistory);
    if (previousIds.length !== torrents.length) {
        hasChanges = true;
    } else if (!hasChanges) {
        for (const id of previousIds) {
            if (!(id in nextHistory)) {
                hasChanges = true;
                break;
            }
            if (nextHistory[id] !== previousHistory[id]) {
                hasChanges = true;
                break;
            }
        }
    }

    historyRef.current = hasChanges ? nextHistory : previousHistory;

    return historyRef;
};

