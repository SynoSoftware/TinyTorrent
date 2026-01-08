import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";

const makeClient = () => ({
    getTorrents: vi.fn().mockResolvedValue([]),
    getSessionStats: vi.fn().mockResolvedValue({} as any),
    getTorrentDetails: vi.fn().mockResolvedValue({} as any),
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
        const manager = new HeartbeatManager(client as any);

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
        if ((manager as any).timerId === undefined) {
            (manager as any).timerId = window.setTimeout(() => {}, 10000);
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
        expect((manager as any).timerId).toBeUndefined();
        expect((manager as any).isRunning).toBe(false);

        sub.unsubscribe();
    });
});
