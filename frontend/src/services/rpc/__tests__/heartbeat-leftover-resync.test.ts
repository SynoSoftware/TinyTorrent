import { describe, it, expect, vi } from "vitest";
import { HeartbeatManager } from "../heartbeat";

const dummyStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 1,
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

describe("HeartbeatManager leftover resync", () => {
    it("performs a rate-limited resync when a removed id reappears in the delta", async () => {
        const client: any = {
            getTorrents: vi.fn().mockResolvedValue([makeTorrent("1")]),
            getSessionStats: vi.fn().mockResolvedValue(dummyStats),
            getTorrentDetails: vi.fn(),
        };

        // getRecentlyActive returns a delta that removes id 1 but also returns it in `torrents` (reappear)
        client.getRecentlyActive = vi.fn().mockResolvedValueOnce({
            torrents: [makeTorrent("1")],
            removed: [1],
        });

        // subsequent call should trigger resync and call getTorrents
        // enable diagnostics so we can observe resync debug logs
        try {
            sessionStorage.setItem("tt-debug-removed-diagnostics", "1");
        } catch {}

        const hb = new HeartbeatManager(client);
        const updates: any[] = [];
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
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

        const debugSpy = vi
            .spyOn(console, "debug")
            .mockImplementation(() => {});

        // Run delta tick which should detect leftover and call getTorrents
        await (hb as any).tick();

        // The leftover resync debug should have been called
        const calledLeftoverResync = debugSpy.mock.calls.some(
            (c) => c[0] === "[tiny-torrent][heartbeat][leftover-resync]"
        );
        expect(calledLeftoverResync).toBe(true);

        // getTorrents should have been called by the resync
        expect(client.getTorrents).toHaveBeenCalled();

        debugSpy.mockRestore();
        sub.unsubscribe();
    });
});
