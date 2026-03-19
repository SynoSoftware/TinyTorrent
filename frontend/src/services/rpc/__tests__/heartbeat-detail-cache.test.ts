import { describe, expect, it, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
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
    torrentCount: 2,
    activeTorrentCount: 0,
    pausedTorrentCount: 2,
};

const makeTorrent = (id: string): TorrentEntity => ({
    id,
    hash: `hash-${id}`,
    name: `torrent-${id}`,
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
});

type HeartbeatClientLike = {
    getTorrents: ReturnType<typeof vi.fn<() => Promise<TorrentEntity[]>>>;
    getSessionStats: ReturnType<typeof vi.fn<() => Promise<SessionStats>>>;
    getTorrentDetails: ReturnType<
        typeof vi.fn<(id: string) => Promise<TorrentDetailEntity>>
    >;
};

type HeartbeatInternals = {
    detailCache: Map<string, { hash: string; detail: TorrentDetailEntity }>;
};

describe("HeartbeatManager detail cache", () => {
    it("drops cached detail entries when their subscribers unsubscribe", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("torrent-1"), makeTorrent("torrent-2")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockImplementation(async (id) => ({
                    ...makeTorrent(id),
                    pieceStates: [1, 0, 1, 1],
                    pieceAvailability: [5, 2, 1, 0],
                })),
        };

        const hb = new HeartbeatManager(client);
        const internals = hb as unknown as HeartbeatInternals;

        const first = hb.subscribe({
            mode: "detail",
            detailId: "torrent-1",
            detailProfile: "pieces",
            includeTrackerStats: false,
            onUpdate: () => undefined,
            onError: () => undefined,
        });

        try {
            await waitForCondition(() => internals.detailCache.has("torrent-1"));
            expect(internals.detailCache.has("torrent-2")).toBe(false);

            first.unsubscribe();
            expect(internals.detailCache.size).toBe(0);

            const second = hb.subscribe({
                mode: "detail",
                detailId: "torrent-2",
                detailProfile: "standard",
                includeTrackerStats: false,
                onUpdate: () => undefined,
                onError: () => undefined,
            });

            try {
                await waitForCondition(() => internals.detailCache.has("torrent-2"));
                expect(internals.detailCache.has("torrent-1")).toBe(false);
            } finally {
                second.unsubscribe();
            }
        } finally {
            hb.dispose();
        }
    });
});
