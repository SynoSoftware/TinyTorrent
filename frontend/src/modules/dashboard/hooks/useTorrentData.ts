import { useState, useEffect, useCallback, useRef } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";
import type { RpcStatus } from "@/shared/types/rpc";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import { GHOST_TIMEOUT_MS } from "@/config/logic";

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
    ghostTorrents: Torrent[];
    addGhostTorrent: (options: GhostTorrentOptions) => string;
    removeGhostTorrent: (id: string) => void;
};

const arePeerSummariesEqual = (
    a: Torrent["peerSummary"],
    b: Torrent["peerSummary"]
) =>
    a.connected === b.connected &&
    a.total === b.total &&
    a.sending === b.sending &&
    a.getting === b.getting &&
    a.seeds === b.seeds;

const areSpeedsEqual = (a: Torrent["speed"], b: Torrent["speed"]) =>
    a.down === b.down && a.up === b.up;

const areTorrentsEqual = (current: Torrent, next: Torrent) =>
    current.id === next.id &&
    current.hash === next.hash &&
    current.name === next.name &&
    current.progress === next.progress &&
    current.verificationProgress === next.verificationProgress &&
    current.state === next.state &&
    areSpeedsEqual(current.speed, next.speed) &&
    arePeerSummariesEqual(current.peerSummary, next.peerSummary) &&
    current.totalSize === next.totalSize &&
    current.eta === next.eta &&
    current.queuePosition === next.queuePosition &&
    current.ratio === next.ratio &&
    current.uploaded === next.uploaded &&
    current.downloaded === next.downloaded &&
    current.leftUntilDone === next.leftUntilDone &&
    current.sizeWhenDone === next.sizeWhenDone &&
    current.error === next.error &&
    current.errorString === next.errorString &&
    current.isFinished === next.isFinished &&
    current.sequentialDownload === next.sequentialDownload &&
    current.superSeeding === next.superSeeding &&
    current.added === next.added &&
    current.savePath === next.savePath &&
    current.rpcId === next.rpcId;

export type GhostTorrentStrategy = "magnet_lookup" | "loading";

