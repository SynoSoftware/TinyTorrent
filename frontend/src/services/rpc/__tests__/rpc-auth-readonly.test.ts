import { afterEach, describe, expect, it, vi } from "vitest";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import { resetTransportSessionRuntimeOwner } from "@/services/transport";

type AdapterWithTransport = {
    transport: {
        setSessionId: (token: string | null | undefined) => void;
    };
};

describe("TransmissionAdapter auth propagation", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetTransportSessionRuntimeOwner();
    });

    it("includes Authorization on read-only RPCs sent via transport", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(
                new Response(
                    JSON.stringify({
                        result: "success",
                        arguments: {
                            activeTorrentCount: 0,
                            downloadSpeed: 0,
                            pausedTorrentCount: 0,
                            torrentCount: 0,
                            uploadSpeed: 0,
                            cumulativeStats: {
                                uploadedBytes: 0,
                                downloadedBytes: 0,
                                filesAdded: 0,
                                secondsActive: 0,
                                sessionCount: 0,
                            },
                            currentStats: {
                                uploadedBytes: 0,
                                downloadedBytes: 0,
                                filesAdded: 0,
                                secondsActive: 0,
                                sessionCount: 0,
                            },
                        },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );

        const adapter = new TransmissionAdapter({
            endpoint: "http://localhost",
            username: "alice",
            password: "secret",
        });
        const adapterWithTransport = adapter as unknown as AdapterWithTransport;
        adapterWithTransport.transport.setSessionId("session-token");

        await adapter.getSessionStats();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, requestInit] = fetchSpy.mock.calls[0] as [unknown, RequestInit];
        const headers = requestInit.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Basic ${btoa("alice:secret")}`);
    });
});
