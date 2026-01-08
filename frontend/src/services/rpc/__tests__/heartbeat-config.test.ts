import { it, expect } from "vitest";
import { HeartbeatManager } from "@/services/rpc/heartbeat";

// Simple fake client sufficient for construction
const fakeClient = {
    getTorrents: async () => [],
    getSessionStats: async () => ({} as any),
    getTorrentDetails: async (_id: string) => ({} as any),
};

it("reads max_delta_cycles from CONFIG (via constructor)", () => {
    const hb = new HeartbeatManager(fakeClient as any);
    const v = (hb as any).MAX_DELTA_CYCLES;
    expect(typeof v).toBe("number");
    expect(v > 0).toBe(true);
});
