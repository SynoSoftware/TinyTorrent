import { afterEach, describe, expect, it, vi } from "vitest";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import { resetTransportSessionRuntimeOwner } from "@/services/transport";

type AdapterInternals = {
    handshakeState: "idle" | "handshaking" | "ready" | "invalid";
    idMap: Map<string, number>;
    sessionId: string;
    transport: {
        setSessionId: (token: string | null | undefined) => void;
    };
};

const primeAdapterSession = (adapter: TransmissionAdapter) => {
    const internals = adapter as unknown as AdapterInternals;
    internals.sessionId = "session-token";
    internals.handshakeState = "ready";
    internals.transport.setSessionId("session-token");
    return internals;
};

describe("TransmissionAdapter file wanted RPC", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetTransportSessionRuntimeOwner();
    });

    it("maps wanted toggles to Transmission files-wanted/files-unwanted RPC args", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        result: "success",
                        arguments: {},
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        result: "success",
                        arguments: {},
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        const adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        const internals = primeAdapterSession(adapter);
        internals.idMap.set("hash-1", 7);

        await adapter.updateFileSelection("hash-1", [0, 1], true);
        await adapter.updateFileSelection("hash-1", [2, 3], false);

        expect(fetchSpy).toHaveBeenCalledTimes(2);

        const calls = fetchSpy.mock.calls.map(([, init]) =>
            JSON.parse(String((init as RequestInit).body)) as {
                method: string;
                arguments: Record<string, unknown>;
            },
        );

        expect(calls[0]).toMatchObject({
            method: "torrent-set",
            arguments: {
                ids: [7],
                "files-wanted": [0, 1],
            },
        });
        expect(calls[1]).toMatchObject({
            method: "torrent-set",
            arguments: {
                ids: [7],
                "files-unwanted": [2, 3],
            },
        });
    });
});
