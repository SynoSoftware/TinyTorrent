import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeartbeatManager } from "../heartbeat";

// Minimal SessionStats
const dummyStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 2,
    activeTorrentCount: 0,
    pausedTorrentCount: 0,
};

function makeTorrent(id: string) {
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
    } as any;
}

describe("HeartbeatManager drift correction and removal handling", () => {
    it("applies delta removals to internal state (no ghost torrents)", async () => {
        // Mock client
        const client: any = {
            getTorrents: vi
                .fn()
                .mockResolvedValue([makeTorrent("1"), makeTorrent("2")]),
            getSessionStats: vi.fn().mockResolvedValue(dummyStats),
            getTorrentDetails: vi.fn(),
            // After initial full fetch, delta will report removal of id=1
            getRecentlyActive: vi
                .fn()
                .mockResolvedValue({ torrents: [], removed: [1] }),
        };

        const hb = new HeartbeatManager(client);
        const updates: any[] = [];
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
            const un = vi.fn(() => {
                if (updates.length >= 1) {
                    clearTimeout(to);
                    resolve();
                }
            });
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
        const firstIds = updates[0].torrents.map((t: any) => t.id).sort();
        expect(firstIds).toEqual(["1", "2"]);

        // Force a second tick to run delta path.
        await (hb as any).tick();

        // After delta, expect a second payload where id '1' is removed
        // The manager broadcasts to subscribers inside tick(), so append will have at least 2 entries
        expect(updates.length).toBeGreaterThanOrEqual(2);
        const secondIds = updates[updates.length - 1].torrents
            .map((t: any) => t.id)
            .sort();
        expect(secondIds).toEqual(["2"]);

        sub.unsubscribe();
    });
});
