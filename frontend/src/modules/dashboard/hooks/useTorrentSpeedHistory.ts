import { useLayoutEffect, useMemo, useState } from "react";

import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";

const { performance } = registry;

type SpeedHistoryMap = Record<string, SpeedHistorySnapshot>;
type SpeedHistoryStore = {
    getSnapshotFor: (torrents: Torrent[]) => SpeedHistoryMap;
    commit: (torrents: Torrent[], history: SpeedHistoryMap) => void;
};

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

const deriveSpeedHistory = (
    previousHistory: SpeedHistoryMap,
    torrents: Torrent[],
): SpeedHistoryMap => {
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

    return hasChanges ? nextHistory : previousHistory;
};

const createSpeedHistoryStore = (): SpeedHistoryStore => {
    let committedHistory: SpeedHistoryMap = {};
    let committedTorrents: Torrent[] | null = null;
    return {
        getSnapshotFor: (torrents) => {
            if (committedTorrents === torrents) {
                return committedHistory;
            }
            return deriveSpeedHistory(committedHistory, torrents);
        },
        commit: (torrents, history) => {
            committedTorrents = torrents;
            committedHistory = history;
        },
    };
};

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
    const [store] = useState(createSpeedHistoryStore);
    const history = useMemo(
        () => store.getSnapshotFor(torrents),
        [store, torrents],
    );

    useLayoutEffect(() => {
        store.commit(torrents, history);
    }, [history, store, torrents]);

    return useMemo(
        () => ({
            current: history,
        }),
        [history],
    );
};

