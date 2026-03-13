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
        typeof vi.fn<(id: string) => Promise<TorrentDetailEntity>>
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
    it("emits updated detail payloads on each tick even when the summary hash is unchanged", async () => {
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
});
