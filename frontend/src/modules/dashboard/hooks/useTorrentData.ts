import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";
import { useSession } from "@/app/context/SessionContext";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentStatus } from "@/services/rpc/entities";
import STATUS from "@/shared/status";
import { GHOST_TIMEOUT_MS } from "@/config/logic";
import { buildUniqueTorrentOrder } from "./utils/torrent-order.ts";
import { isRpcCommandError } from "@/services/rpc/errors";
import { scheduler } from "@/app/services/scheduler";
import { subscribeToTableHeartbeat } from "@/app/services/tableHeartbeat";

type UseTorrentDataOptions = {
    client: EngineAdapter;
    sessionReady: boolean;
    pollingIntervalMs: number;
    markTransportConnected?: () => void;
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
    runtimeSummary: TorrentRuntimeSummary;
    ghostTorrents: Torrent[];
    addGhostTorrent: (options: GhostTorrentOptions) => string;
    removeGhostTorrent: (id: string) => void;
};

export interface TorrentRuntimeSummary {
    activeDownloadCount: number;
    activeDownloadRequiredBytes: number;
    verifyingCount: number;
    verifyingAverageProgress: number;
    singleVerifyingName: string | null;
}

const EMPTY_TORRENT_RUNTIME_SUMMARY: TorrentRuntimeSummary = {
    activeDownloadCount: 0,
    activeDownloadRequiredBytes: 0,
    verifyingCount: 0,
    verifyingAverageProgress: 0,
    singleVerifyingName: null,
};

const deriveTorrentRuntimeSummary = (
    torrents: Torrent[],
): TorrentRuntimeSummary => {
    if (torrents.length === 0) return EMPTY_TORRENT_RUNTIME_SUMMARY;

    let activeDownloadCount = 0;
    let activeDownloadRequiredBytes = 0;
    let verifyingCount = 0;
    let verifyingProgressTotal = 0;
    let singleVerifyingName: string | null = null;

    torrents.forEach((torrent) => {
        const isActiveDownload =
            !torrent.isFinished &&
            torrent.state !== STATUS.torrent.PAUSED &&
            torrent.state !== STATUS.torrent.MISSING_FILES &&
            !torrent.isGhost;
        if (isActiveDownload) {
            activeDownloadCount += 1;
            activeDownloadRequiredBytes += torrent.leftUntilDone ?? 0;
        }

        if (torrent.state === STATUS.torrent.CHECKING) {
            verifyingCount += 1;
            verifyingProgressTotal +=
                torrent.verificationProgress ?? torrent.progress ?? 0;
            singleVerifyingName = torrent.name;
        }
    });

    return {
        activeDownloadCount,
        activeDownloadRequiredBytes,
        verifyingCount,
        verifyingAverageProgress:
            verifyingCount > 0 ? verifyingProgressTotal / verifyingCount : 0,
        singleVerifyingName: verifyingCount === 1 ? singleVerifyingName : null,
    };
};

