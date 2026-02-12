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
    torrentCount: 1,
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

type HeartbeatTestClient = {
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

type HeartbeatTickProbe = {
    tick: () => Promise<void>;
};

describe("HeartbeatManager leftover resync", () => {
    it("performs a rate-limited resync when a removed id reappears in the delta", async () => {
        const client: HeartbeatTestClient = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("1")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(makeTorrent("1")),
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
        } catch {
            // ignore session storage in restricted test environments
        }

        const hb = new HeartbeatManager(client);
        const updates: HeartbeatPayload[] = [];
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
        await (hb as unknown as HeartbeatTickProbe).tick();

        // The leftover resync debug should have been called
        const calledLeftoverResync = debugSpy.mock.calls.some(
            (c) =>
                c[0] === "[tiny-torrent]" &&
                typeof c[1] === "object" &&
                c[1] !== null &&
                "scope" in c[1] &&
                "event" in c[1] &&
                (c[1] as { scope?: string; event?: string }).scope ===
                    "heartbeat" &&
                (c[1] as { scope?: string; event?: string }).event ===
                    "leftover_resync"
        );
        expect(calledLeftoverResync).toBe(true);

        // getTorrents should have been called by the resync
        expect(client.getTorrents).toHaveBeenCalled();

        debugSpy.mockRestore();
        sub.unsubscribe();
    });
});
