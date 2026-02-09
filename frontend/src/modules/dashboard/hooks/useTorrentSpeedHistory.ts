import { useCallback, useEffect, useRef } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import STATUS from "@/shared/status";
import { useSpeedHistoryDomain } from "@/shared/hooks/useSpeedHistoryDomain";

type SpeedHistoryMap = Record<string, number[]>;

export const useTorrentSpeedHistory = (torrents: Torrent[]) => {
    const historyRef = useRef<SpeedHistoryMap>({});
    const torrentsRef = useRef<Torrent[]>(torrents);
    const store = useSpeedHistoryDomain();
    const unwatchMapRef = useRef<Map<string, () => void>>(new Map());

    useEffect(() => {
        torrentsRef.current = torrents;
    }, [torrents]);

    const updateVisibleHistory = useCallback(() => {
        const currentTorrents = torrentsRef.current;
        const nextHistory: SpeedHistoryMap = {};

        currentTorrents.forEach((torrent) => {
            const data = store.get(torrent.id);
            const isSeeding = torrent.state === STATUS.torrent.SEEDING;
            nextHistory[torrent.id] = isSeeding ? data.up : data.down;
        });

        historyRef.current = nextHistory;
    }, [store]);

    useEffect(() => {
        const nextIds = new Set(torrents.map((torrent) => torrent.id));
        const currentMap = unwatchMapRef.current;

        nextIds.forEach((id) => {
            if (currentMap.has(id)) return;
            currentMap.set(id, store.watch(id));
        });

        Array.from(currentMap.keys()).forEach((id) => {
            if (nextIds.has(id)) return;
            const unwatch = currentMap.get(id);
            unwatch?.();
            currentMap.delete(id);
        });

        updateVisibleHistory();
    }, [store, torrents, updateVisibleHistory]);

    useEffect(() => {
        const unsubscribe = store.subscribe(updateVisibleHistory);
        return () => {
            unsubscribe();
        };
    }, [store, updateVisibleHistory]);

    useEffect(() => {
        const unwatchMap = unwatchMapRef.current;
        return () => {
            Array.from(unwatchMap.values()).forEach((unwatch) => unwatch());
            unwatchMap.clear();
        };
    }, []);

    return historyRef;
};
