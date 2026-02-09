import { describe, it, expect, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";

const dummyStats: SessionStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 2,
    activeTorrentCount: 0,
    pausedTorrentCount: 0,
};

function makeTorrent(id: string): TorrentEntity {
    return {
        id,
        hash: `h${id}`,
        name: `t${id}`,
        state: "paused",
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0 },
        totalSize: 0,
        eta: 0,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        added: Date.now(),
    };
}

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
    MAX_DELTA_CYCLES: number;
};

describe("HeartbeatManager full-sync after N delta cycles", () => {
    it("forces a full fetch after MAX_DELTA_CYCLES is reached", async () => {
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("1"), makeTorrent("2")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(makeTorrent("1")),
        };

        // Prepare getRecentlyActive to succeed several times without changes
        const delta = { torrents: [], removed: [] };
        client.getRecentlyActive = vi
            .fn<
                () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
            >()
            .mockResolvedValue(delta);

        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        // force a small MAX_DELTA_CYCLES for test determinism
        hbInternals.MAX_DELTA_CYCLES = 2;

        const updates: HeartbeatPayload[] = [];
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
            pollingIntervalMs: 1000,
        });

        // Wait for initial full fetch
        await new Promise<void>((resolve, reject) => {
            const to = setTimeout(
                () => reject(new Error("timeout initial")),
                2000
            );
            const i = setInterval(() => {
                if (updates.length >= 1) {
                    clearInterval(i);
                    clearTimeout(to);
                    resolve();
                }
            }, 10);
        });

        // getTorrents should have been called once during hydration
        expect(client.getTorrents).toHaveBeenCalledTimes(1);

        // Run two delta cycles via tick(); should increment cycleCount
        await hbInternals.tick();
        await hbInternals.tick();

        // At this point cycleCount reached MAX (2). Next tick should force full fetch
        await hbInternals.tick();

        // getTorrents should have been called again (full fetch after deltas)
        expect(client.getTorrents).toHaveBeenCalledTimes(2);

        sub.unsubscribe();
    });
});
