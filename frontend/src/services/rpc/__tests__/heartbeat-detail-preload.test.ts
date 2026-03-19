import { describe, expect, it, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 500,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 10);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const dummyStats: SessionStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 1,
    activeTorrentCount: 0,
    pausedTorrentCount: 1,
};

const makeTorrent = (id: string): TorrentEntity => ({
    id,
    hash: `h${id}`,
    name: `torrent-${id}`,
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: Date.now(),
});

type HeartbeatClientLike = {
    getTorrents: ReturnType<typeof vi.fn<() => Promise<TorrentEntity[]>>>;
    getSessionStats: ReturnType<typeof vi.fn<() => Promise<SessionStats>>>;
    getTorrentDetails: ReturnType<
        typeof vi.fn<
            (
                id: string,
                options?: {
                    profile?: "standard" | "pieces";
                    includeTrackerStats?: boolean;
                    includePieceSnapshot?: boolean;
                },
            ) => Promise<TorrentDetailEntity>
        >
    >;
};

type HeartbeatInternals = {
    lastTorrents?: TorrentEntity[];
    lastSessionStats?: SessionStats;
    detailCache: Map<string, { hash: string; detail: TorrentDetailEntity }>;
    lastImmediateTriggerMs: number;
};

describe("HeartbeatManager detail preload", () => {
    it("queues a follow-up immediate tick when another subscriber mounts during the initial hydration tick", async () => {
        const initialResolvers: Array<(value: TorrentEntity[]) => void> = [];
        const initialTorrents = new Promise<TorrentEntity[]>((resolve) => {
            initialResolvers.push(resolve);
        });
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockImplementationOnce(() => initialTorrents)
                .mockResolvedValue([makeTorrent("torrent-startup")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(makeTorrent("torrent-startup")),
        };

        const hb = new HeartbeatManager(client);
        const firstUpdates: number[] = [];
        const secondUpdates: number[] = [];

        const first = hb.subscribe({
            mode: "table",
            onUpdate: () => {
                firstUpdates.push(Date.now());
            },
        });

        const second = hb.subscribe({
            mode: "table",
            onUpdate: () => {
                secondUpdates.push(Date.now());
            },
        });

        try {
            const resolveInitialTorrents = initialResolvers[0];
            if (!resolveInitialTorrents) {
                throw new Error("initial_torrents_resolver_missing");
            }
            resolveInitialTorrents([makeTorrent("torrent-startup")]);

            await waitForCondition(() => firstUpdates.length >= 1);
            await waitForCondition(() => secondUpdates.length >= 1);

            expect(client.getTorrents).toHaveBeenCalledTimes(2);
        } finally {
            first.unsubscribe();
            second.unsubscribe();
            hb.dispose();
        }
    });

    it("triggers an immediate detail fetch when opening details without cached detail data", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("torrent-1")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue({
                    ...makeTorrent("torrent-1"),
                    trackers: [
                        {
                            announce: "https://tracker.example/announce",
                            tier: 0,
                            lastAnnounceTime: 0,
                            lastAnnounceResult: "",
                            lastAnnounceSucceeded: false,
                            lastScrapeTime: 0,
                            lastScrapeResult: "",
                            lastScrapeSucceeded: false,
                            seederCount: 0,
                            leecherCount: 0,
                        },
                    ],
                }),
        };

        const hb = new HeartbeatManager(client);
        const internals = hb as unknown as HeartbeatInternals;
        internals.lastTorrents = [makeTorrent("torrent-1")];
        internals.lastSessionStats = dummyStats;
        internals.lastImmediateTriggerMs = Date.now();

        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-1",
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: () => undefined,
            onError: () => undefined,
        });

        try {
            await waitForCondition(
                () => client.getTorrentDetails.mock.calls.length === 1,
            );

            expect(client.getTorrentDetails).toHaveBeenCalledWith("torrent-1", {
                profile: "standard",
                includeTrackerStats: true,
                includePieceSnapshot: false,
            });
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("also triggers an immediate refetch when pieces detail is requested from a standard cached detail", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("torrent-2")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue({
                    ...makeTorrent("torrent-2"),
                    pieceStates: [1, 0, 1],
                    pieceAvailability: [3, 2, 3],
                }),
        };

        const hb = new HeartbeatManager(client);
        const internals = hb as unknown as HeartbeatInternals;
        internals.lastTorrents = [makeTorrent("torrent-2")];
        internals.lastSessionStats = dummyStats;
        internals.lastImmediateTriggerMs = Date.now();
        internals.detailCache.set("torrent-2", {
            hash: "htorrent-2",
            detail: {
                ...makeTorrent("torrent-2"),
            },
        });

        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-2",
            detailProfile: "pieces",
            includeTrackerStats: true,
            onUpdate: () => undefined,
            onError: () => undefined,
        });

        try {
            await waitForCondition(
                () => client.getTorrentDetails.mock.calls.length === 1,
            );

            expect(client.getTorrentDetails).toHaveBeenCalledWith("torrent-2", {
                profile: "pieces",
                includeTrackerStats: true,
                includePieceSnapshot: true,
            });
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("forces a fresh detail fetch when opening a detail view even if cached detail exists", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("torrent-3")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue({
                    ...makeTorrent("torrent-3"),
                    trackers: [
                        {
                            announce: "https://tracker.example/announce",
                            tier: 0,
                            lastAnnounceTime: 0,
                            lastAnnounceResult: "",
                            lastAnnounceSucceeded: false,
                            lastScrapeTime: 0,
                            lastScrapeResult: "",
                            lastScrapeSucceeded: false,
                            seederCount: 0,
                            leecherCount: 0,
                        },
                    ],
                }),
        };

        const hb = new HeartbeatManager(client);
        const internals = hb as unknown as HeartbeatInternals;
        internals.lastTorrents = [makeTorrent("torrent-3")];
        internals.lastSessionStats = dummyStats;
        internals.lastImmediateTriggerMs = Date.now();
        internals.detailCache.set("torrent-3", {
            hash: "htorrent-3",
            detail: {
                ...makeTorrent("torrent-3"),
            },
        });

        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-3",
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: () => undefined,
            onError: () => undefined,
        });

        try {
            await waitForCondition(
                () => client.getTorrentDetails.mock.calls.length === 1,
            );

            expect(client.getTorrentDetails).toHaveBeenCalledWith("torrent-3", {
                profile: "standard",
                includeTrackerStats: true,
                includePieceSnapshot: false,
            });
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("triggers an immediate detail refetch when reopening a standard detail from cache", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("torrent-3")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue({
                    ...makeTorrent("torrent-3"),
                    trackers: [
                        {
                            announce: "https://tracker.example/announce",
                            tier: 0,
                            lastAnnounceTime: 0,
                            lastAnnounceResult: "",
                            lastAnnounceSucceeded: false,
                            lastScrapeTime: 0,
                            lastScrapeResult: "",
                            lastScrapeSucceeded: false,
                            seederCount: 0,
                            leecherCount: 0,
                        },
                    ],
                }),
        };

        const hb = new HeartbeatManager(client);
        const internals = hb as unknown as HeartbeatInternals;
        internals.lastTorrents = [makeTorrent("torrent-3")];
        internals.lastSessionStats = dummyStats;
        internals.lastImmediateTriggerMs = Date.now();
        internals.detailCache.set("torrent-3", {
            hash: "htorrent-3",
            detail: {
                ...makeTorrent("torrent-3"),
            },
        });

        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-3",
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: () => undefined,
            onError: () => undefined,
        });

        try {
            await waitForCondition(
                () => client.getTorrentDetails.mock.calls.length === 1,
            );

            expect(client.getTorrentDetails).toHaveBeenCalledWith("torrent-3", {
                profile: "standard",
                includeTrackerStats: true,
                includePieceSnapshot: false,
            });
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });
});
