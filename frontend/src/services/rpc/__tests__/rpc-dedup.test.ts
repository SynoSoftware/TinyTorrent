import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";

describe("RPC Deduplication (in-flight coalescing)", () => {
    let adapter: TransmissionAdapter;

    beforeEach(() => {
        adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        // Prevent handshake attempts by faking a session id
        (adapter as any).sessionId = "test-session";
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("coalesces concurrent identical read requests into a single network call", async () => {
        const fetchSpy = vi
            .spyOn(globalThis as any, "fetch" as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    result: "success",
                    arguments: { torrents: [] },
                }),
            } as unknown as Response);

        const payload = {
            method: "torrent-get",
            arguments: { fields: ["id"], ids: [1] },
        };

        // Fire three requests without awaiting
        const p1 = (adapter as any).send(payload, z.any());
        const p2 = (adapter as any).send(payload, z.any());
        const p3 = (adapter as any).send(payload, z.any());

        await Promise.all([p1, p2, p3]);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("sends a new request after the first resolves (no stale caching)", async () => {
        const fetchSpy = vi
            .spyOn(globalThis as any, "fetch" as any)
            .mockResolvedValue({
                ok: true,
                json: async () => ({
                    result: "success",
                    arguments: { torrents: [] },
                }),
            } as unknown as Response);

        const payload = {
            method: "torrent-get",
            arguments: { fields: ["id"], ids: [1] },
        };

        // First batch
        await (adapter as any).send(payload, z.any());
        // Second call after the first resolved
        await (adapter as any).send(payload, z.any());

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
