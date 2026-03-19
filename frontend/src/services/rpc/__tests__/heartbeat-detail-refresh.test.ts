import { describe, expect, it, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
    TorrentTrackerEntity,
} from "@/services/rpc/entities";

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 1000,
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

const makeTorrent = (): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "ubuntu.iso",
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    rpcId: 1,
});

const makeTorrentWithId = (id: string): TorrentEntity => ({
    ...makeTorrent(),
    id,
    hash: `hash-${id}`,
    name: `torrent-${id}`,
    rpcId: Number(id.replace(/\D+/g, "")) || 1,
});

const makeTracker = (seederCount: number): TorrentTrackerEntity => ({
    id: 1,
    announce: "https://tracker.example/announce",
    tier: 0,
    seederCount,
    leecherCount: 0,
    lastAnnounceTime: 0,
    lastAnnounceResult: "",
    lastAnnounceSucceeded: false,
    lastScrapeTime: 0,
    lastScrapeResult: "",
    lastScrapeSucceeded: false,
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
    getRecentlyActive?: ReturnType<
        typeof vi.fn<
            () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
        >
    >;
};

type HeartbeatInternals = {
    tick: () => Promise<void>;
};

describe("HeartbeatManager detail refresh", () => {
    it("emits updated standard-detail payloads when detail data changes even if the summary hash is unchanged", async () => {
        const summaryTorrent = makeTorrent();
        let seederCount = 1;
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([summaryTorrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockImplementation(async () => ({
                    ...summaryTorrent,
                    trackers: [makeTracker(seederCount)],
                })),
        };

        const updates: number[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-1",
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: ({ detail }) => {
                const count = detail?.trackers?.[0]?.seederCount;
                if (typeof count === "number") {
                    updates.push(count);
                }
            },
            onError: () => undefined,
        });

        try {
            await waitForCondition(() => updates.length === 1);
            expect(updates[0]).toBe(1);

            seederCount = 9;
            await hbInternals.tick();

            await waitForCondition(() => updates.length === 2);
            expect(updates[1]).toBe(9);
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("keeps cached piece snapshots stable and downgrades unchanged pieces refreshes to lightweight detail reads", async () => {
        let summaryTorrent: TorrentEntity = makeTorrent();
        const pieceStates = [1, 0, 1, 0];
        const pieceAvailability = [4, 2, 3, 1];
        const detailCalls: Array<{
            profile?: "standard" | "pieces";
            includePieceSnapshot?: boolean;
        }> = [];

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockImplementation(async () => [summaryTorrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<
                    (
                        id: string,
                        options?: {
                            profile?: "standard" | "pieces";
                            includeTrackerStats?: boolean;
                            includePieceSnapshot?: boolean;
                        },
                    ) => Promise<TorrentDetailEntity>
                >()
                .mockImplementation(async (_id, options) => {
                    detailCalls.push({
                        profile: options?.profile,
                        includePieceSnapshot: options?.includePieceSnapshot,
                    });
                    return {
                        ...summaryTorrent,
                        pieceCount: pieceStates.length,
                        pieceSize: 1024,
                        pieceStates:
                            options?.includePieceSnapshot === false
                                ? undefined
                                : [...pieceStates],
                        pieceAvailability:
                            options?.includePieceSnapshot === false
                                ? undefined
                                : [...pieceAvailability],
                        trackers: [makeTracker(1)],
                    };
                }),
        };

        const updates: TorrentDetailEntity[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-1",
            detailProfile: "pieces",
            includeTrackerStats: true,
            onUpdate: ({ detail }) => {
                if (detail) {
                    updates.push(detail);
                }
            },
            onError: () => undefined,
        });

        try {
            await waitForCondition(() => updates.length === 1);
            expect(detailCalls[0]).toEqual({
                profile: "pieces",
                includePieceSnapshot: true,
            });

            const firstUpdate = updates[0];
            expect(firstUpdate.pieceStates).toBeDefined();
            expect(firstUpdate.pieceAvailability).toBeDefined();

            await hbInternals.tick();

            expect(updates).toHaveLength(1);
            expect(detailCalls[1]).toEqual({
                profile: "pieces",
                includePieceSnapshot: false,
            });

            summaryTorrent = {
                ...summaryTorrent,
                speed: { down: 2048, up: 1024 },
            };

            await hbInternals.tick();

            await waitForCondition(() => updates.length === 2);
            expect(detailCalls[2]).toEqual({
                profile: "pieces",
                includePieceSnapshot: false,
            });
            expect(updates[1].speed.down).toBe(2048);
            expect(updates[1].speed.up).toBe(1024);
            expect(updates[1].pieceStates).toBe(firstUpdate.pieceStates);
            expect(updates[1].pieceAvailability).toBe(
                firstUpdate.pieceAvailability,
            );
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("does not re-emit detail payloads when only session stats change", async () => {
        const summaryTorrent = makeTorrent();
        let sessionStats: SessionStats = {
            ...dummyStats,
            downloadSpeed: 10,
            uploadSpeed: 5,
        };

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([summaryTorrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockImplementation(async () => sessionStats),
            getTorrentDetails: vi
                .fn<
                    (
                        id: string,
                        options?: {
                            profile?: "standard" | "pieces";
                            includeTrackerStats?: boolean;
                            includePieceSnapshot?: boolean;
                        },
                    ) => Promise<TorrentDetailEntity>
                >()
                .mockImplementation(async () => ({
                    ...summaryTorrent,
                    trackers: [makeTracker(1)],
                })),
        };

        const updates: TorrentDetailEntity[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const subscription = hb.subscribe({
            mode: "detail",
            detailId: "torrent-1",
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: ({ detail }) => {
                if (detail) {
                    updates.push(detail);
                }
            },
            onError: () => undefined,
        });

        try {
            await waitForCondition(() => updates.length === 1);

            sessionStats = {
                ...sessionStats,
                downloadSpeed: 999,
                uploadSpeed: 333,
            };

            await hbInternals.tick();

            expect(updates).toHaveLength(1);
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });

    it("does not re-emit detail payloads when only unrelated torrents change", async () => {
        const detailTorrent = makeTorrentWithId("torrent-1");
        let otherTorrent = makeTorrentWithId("torrent-2");

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockImplementation(async () => [detailTorrent, otherTorrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue({
                    ...dummyStats,
                    torrentCount: 2,
                }),
            getTorrentDetails: vi
                .fn<
                    (
                        id: string,
                        options?: {
                            profile?: "standard" | "pieces";
                            includeTrackerStats?: boolean;
                            includePieceSnapshot?: boolean;
                        },
                    ) => Promise<TorrentDetailEntity>
                >()
                .mockImplementation(async () => ({
                    ...detailTorrent,
                    trackers: [makeTracker(1)],
                })),
        };

        const updates: TorrentDetailEntity[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const subscription = hb.subscribe({
            mode: "detail",
            detailId: detailTorrent.id,
            detailProfile: "standard",
            includeTrackerStats: true,
            onUpdate: ({ detail }) => {
                if (detail) {
                    updates.push(detail);
                }
            },
            onError: () => undefined,
        });

        try {
            await waitForCondition(() => updates.length === 1);

            otherTorrent = {
                ...otherTorrent,
                speed: { down: 2048, up: 512 },
            };

            await hbInternals.tick();

            expect(updates).toHaveLength(1);
        } finally {
            subscription.unsubscribe();
            hb.dispose();
        }
    });
});
