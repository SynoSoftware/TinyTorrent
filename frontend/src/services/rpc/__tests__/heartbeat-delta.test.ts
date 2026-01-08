import { describe, it, expect, vi } from "vitest";
import { HeartbeatManager } from "../heartbeat";

const dummyStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 2,
    activeTorrentCount: 0,
    pausedTorrentCount: 0,
};

function makeTorrent(id: string, name?: string) {
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
    } as any;
}

describe("HeartbeatManager delta integration", () => {
    it("applies delta updates and removals correctly", async () => {
        const client: any = {
            getTorrents: vi
                .fn()
                .mockResolvedValue([makeTorrent("1"), makeTorrent("2")]),
            getSessionStats: vi.fn().mockResolvedValue(dummyStats),
            getTorrentDetails: vi.fn(),
        };

        // First, getRecentlyActive should not be used for initial hydration
        client.getRecentlyActive = vi.fn().mockResolvedValue({
            torrents: [makeTorrent("2", "new-name")],
            removed: [1],
        });

        const hb = new HeartbeatManager(client);

        const updates: any[] = [];
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
        await (hb as any).tick();

        // the latest snapshot should reflect removal of id "1" and updated name for id "2"
        const last = (hb as any).lastTorrents as any[];
        expect(last.map((t) => t.id)).toEqual(["2"]);
        expect(last[0].name).toBe("new-name");

        sub.unsubscribe();
    });

    it("forces a full fetch after MAX_DELTA_CYCLES", async () => {
        const client: any = {
            getTorrents: vi
                .fn()
                .mockResolvedValue([makeTorrent("1"), makeTorrent("2")]),
            getSessionStats: vi.fn().mockResolvedValue(dummyStats),
            getTorrentDetails: vi.fn(),
        };

        // Prepare getRecentlyActive to return a harmless delta
        const delta = { torrents: [], removed: [] };
        client.getRecentlyActive = vi.fn().mockResolvedValue(delta);

        const hb = new HeartbeatManager(client);
        (hb as any).MAX_DELTA_CYCLES = 2;

        const updates: any[] = [];
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
        await (hb as any).tick();
        await (hb as any).tick();

        // Next tick should force a full fetch
        await (hb as any).tick();
        expect(client.getTorrents).toHaveBeenCalledTimes(2);

        sub.unsubscribe();
    });
});
