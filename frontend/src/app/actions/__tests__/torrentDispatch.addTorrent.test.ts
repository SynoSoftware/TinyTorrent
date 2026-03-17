import { describe, expect, it, vi } from "vitest";
import { createTorrentDispatch } from "@/app/actions/torrentDispatch";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";

const createMockClient = (): EngineAdapter => ({
    getTorrents: vi.fn(async () => []),
    getTorrentDetails: vi.fn(async () => {
        throw new Error("not_used_in_this_test");
    }),
    getSessionStats: vi.fn(async () => ({
        downloadSpeed: 0,
        uploadSpeed: 0,
        torrentCount: 0,
        activeTorrentCount: 0,
        pausedTorrentCount: 0,
    })),
    addTorrent: vi.fn(async () => ({
        id: "added-id",
        rpcId: 1,
    })),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    verify: vi.fn(async () => {}),
    moveToTop: vi.fn(async () => {}),
    moveUp: vi.fn(async () => {}),
    moveDown: vi.fn(async () => {}),
    moveToBottom: vi.fn(async () => {}),
    updateFileSelection: vi.fn(async () => {}),
    subscribeToHeartbeat: vi.fn(() => ({
        unsubscribe: () => undefined,
    })),
    destroy: vi.fn(),
});

describe("torrentDispatch add-torrent", () => {
    it("passes paused and sequential flags when adding a torrent file", async () => {
        const client = createMockClient();
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.addTorrentFromFile(
                "base64-metainfo",
                "D:\\Downloads",
                true,
                [3],
                [1],
                [0, 2],
                [4],
                true,
            ),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(client.addTorrent).toHaveBeenCalledWith({
            metainfo: "base64-metainfo",
            downloadDir: "D:\\Downloads",
            paused: true,
            sequentialDownload: true,
            filesUnwanted: [3],
            priorityHigh: [1],
            priorityNormal: [0, 2],
            priorityLow: [4],
        });
        expect(client.verify).not.toHaveBeenCalled();
        expect(client.resume).not.toHaveBeenCalled();
    });

    it("passes paused and sequential flags when adding a magnet", async () => {
        const client = createMockClient();
        const dispatch = createTorrentDispatch({
            client,
            refreshTorrents: async () => {},
            refreshSessionStatsData: async () => {},
            refreshDetailData: async () => {},
        });

        const outcome = await dispatch(
            TorrentIntents.addMagnetTorrent(
                "magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567",
                "E:\\Media",
                false,
                true,
            ),
        );

        expect(outcome).toEqual({ status: "applied" });
        expect(client.addTorrent).toHaveBeenCalledWith({
            magnetLink:
                "magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567",
            paused: false,
            downloadDir: "E:\\Media",
            sequentialDownload: true,
        });
        expect(client.verify).not.toHaveBeenCalled();
        expect(client.resume).not.toHaveBeenCalled();
    });
});