export interface GhostTorrentOptions {
    id: string;
    label: string;
    downloadDir?: string;
    strategy?: GhostTorrentStrategy;
    state?: TorrentStatus;
}

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

    const snapshotCacheRef = useRef<Map<string, Torrent>>(new Map());
    const snapshotOrderRef = useRef<string[]>([]);
    const [ghosts, setGhosts] = useState<Torrent[]>([]);
    const ghostTimersRef = useRef<Map<string, number>>(new Map());

    const commitTorrentSnapshot = useCallback(
        (data: Torrent[]) => {
            if (!isMountedRef.current) return;
            const nextOrder: string[] = [];
            const nextCache = new Map<string, Torrent>();
            const previousCache = snapshotCacheRef.current;
            const previousOrder = snapshotOrderRef.current;
            let hasDataChanges = false;
            let hasOrderChanges = previousOrder.length !== data.length;

            for (let index = 0; index < data.length; index += 1) {
                const incoming = data[index];
                const cached = previousCache.get(incoming.id);
                const normalized = {
                    ...incoming,
                    added:
                        incoming.added ??
                        cached?.added ??
                        Math.floor(Date.now() / 1000),
                };
                const reuseExisting = Boolean(
                    cached && areTorrentsEqual(cached, normalized)
                );
                const nextTorrent = reuseExisting ? cached! : normalized;
                nextCache.set(incoming.id, nextTorrent);
                nextOrder.push(incoming.id);

                if (!reuseExisting) {
                    hasDataChanges = true;
                }
                if (!hasOrderChanges && previousOrder[index] !== incoming.id) {
                    hasOrderChanges = true;
                }
            }

            snapshotCacheRef.current = nextCache;
            snapshotOrderRef.current = nextOrder;

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
            // pushSpeeds removed: engine-owned history is canonical
            onRpcStatusChange?.("connected");
            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setIsInitialLoadFinished(true);
            }

            const hadPreviousData = previousOrder.length > 0;
            if (!hasDataChanges && !hasOrderChanges && hadPreviousData) {
                return;
            }

            const nextList = nextOrder.map((id) => nextCache.get(id)!);
            setTorrents(nextList);
        },
        [onRpcStatusChange]
    );

    const buildGhostTorrent = (options: GhostTorrentOptions): Torrent => ({
        id: options.id,
        hash: options.id,
        name: options.label,
        progress: 0,
        verificationProgress: 0,
        state: options.state ?? "queued",
        speed: { down: 0, up: 0 },
        peerSummary: {
            connected: 0,
            total: 0,
            sending: 0,
            getting: 0,
            seeds: 0,
        },
        totalSize: 0,
        eta: -1,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        leftUntilDone: 0,
        sizeWhenDone: 0,
        error: undefined,
        errorString: undefined,
        isFinished: false,
        sequentialDownload: false,
        superSeeding: false,
        added: Math.floor(Date.now() / 1000),
        savePath: options.downloadDir,
        isGhost: true,
        ghostLabel: options.label,
        ghostState: options.strategy ?? "magnet_lookup",
    });

    const clearGhostTimer = useCallback((id: string) => {
        const timerId = ghostTimersRef.current.get(id);
        if (timerId) {
            if (typeof window !== "undefined") {
                window.clearTimeout(timerId);
            }
            ghostTimersRef.current.delete(id);
        }
    }, []);

    const removeGhostTorrent = useCallback(
        (id: string) => {
            setGhosts((prev) => prev.filter((ghost) => ghost.id !== id));
            clearGhostTimer(id);
        },
        [clearGhostTimer]
    );

    const addGhostTorrent = useCallback(
        (options: GhostTorrentOptions) => {
            const ghost = buildGhostTorrent(options);
            setGhosts((prev) => {
                const filtered = prev.filter((item) => item.id !== ghost.id);
                return [...filtered, ghost];
            });
            if (typeof window !== "undefined") {
                const timerId = window.setTimeout(() => {
                    removeGhostTorrent(ghost.id);
                }, GHOST_TIMEOUT_MS);
                ghostTimersRef.current.set(ghost.id, timerId);
            }
            return ghost.id;
        },
        [removeGhostTorrent]
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
    useEffect(() => {
        return () => {
            ghostTimersRef.current.forEach((timerId) => {
                if (typeof window !== "undefined") {
                    window.clearTimeout(timerId);
                }
            });
            ghostTimersRef.current.clear();
        };
    }, []);

    const handleHeartbeatUpdate = useCallback(
        ({ torrents: heartbeatTorrents, changedIds }: HeartbeatPayload) => {
            if (!heartbeatTorrents) return;
            onRpcStatusChange?.("connected");
            // If heartbeat reports no changed IDs, skip committing to avoid work
            const isInitialLoad = snapshotCacheRef.current.size === 0;
            if (
                !isInitialLoad &&
                Array.isArray(changedIds) &&
                changedIds.length === 0
            ) {
                return;
            }

            // If we have a small set of changedIds, apply a diff update to the
            // existing snapshot cache to avoid recreating the whole list.
            if (
                Array.isArray(changedIds) &&
                heartbeatTorrents.length > 0 &&
                changedIds.length > 0 &&
                changedIds.length < heartbeatTorrents.length
            ) {
                // Build a map of incoming torrents for quick lookup
                const incomingMap = new Map<string, Torrent>();
                for (const t of heartbeatTorrents) incomingMap.set(t.id, t);

                const prevCache = snapshotCacheRef.current;
                let anyChange = false;

                // Update only entries listed in changedIds
                for (const id of changedIds) {
                    const incoming = incomingMap.get(id);
                    if (!incoming) {
                        // removed torrent
                        if (prevCache.has(id)) {
                            prevCache.delete(id);
                            anyChange = true;
                        }
                        continue;
                    }
                    const cached = prevCache.get(id);
                    const normalized = {
                        ...incoming,
                        added:
                            incoming.added ??
                            cached?.added ??
                            Math.floor(Date.now() / 1000),
                    };
                    const reuseExisting = Boolean(
                        cached && areTorrentsEqual(cached, normalized)
                    );
                    const nextTorrent = reuseExisting ? cached! : normalized;
                    if (!reuseExisting) {
                        prevCache.set(id, nextTorrent);
                        anyChange = true;
                    }
                }

                // If nothing changed in data, don't re-render
                if (!anyChange) return;

                // Rebuild ordered list based on previous order, but ensure new/removed ids are handled
                const previousOrder = snapshotOrderRef.current;
                const nextOrder: string[] = [];
                const seen = new Set<string>();

                // Prefer keeping previous order when possible
                for (const id of previousOrder) {
                    if (prevCache.has(id)) {
                        nextOrder.push(id);
                        seen.add(id);
                    }
                }
                // Add any new ids from incoming snapshot that weren't present
                for (const t of heartbeatTorrents) {
                    if (!seen.has(t.id) && prevCache.has(t.id)) {
                        nextOrder.push(t.id);
                        seen.add(t.id);
                    }
                }

                snapshotOrderRef.current = nextOrder;

                const nextList = nextOrder
                    .map((id) => snapshotCacheRef.current.get(id)!)
                    .filter(Boolean) as Torrent[];
                setTorrents(nextList);
                return;
            }

            // Fallback to full commit when changedIds not provided or indicates full change
            commitTorrentSnapshot(heartbeatTorrents);
        },
        [commitTorrentSnapshot, onRpcStatusChange]
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
        ghostTorrents: ghosts,
        addGhostTorrent,
        removeGhostTorrent,
    };
}
