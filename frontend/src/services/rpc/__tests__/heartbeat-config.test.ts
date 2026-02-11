import { it, expect } from "vitest";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import { HeartbeatManager } from "@/services/rpc/heartbeat";

type HeartbeatClientLike = {
    getTorrents: () => Promise<TorrentEntity[]>;
    getSessionStats: () => Promise<SessionStats>;
    getTorrentDetails: (id: string) => Promise<TorrentDetailEntity>;
};

type HeartbeatInternals = {
    MAX_DELTA_CYCLES: number;
};

// Simple fake client sufficient for construction
const fakeClient: HeartbeatClientLike = {
    getTorrents: async () => [],
    getSessionStats: async () => ({
        downloadSpeed: 0,
        uploadSpeed: 0,
        torrentCount: 0,
        activeTorrentCount: 0,
        pausedTorrentCount: 0,
    }),
    getTorrentDetails: async (id: string) => ({
        id,
        hash: `h-${id}`,
        name: `torrent-${id}`,
        state: "paused",
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0 },
        totalSize: 0,
        eta: 0,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        added: Date.now(),
    }),
};

it("reads max_delta_cycles from config authority (via constructor)", () => {
    const hb = new HeartbeatManager(fakeClient);
    const v = (hb as unknown as HeartbeatInternals).MAX_DELTA_CYCLES;
    expect(typeof v).toBe("number");
    expect(v > 0).toBe(true);
});
