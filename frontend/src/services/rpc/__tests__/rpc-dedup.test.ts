import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";

type AdapterInternals = {
    sessionId: string;
};

describe("RPC Deduplication (in-flight coalescing)", () => {
    let adapter: TransmissionAdapter;

    beforeEach(() => {
        adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        // Prevent handshake attempts by faking a session id
        (adapter as unknown as AdapterInternals).sessionId = "test-session";
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("coalesces concurrent identical read requests into a single network call", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
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

        const schema = z.object({ torrents: z.array(z.unknown()) });

        // Fire three requests without awaiting
        const p1 = adapter.send(payload, schema);
        const p2 = adapter.send(payload, schema);
        const p3 = adapter.send(payload, schema);

        await Promise.all([p1, p2, p3]);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("sends a new request after the first resolves (no stale caching)", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
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

        const schema = z.object({ torrents: z.array(z.unknown()) });

        // First batch
        await adapter.send(payload, schema);
        // Second call after the first resolved
        await adapter.send(payload, schema);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
