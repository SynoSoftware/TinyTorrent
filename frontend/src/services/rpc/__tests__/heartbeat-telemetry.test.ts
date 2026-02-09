import { describe, expect, it, vi } from "vitest";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";
import STATUS from "@/shared/status";

const dummyStats: SessionStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 1,
    activeTorrentCount: 1,
    pausedTorrentCount: 0,
};

const waitForSnapshot = async (updates: unknown[], targetLength = 1) => {
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout waiting for heartbeat")), 2000);
        const interval = setInterval(() => {
            if (updates.length >= targetLength) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
            }
        }, 10);
    });
};

type HeartbeatInternals = {
    tick: () => Promise<void>;
    getSpeedHistory: (id: string) => { down: number[]; up: number[] };
    lastTorrents?: TorrentEntity[];
};

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

function makeTorrent(overrides: Partial<TorrentEntity> = {}): TorrentEntity {
    const base: TorrentEntity = {
        id: overrides.id ?? "torrent-1",
        hash: overrides.hash ?? "torrent-hash-1",
        name: "torrent-1",
        progress: 0,
        state: overrides.state ?? STATUS.torrent.DOWNLOADING,
        verificationProgress: undefined,
        speed: overrides.speed ?? { down: 0, up: 0 },
        peerSummary: {
            connected: overrides.peerSummary?.connected ?? 0,
            total: overrides.peerSummary?.total ?? 0,
            sending: overrides.peerSummary?.sending ?? 0,
            getting: overrides.peerSummary?.getting ?? 0,
            seeds: overrides.peerSummary?.seeds ?? 0,
        },
        totalSize: 0,
        eta: 0,
        queuePosition: 0,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        leftUntilDone: 0,
        sizeWhenDone: 0,
        error: 0,
        errorString: undefined,
        isFinished: false,
        sequentialDownload: false,
        superSeeding: false,
        added: 0,
        savePath: overrides.savePath ?? "/tmp",
        rpcId: overrides.rpcId ?? 1,
        errorEnvelope: undefined,
    };
    return { ...base, ...overrides };
}

describe("Heartbeat telemetry", () => {
    it("applies recently-active summary updates to torrent speeds", async () => {
        const torrent = makeTorrent({
            id: "torrent-1",
            hash: "hash-1",
            rpcId: 11,
            state: STATUS.torrent.DOWNLOADING,
            speed: { down: 0, up: 0 },
        });
        const updatedTorrent = makeTorrent({
            ...torrent,
            speed: { down: 512, up: 128 },
            progress: 0.25,
        });

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([torrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(torrent),
            getRecentlyActive: vi
                .fn<
                    () => Promise<{
                        torrents: TorrentEntity[];
                        removed?: number[];
                    }>
                >()
                .mockResolvedValue({
                torrents: [updatedTorrent],
                removed: [],
            }),
        };

        const updates: HeartbeatPayload[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
        });
        await waitForSnapshot(updates);

        expect(updates[0]).toBeDefined();
        await hbInternals.tick();

        expect(client.getRecentlyActive).toHaveBeenCalled();
        const last = hbInternals.lastTorrents?.[0];
        expect(last?.speed?.down).toBe(512);
        const history = hbInternals.getSpeedHistory(last!.id);
        expect(history.down[history.down.length - 1]).toBe(512);

        sub.unsubscribe();
    });

    it("resets speed to zero when recently-active reports a pause", async () => {
        const torrent = makeTorrent({
            id: "torrent-2",
            hash: "hash-2",
            rpcId: 22,
            state: STATUS.torrent.DOWNLOADING,
            speed: { down: 128, up: 0 },
        });
        const pausedTorrent = makeTorrent({
            ...torrent,
            state: STATUS.torrent.PAUSED,
            speed: { down: 0, up: 0 },
        });

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([torrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(torrent),
            getRecentlyActive: vi
                .fn<
                    () => Promise<{
                        torrents: TorrentEntity[];
                        removed?: number[];
                    }>
                >()
                .mockResolvedValue({
                torrents: [pausedTorrent],
                removed: [],
            }),
        };

        const updates: HeartbeatPayload[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
        });
        await waitForSnapshot(updates);

        await hbInternals.tick();

        const last = hbInternals.lastTorrents?.[0];
        expect(last?.state).toBe(STATUS.torrent.PAUSED);
        expect(last?.speed?.down).toBe(0);

        const history = hbInternals.getSpeedHistory(last!.id);
        expect(history.down[history.down.length - 1]).toBe(0);

        sub.unsubscribe();
    });

    it("cleans up speed history when a torrent is removed", async () => {
        const torrent = makeTorrent({
            id: "to-remove",
            hash: "hash-remove",
            rpcId: 99,
            state: STATUS.torrent.DOWNLOADING,
            speed: { down: 64, up: 0 },
        });
        const removedRpcId = torrent.rpcId ?? 99;

        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockResolvedValue([torrent]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockResolvedValue(torrent),
            getRecentlyActive: vi
                .fn<
                    () => Promise<{
                        torrents: TorrentEntity[];
                        removed?: number[];
                    }>
                >()
                .mockResolvedValue({ torrents: [], removed: [removedRpcId] }),
        };

        const updates: HeartbeatPayload[] = [];
        const hb = new HeartbeatManager(client);
        const hbInternals = hb as unknown as HeartbeatInternals;
        const sub = hb.subscribe({
            mode: "table",
            onUpdate: (p) => updates.push(p),
        });
        await waitForSnapshot(updates);

        const before = hbInternals.getSpeedHistory(torrent.id);
        expect(before.down[before.down.length - 1]).toBe(64);

        await hbInternals.tick();
        const after = hbInternals.getSpeedHistory(torrent.id);
        expect(after.down.every((value: number) => value === 0)).toBe(true);

        sub.unsubscribe();
    });
});
