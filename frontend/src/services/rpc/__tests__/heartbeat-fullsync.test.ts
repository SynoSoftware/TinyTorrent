import { describe, it, expect, vi } from "vitest";
import { HeartbeatManager } from "../heartbeat";

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

describe("HeartbeatManager full-sync after N delta cycles", () => {
    it("forces a full fetch after MAX_DELTA_CYCLES is reached", async () => {
        const client: any = {
            getTorrents: vi
                .fn()
                .mockResolvedValue([makeTorrent("1"), makeTorrent("2")]),
            getSessionStats: vi.fn().mockResolvedValue(dummyStats),
            getTorrentDetails: vi.fn(),
        };

        // Prepare getRecentlyActive to succeed several times without changes
        const delta = { torrents: [], removed: [] };
        client.getRecentlyActive = vi.fn().mockResolvedValue(delta);

        const hb = new HeartbeatManager(client);
        // force a small MAX_DELTA_CYCLES for test determinism
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

        // getTorrents should have been called once during hydration
        expect(client.getTorrents).toHaveBeenCalledTimes(1);

        // Run two delta cycles via tick(); should increment cycleCount
        await (hb as any).tick();
        await (hb as any).tick();

        // At this point cycleCount reached MAX (2). Next tick should force full fetch
        await (hb as any).tick();

        // getTorrents should have been called again (full fetch after deltas)
        expect(client.getTorrents).toHaveBeenCalledTimes(2);

        sub.unsubscribe();
    });
});
