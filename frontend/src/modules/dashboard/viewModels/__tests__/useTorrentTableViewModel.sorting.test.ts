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

describe("getInitialTorrentTableSorting", () => {
    beforeEach(() => {
        ensureStorage();
    });

    it("preserves an explicit queue-ascending sort from preferences", async () => {
        const { getInitialTorrentTableSorting } = await import("@/modules/dashboard/viewModels/useTorrentTableViewModel");
        const sorting = [{ id: "queue", desc: false }];

        expect(getInitialTorrentTableSorting(sorting)).toEqual(sorting);
    });

    it("falls back to the unsorted table state when nothing is persisted", async () => {
        const { getInitialTorrentTableSorting } = await import("@/modules/dashboard/viewModels/useTorrentTableViewModel");
        expect(getInitialTorrentTableSorting(undefined)).toEqual([]);
    });

    it("drops persisted sorting entries for removed columns", async () => {
        const { getInitialTorrentTableSorting } = await import("@/modules/dashboard/viewModels/useTorrentTableViewModel");

        expect(
            getInitialTorrentTableSorting([{ id: "health", desc: false }]),
        ).toEqual([]);
    });
});
