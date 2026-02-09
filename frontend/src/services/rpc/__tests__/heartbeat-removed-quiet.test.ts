import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("HeartbeatManager removed quiet logging", () => {
    beforeEach(() => {
        // enable diagnostics
        try {
            sessionStorage.setItem("tt-debug-removed-diagnostics", "1");
        } catch {
            // ignore if not available
        }
    });

    afterEach(() => {
        try {
            sessionStorage.removeItem("tt-debug-removed-diagnostics");
        } catch {
            // ignore session storage in restricted test environments
        }
    });

    it("logs removed-quiet when all removals are no-ops", async () => {
        const client: HeartbeatTestClient = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([makeTorrent("2")]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(makeTorrent("2")),
        };

        // getRecentlyActive reports a removal of id "1" which is absent
        client.getRecentlyActive = vi.fn().mockResolvedValue({
            torrents: [],
            removed: [1],
        });

        const hb = new HeartbeatManager(client);
        const debugSpy = vi
            .spyOn(console, "debug")
            .mockImplementation(() => {});

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

        // Run one tick which should process the delta
        await (hb as unknown as HeartbeatTickProbe).tick();

        // Ensure removed-quiet debug call occurred
        const calledWithRemovedQuiet = debugSpy.mock.calls.some(
            (c) => c[0] === "[tiny-torrent][heartbeat][removed-quiet]"
        );
        expect(calledWithRemovedQuiet).toBe(true);

        debugSpy.mockRestore();
        sub.unsubscribe();
    });
});
