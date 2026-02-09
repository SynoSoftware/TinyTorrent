import { describe, it, expect, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";

// Minimal SessionStats
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
    getRecentlyActive: ReturnType<
        typeof vi.fn<
            () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
        >
    >;
};

type HeartbeatTickProbe = {
    tick: () => Promise<void>;
};

describe("HeartbeatManager drift correction and removal handling", () => {
    it("applies delta removals to internal state (no ghost torrents)", async () => {
        // Mock client
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
            // After initial full fetch, delta will report removal of id=1
            getRecentlyActive: vi
                .fn<
                    () => Promise<{
                        torrents: TorrentEntity[];
                        removed?: number[];
                    }>
                >()
                .mockResolvedValue({ torrents: [], removed: [1] }),
        };

        const hb = new HeartbeatManager(client);
        const updates: HeartbeatPayload[] = [];
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
            pollingIntervalMs: 1000,
        });

        // Wait for the initial full fetch to complete (subscribe triggers immediate tick)
        await new Promise<void>((resolve, reject) => {
            const to = setTimeout(
                () => reject(new Error("initial tick timeout")),
                2000
            );
            // poll
            const i = setInterval(() => {
                if (updates.length >= 1) {
                    clearInterval(i);
                    clearTimeout(to);
                    resolve();
                }
            }, 10);
        });

        expect(updates.length).toBeGreaterThanOrEqual(1);
        // initial payload should contain both ids
        const firstIds = updates[0].torrents.map((t) => t.id).sort();
        expect(firstIds).toEqual(["1", "2"]);

        // Force a second tick to run delta path.
        await (hb as unknown as HeartbeatTickProbe).tick();

        // After delta, expect a second payload where id '1' is removed
        // The manager broadcasts to subscribers inside tick(), so append will have at least 2 entries
        expect(updates.length).toBeGreaterThanOrEqual(2);
        const secondIds = updates[updates.length - 1].torrents
            .map((t) => t.id)
            .sort();
        expect(secondIds).toEqual(["2"]);

        sub.unsubscribe();
    });
});