const arePeerSummariesEqual = (
    a: Torrent["peerSummary"],
    b: Torrent["peerSummary"],
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
    (current.errorEnvelope?.errorMessage ?? current.errorString) ===
        (next.errorEnvelope?.errorMessage ?? next.errorString) &&
    (current.errorEnvelope?.errorClass ?? null) ===
        (next.errorEnvelope?.errorClass ?? null) &&
    (current.errorEnvelope?.recoveryState ?? null) ===
        (next.errorEnvelope?.recoveryState ?? null) &&
    (current.errorEnvelope?.fingerprint ?? null) ===
        (next.errorEnvelope?.fingerprint ?? null) &&
    (current.errorEnvelope?.primaryAction ?? null) ===
        (next.errorEnvelope?.primaryAction ?? null) &&
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
    markTransportConnected,
}: UseTorrentDataOptions): UseTorrentDataResult {
    const { reportReadError } = useSession();
    const [torrents, setTorrents] = useState<Torrent[]>([]);
    const [isInitialLoadFinished, setIsInitialLoadFinished] = useState(false);
    const isMountedRef = useRef(false);
    const initialLoadRef = useRef(false);

    const snapshotCacheRef = useRef<Map<string, Torrent>>(new Map());
    const snapshotOrderRef = useRef<string[]>([]);
    const [ghosts, setGhosts] = useState<Torrent[]>([]);
    const ghostTimersRef = useRef<Map<string, () => void>>(new Map());

    const commitTorrentSnapshot = useCallback(
        (data: Torrent[]) => {
            if (!isMountedRef.current) return;
            const nextCache = new Map<string, Torrent>();
            const previousCache = snapshotCacheRef.current;
            const previousOrder = snapshotOrderRef.current;
            let hasDataChanges = false;

            data.forEach((incoming) => {
                const cached = previousCache.get(incoming.id);
                const normalized = {
                    ...incoming,
                    added:
                        incoming.added ??
                        cached?.added ??
                        Math.floor(Date.now() / 1000),
                };
                const reuseExisting = Boolean(
                    cached && areTorrentsEqual(cached, normalized),
                );
                const nextTorrent = reuseExisting ? cached! : normalized;
                nextCache.set(incoming.id, nextTorrent);
                if (!reuseExisting) {
                    hasDataChanges = true;
                }
            });

            const nextOrder = buildUniqueTorrentOrder(data);
            let hasOrderChanges = previousOrder.length !== nextOrder.length;
            if (!hasOrderChanges) {
                for (let index = 0; index < nextOrder.length; index += 1) {
                    if (previousOrder[index] !== nextOrder[index]) {
                        hasOrderChanges = true;
                        break;
                    }
                }
            }

            snapshotCacheRef.current = nextCache;
            snapshotOrderRef.current = nextOrder;

            // pushSpeeds removed: engine-owned history is canonical
            markTransportConnected?.();
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
        [markTransportConnected],
    );

    const buildGhostTorrent = (options: GhostTorrentOptions): Torrent => ({
        id: options.id,
        hash: options.id,
        name: options.label,
        progress: 0,
        verificationProgress: 0,
        state: options.state ?? STATUS.torrent.QUEUED,
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
        const cancelTimer = ghostTimersRef.current.get(id);
        if (cancelTimer) {
            cancelTimer();
            ghostTimersRef.current.delete(id);
        }
    }, []);

    const clearAllGhostTimers = useCallback(() => {
        const timerMap = ghostTimersRef.current;
        timerMap.forEach((cancelTimer) => {
            cancelTimer();
        });
        timerMap.clear();
    }, []);

    const removeGhostTorrent = useCallback(
        (id: string) => {
            setGhosts((prev) => prev.filter((ghost) => ghost.id !== id));
            clearGhostTimer(id);
        },
        [clearGhostTimer],
    );

    const addGhostTorrent = useCallback(
        (options: GhostTorrentOptions) => {
            const ghost = buildGhostTorrent(options);
            clearGhostTimer(ghost.id);
            setGhosts((prev) => {
                const filtered = prev.filter((item) => item.id !== ghost.id);
                return [...filtered, ghost];
            });
            const cancelTimer = scheduler.scheduleTimeout(() => {
                removeGhostTorrent(ghost.id);
            }, GHOST_TIMEOUT_MS);
            ghostTimersRef.current.set(ghost.id, cancelTimer);
            return ghost.id;
        },
        [clearGhostTimer, removeGhostTorrent],
    );

    const refresh = useCallback(async () => {
        try {
            const data = await client.getTorrents();
            commitTorrentSnapshot(data);
        } catch (error) {
            if (isMountedRef.current && !isRpcCommandError(error)) {
                reportReadError();
            }
            throw error;
        }
    }, [client, commitTorrentSnapshot, reportReadError]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    useEffect(() => {
        return clearAllGhostTimers;
    }, [clearAllGhostTimers]);

    const handleHeartbeatUpdate = useCallback(
        ({ torrents: heartbeatTorrents, changedIds }: HeartbeatPayload) => {
            if (!heartbeatTorrents) return;

            markTransportConnected?.();

            // Fast no-op: explicit "no changes" hint is safe to trust
            if (
                snapshotCacheRef.current.size > 0 &&
                Array.isArray(changedIds) &&
                changedIds.length === 0
            ) {
                return;
            }

            if (!isMountedRef.current) return;

            const previousCache = snapshotCacheRef.current;
            const previousOrder = snapshotOrderRef.current;

            const nextCache = new Map<string, Torrent>();
            let hasDataChanges = false;

            for (const incoming of heartbeatTorrents) {
                const cached = previousCache.get(incoming.id);

                const normalized: Torrent = {
                    ...incoming,
                    added:
                        incoming.added ??
                        cached?.added ??
                        Math.floor(Date.now() / 1000),
                };

                const reuseExisting =
                    cached !== undefined &&
                    areTorrentsEqual(cached, normalized);

                nextCache.set(incoming.id, reuseExisting ? cached : normalized);
                if (!reuseExisting) hasDataChanges = true;
            }

            const nextOrder = buildUniqueTorrentOrder(heartbeatTorrents);

            let hasOrderChanges = previousOrder.length !== nextOrder.length;
            if (!hasOrderChanges) {
                for (let i = 0; i < nextOrder.length; i++) {
                    if (previousOrder[i] !== nextOrder[i]) {
                        hasOrderChanges = true;
                        break;
                    }
                }
            }

            snapshotCacheRef.current = nextCache;
            snapshotOrderRef.current = nextOrder;

            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setIsInitialLoadFinished(true);
            }

            if (
                previousOrder.length > 0 &&
                !hasDataChanges &&
                !hasOrderChanges
            ) {
                return;
            }

            setTorrents(nextOrder.map((id) => nextCache.get(id)!));
        },
        [markTransportConnected],
    );

    useEffect(() => {
        if (!sessionReady) return;
        const intervalMs = Math.max(1000, pollingIntervalMs);
        const subscription = subscribeToTableHeartbeat({
            client,
            pollingIntervalMs: intervalMs,
            onUpdate: handleHeartbeatUpdate,
            onError: () => {
                if (!isMountedRef.current) return;
                reportReadError();
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
        markTransportConnected,
        reportReadError,
    ]);

    const runtimeSummary = useMemo(
        () => deriveTorrentRuntimeSummary(torrents),
        [torrents],
    );

    return {
        torrents,
        isInitialLoadFinished,
        refresh,
        runtimeSummary,
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
