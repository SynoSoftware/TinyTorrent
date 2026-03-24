import { beforeEach, describe, expect, it } from "vitest";

const ensureStorage = () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
            clear: () => {
                store.clear();
            },
        },
        configurable: true,
    });
};

describe("getContextMenuTorrent", () => {
    beforeEach(() => {
        ensureStorage();
    });

    it("resolves the context menu torrent from the current display list", async () => {
        const { getContextMenuTorrent } = await import("@/modules/dashboard/viewModels/useTorrentTableViewModel");
        const contextMenu = {
            virtualElement: {
                getBoundingClientRect: () => new DOMRect(),
            } as never,
            torrentId: "torrent-1",
            torrentHash: "hash-1",
        };

        expect(
            getContextMenuTorrent(contextMenu, [
                {
                    id: "torrent-1",
                    hash: "hash-1",
                    name: "Torrent",
                    sequentialDownload: true,
                },
            ] as never)?.sequentialDownload,
        ).toBe(true);
    });

    it("returns null when the menu target no longer exists", async () => {
        const { getContextMenuTorrent } = await import("@/modules/dashboard/viewModels/useTorrentTableViewModel");
        const contextMenu = {
            virtualElement: {
                getBoundingClientRect: () => new DOMRect(),
            } as never,
            torrentId: "missing",
            torrentHash: "missing",
        };

        expect(
            getContextMenuTorrent(contextMenu, []),
        ).toBeNull();
    });
});
