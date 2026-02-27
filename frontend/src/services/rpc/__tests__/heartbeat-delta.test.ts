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

function makeTorrent(id: string, name?: string): TorrentEntity {
    return {
        id,
        hash: `h${id}`,
        name: name ?? `t${id}`,
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
    lastTorrents: TorrentEntity[];
    MAX_DELTA_CYCLES: number;
};

describe("HeartbeatManager delta integration", () => {
    it("applies delta updates and removals correctly", async () => {
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

        // First, getRecentlyActive should not be used for initial hydration
        client.getRecentlyActive = vi
            .fn<
                () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
            >()
            .mockResolvedValue({
                torrents: [makeTorrent("2", "new-name")],
                removed: [1],
            });

        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;

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

        // initial snapshot should contain two torrents
        expect(updates[0].torrents.length).toBe(2);

        // Run one tick which should use getRecentlyActive and merge
        await hbInternals.tick();

        // the latest snapshot should reflect removal of id "1" and updated name for id "2"
        const last = hbInternals.lastTorrents;
        expect(last.map((t) => t.id)).toEqual(["2"]);
        expect(last[0].name).toBe("new-name");

        sub.unsubscribe();
    });

    it("forces a full fetch after MAX_DELTA_CYCLES", async () => {
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

        // Prepare getRecentlyActive to return a harmless delta
        const delta = { torrents: [], removed: [] };
        client.getRecentlyActive = vi
            .fn<
                () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
            >()
            .mockResolvedValue(delta);

        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
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

        expect(client.getTorrents).toHaveBeenCalledTimes(1);

        // Run two delta cycles
        await hbInternals.tick();
        await hbInternals.tick();

        // Next tick should force a full fetch
        await hbInternals.tick();
        expect(client.getTorrents).toHaveBeenCalledTimes(2);

        sub.unsubscribe();
    });

    it("forces a full fetch when a subscriber requires authoritative convergence", async () => {
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

        client.getRecentlyActive = vi
            .fn<
                () => Promise<{ torrents: TorrentEntity[]; removed?: number[] }>
            >()
            .mockResolvedValue({ torrents: [], removed: [] });

        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;

        const updates: HeartbeatPayload[] = [];
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
            pollingIntervalMs: 1000,
            preferFullFetch: true,
        });

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

        expect(client.getTorrents).toHaveBeenCalledTimes(1);

        await hbInternals.tick();

        expect(client.getTorrents).toHaveBeenCalledTimes(2);
        expect(client.getRecentlyActive).not.toHaveBeenCalled();

        sub.unsubscribe();
    });
});
