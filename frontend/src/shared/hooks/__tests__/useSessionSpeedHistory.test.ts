import { beforeEach, describe, expect, it, vi } from "vitest";

import { registry } from "@/config/logic";

const { performance } = registry;

const clockState = vi.hoisted(() => ({
    subscriber: undefined as (() => void) | undefined,
    unsubscribe: vi.fn(),
}));

vi.mock("@/shared/hooks/useUiClock", () => ({
    subscribeUiClock: vi.fn((subscriber: () => void) => {
        clockState.subscriber = subscriber;
        return clockState.unsubscribe;
    }),
}));

describe("createSessionSpeedHistoryStore", () => {
    beforeEach(() => {
        clockState.subscriber = undefined;
        clockState.unsubscribe.mockReset();
    });

    it("advances history on UI clock ticks even when session stats stay flat", async () => {
        const { createSessionSpeedHistoryStore } = await import(
            "@/shared/hooks/useSessionSpeedHistory"
        );

        const store = createSessionSpeedHistoryStore();
        const detach = store.attachFeedOwner();

        store.setStats({
            downloadSpeed: 512,
            uploadSpeed: 128,
            torrentCount: 1,
            activeTorrentCount: 1,
            pausedTorrentCount: 0,
        });

        expect(clockState.subscriber).toBeTypeOf("function");
        expect(store.getSnapshot().down.at(-1)).toBe(0);
        expect(store.getSnapshot().up.at(-1)).toBe(0);

        clockState.subscriber?.();

        const firstTick = store.getSnapshot();
        expect(firstTick.down).toHaveLength(performance.historyDataPoints);
        expect(firstTick.up).toHaveLength(performance.historyDataPoints);
        expect(firstTick.down.at(-1)).toBe(512);
        expect(firstTick.up.at(-1)).toBe(128);
        expect(firstTick.down.at(-2)).toBe(0);
        expect(firstTick.up.at(-2)).toBe(0);

        clockState.subscriber?.();

        const secondTick = store.getSnapshot();
        expect(secondTick.down.at(-1)).toBe(512);
        expect(secondTick.up.at(-1)).toBe(128);
        expect(secondTick.down.at(-2)).toBe(512);
        expect(secondTick.up.at(-2)).toBe(128);

        detach();

        expect(clockState.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
