import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

type HeartbeatClientLike = {
    getTorrents: ReturnType<typeof vi.fn<() => Promise<TorrentEntity[]>>>;
    getSessionStats: ReturnType<typeof vi.fn<() => Promise<SessionStats>>>;
    getTorrentDetails: ReturnType<
        typeof vi.fn<(id: string) => Promise<TorrentDetailEntity>>
    >;
};

type HeartbeatInternals = {
    timerId?: number;
    isRunning: boolean;
};

const makeClient = (): HeartbeatClientLike => ({
    getTorrents: vi.fn<() => Promise<TorrentEntity[]>>().mockResolvedValue([]),
    getSessionStats: vi.fn<() => Promise<SessionStats>>().mockResolvedValue({
        downloadSpeed: 0,
        uploadSpeed: 0,
        torrentCount: 0,
        activeTorrentCount: 0,
        pausedTorrentCount: 0,
    }),
    getTorrentDetails: vi
        .fn<(id: string) => Promise<TorrentDetailEntity>>()
        .mockImplementation(async (id: string) => ({
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
        })),
});

describe("HeartbeatManager dispose()", () => {
    let removeSpy: ReturnType<typeof vi.spyOn> | undefined;
    let clearSpy: ReturnType<typeof vi.spyOn> | undefined;

    beforeEach(() => {
        removeSpy = vi.spyOn(document, "removeEventListener");
        clearSpy = vi.spyOn(window, "clearTimeout");
    });

    afterEach(() => {
        removeSpy?.mockRestore();
        clearSpy?.mockRestore();
        vi.restoreAllMocks();
    });

    it("cleans up resources on dispose", async () => {
        const client = makeClient();
        const manager = new HeartbeatManager(client);
        const managerInternals = manager as unknown as HeartbeatInternals;

        // Start a subscription so a timer is scheduled and a visibility
        // listener is registered during construction.
        const sub = manager.subscribe({
            mode: "table",
            pollingIntervalMs: 1000,
            onUpdate: () => {},
        });

        // Ensure a pending timer exists; some environments may not schedule
        // the timeout synchronously during subscribe, so create one if
        // absent to make the test deterministic.
        if (managerInternals.timerId === undefined) {
            managerInternals.timerId = window.setTimeout(() => {}, 10000);
        }

        manager.dispose();

        // removeEventListener should be called for visibilitychange
        expect(removeSpy).toHaveBeenCalledWith(
            "visibilitychange",
            expect.any(Function)
        );

        // clearTimeout should have been called to cancel pending timer
        expect(clearSpy).toHaveBeenCalled();

        // Internal state should reflect cleanup
        expect(managerInternals.timerId).toBeUndefined();
        expect(managerInternals.isRunning).toBe(false);

        sub.unsubscribe();
    });
});
