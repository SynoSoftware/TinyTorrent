import { it, expect } from "vitest";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";

type HeartbeatClientLike = {
    getTorrents: () => Promise<TorrentEntity[]>;
    getSessionStats: () => Promise<SessionStats>;
    getTorrentDetails: (id: string) => Promise<TorrentDetailEntity>;
};

type HeartbeatInternals = {
    MAX_DELTA_CYCLES: number;
    visibilityMultiplier: number;
    getIntervalForParams: (params: {
        mode: "background" | "table" | "detail";
        pollingIntervalMs?: number;
        onUpdate: () => void;
    }) => number;
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

it("clamps table polling to the detail heartbeat cadence inside the heartbeat owner", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals;

    const interval = hb.getIntervalForParams({
        mode: "table",
        pollingIntervalMs: 1,
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.detailMs);
});

it("keeps queued torrents on the fast table cadence", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals & {
        lastTorrents: TorrentEntity[];
    };
    hb.lastTorrents = [
        {
            id: "1",
            hash: "h-1",
            name: "queued",
            state: status.torrent.queued,
            speed: { down: 0, up: 0 },
            peerSummary: { connected: 0 },
            totalSize: 0,
            eta: 0,
            ratio: 0,
            uploaded: 0,
            downloaded: 0,
            added: Date.now(),
        },
    ];

    const interval = hb.getIntervalForParams({
        mode: "table",
        pollingIntervalMs: registry.timing.heartbeat.tableMs,
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.detailMs);
});

it("keeps live-transfer torrents on the fast cadence even if the state label lags", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals & {
        lastTorrents: TorrentEntity[];
    };
    hb.lastTorrents = [
        {
            id: "1",
            hash: "h-1",
            name: "uploading",
            state: status.torrent.queued,
            speed: { down: 0, up: 256 },
            peerSummary: { connected: 2 },
            totalSize: 0,
            eta: 0,
            ratio: 0,
            uploaded: 0,
            downloaded: 0,
            added: Date.now(),
        },
    ];

    const interval = hb.getIntervalForParams({
        mode: "table",
        pollingIntervalMs: registry.timing.heartbeat.tableMs,
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.detailMs);
});

it("keeps idle downloading torrents on the fast table cadence", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals & {
        lastTorrents: TorrentEntity[];
    };
    hb.lastTorrents = [
        {
            id: "1",
            hash: "h-1",
            name: "idle-downloading",
            state: status.torrent.downloading,
            speed: { down: 0, up: 0 },
            peerSummary: { connected: 0 },
            totalSize: 0,
            eta: 0,
            ratio: 0,
            uploaded: 0,
            downloaded: 0,
            added: Date.now(),
        },
    ];

    const interval = hb.getIntervalForParams({
        mode: "table",
        pollingIntervalMs: registry.timing.heartbeat.tableMs,
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.detailMs);
});

it("does not slow table cadence when document visibility is hidden", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals;
    hb.visibilityMultiplier = 15;

    const interval = hb.getIntervalForParams({
        mode: "table",
        pollingIntervalMs: registry.timing.heartbeat.tableMs,
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.tableMs);
});

it("still slows background cadence when document visibility is hidden", () => {
    const hb = new HeartbeatManager(fakeClient) as unknown as HeartbeatInternals;
    hb.visibilityMultiplier = 15;

    const interval = hb.getIntervalForParams({
        mode: "background",
        onUpdate: () => undefined,
    });

    expect(interval).toBe(registry.timing.heartbeat.backgroundMs * 15);
});
