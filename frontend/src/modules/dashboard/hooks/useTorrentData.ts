import { useState, useEffect, useCallback, useRef } from "react";
import { usePerformanceHistory } from "../../../shared/hooks/usePerformanceHistory";
import type { EngineAdapter } from "../../../services/rpc/engine-adapter";
import type { HeartbeatPayload } from "../../../services/rpc/heartbeat";
import type { RpcStatus } from "../../../shared/types/rpc";
import type { Torrent } from "../types/torrent";

type UseTorrentDataOptions = {
    client: EngineAdapter;
    sessionReady: boolean;
    pollingIntervalMs: number;
    onRpcStatusChange?: (status: Exclude<RpcStatus, "idle">) => void;
};

export type QueueActionHandlers = {
    moveToTop: (ids: string[]) => Promise<void>;
    moveUp: (ids: string[]) => Promise<void>;
    moveDown: (ids: string[]) => Promise<void>;
    moveToBottom: (ids: string[]) => Promise<void>;
};

type UseTorrentDataResult = {
    torrents: Torrent[];
    isInitialLoadFinished: boolean;
    refresh: () => Promise<void>;
    queueActions: QueueActionHandlers;
};

export function useTorrentData({
    client,
    sessionReady,
    pollingIntervalMs,
    onRpcStatusChange,
}: UseTorrentDataOptions): UseTorrentDataResult {
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [isInitialLoadFinished, setIsInitialLoadFinished] = useState(false);
    const isMountedRef = useRef(false);
    const initialLoadRef = useRef(false);
    const { pushSpeeds } = usePerformanceHistory();

    const commitTorrentSnapshot = useCallback(
        (data: Torrent[]) => {
            if (!isMountedRef.current) return;
            setTorrents(data);
            const totalDown = data.reduce(
                (acc, torrent) =>
                    acc +
                    (torrent.state === "downloading" ? torrent.speed.down : 0),
                0
            );
            const totalUp = data.reduce(
                (acc, torrent) => acc + torrent.speed.up,
                0
            );
            pushSpeeds(totalDown, totalUp);
            onRpcStatusChange?.("connected");
            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setIsInitialLoadFinished(true);
            }
        },
        [onRpcStatusChange, pushSpeeds]
    );

    const refresh = useCallback(async () => {
        try {
            const data = await client.getTorrents();
            commitTorrentSnapshot(data);
        } catch (error) {
            if (isMountedRef.current) {
                onRpcStatusChange?.("error");
            }
            throw error;
        }
    }, [client, commitTorrentSnapshot, onRpcStatusChange]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const handleHeartbeatUpdate = useCallback(
        ({ torrents: heartbeatTorrents }: HeartbeatPayload) => {
            if (!heartbeatTorrents) return;
            commitTorrentSnapshot(heartbeatTorrents);
        },
        [commitTorrentSnapshot]
    );

    useEffect(() => {
        if (!sessionReady) return;
        const intervalMs = Math.max(1000, pollingIntervalMs);
        const subscription = client.subscribeToHeartbeat({
            mode: "table",
            pollingIntervalMs: intervalMs,
            onUpdate: handleHeartbeatUpdate,
            onError: () => {
                if (!isMountedRef.current) return;
                onRpcStatusChange?.("error");
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [
        client,
        sessionReady,
        pollingIntervalMs,
        handleHeartbeatUpdate,
        onRpcStatusChange,
    ]);

    return {
        torrents,
        isInitialLoadFinished,
        refresh,
        queueActions: {
            moveToTop: async (ids) => {
                await client.moveToTop(ids);
            },
            moveUp: async (ids) => {
                await client.moveUp(ids);
            },
            moveDown: async (ids) => {
                await client.moveDown(ids);
            },
            moveToBottom: async (ids) => {
                await client.moveToBottom(ids);
            },
        },
    };
}
