import { afterEach, describe, expect, it, vi } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

type HeartbeatClientLike = {
    getTorrents: ReturnType<typeof vi.fn<() => Promise<TorrentEntity[]>>>;
    getSessionStats: ReturnType<typeof vi.fn<() => Promise<SessionStats>>>;
    getTorrentDetails: ReturnType<
        typeof vi.fn<(id: string) => Promise<TorrentDetailEntity>>
    >;
};

type HeartbeatInternals = {
    isRunning: boolean;
    immediateTickPending: boolean;
};

const dummyStats: SessionStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    torrentCount: 1,
    activeTorrentCount: 1,
    pausedTorrentCount: 0,
};

const makeTorrent = (id = "torrent-1"): TorrentEntity => ({
    id,
    hash: `hash-${id}`,
    name: id,
    state: "downloading",
    speed: { down: 128, up: 32 },
    peerSummary: { connected: 2 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: Date.now(),
});

const createDeferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error("timeout waiting for condition");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe("HeartbeatManager resume coalescing", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("coalesces visible resume signals into one catch-up tick while a tick is already in flight", async () => {
        let hidden = true;
        const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
            Document.prototype,
            "hidden"
        );
        Object.defineProperty(document, "hidden", {
            configurable: true,
            get: () => hidden,
        });

        const firstFetch = createDeferred<TorrentEntity[]>();
        const client: HeartbeatClientLike = {
            getTorrents: vi
                .fn<() => Promise<TorrentEntity[]>>()
                .mockImplementationOnce(() => firstFetch.promise)
                .mockResolvedValue([makeTorrent()]),
            getSessionStats: vi
                .fn<() => Promise<SessionStats>>()
                .mockResolvedValue(dummyStats),
            getTorrentDetails: vi
                .fn<(id: string) => Promise<TorrentDetailEntity>>()
                .mockImplementation(async (id) => makeTorrent(id)),
        };

        const manager = new HeartbeatManager(client);
        const internals = manager as unknown as HeartbeatInternals;
        const subscription = manager.subscribe({
            mode: "table",
            pollingIntervalMs: 60_000,
            onUpdate: () => undefined,
        });

        try {
            await waitFor(() => client.getTorrents.mock.calls.length === 1);
            await waitFor(() => internals.isRunning);

            hidden = false;
            document.dispatchEvent(new Event("visibilitychange"));
            window.dispatchEvent(new Event("focus"));

            expect(client.getTorrents).toHaveBeenCalledTimes(1);
            expect(internals.immediateTickPending).toBe(true);

            firstFetch.resolve([makeTorrent()]);

            await waitFor(() => client.getTorrents.mock.calls.length === 2);
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(client.getTorrents).toHaveBeenCalledTimes(2);
        } finally {
            subscription.unsubscribe();
            manager.dispose();
            if (originalHiddenDescriptor) {
                Object.defineProperty(
                    Document.prototype,
                    "hidden",
                    originalHiddenDescriptor
                );
            }
            Reflect.deleteProperty(document as object, "hidden");
        }
    });
});
