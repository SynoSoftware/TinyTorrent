import { afterEach, describe, expect, it, vi } from "vitest";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import { normalizeTorrentDetail } from "@/services/rpc/normalizers";
import type { TransmissionTorrentDetail } from "@/services/rpc/types";
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

const makeDetail = (): TransmissionTorrentDetail => ({
    id: 7,
    hashString: "hash-1",
    name: "collection",
    totalSize: 4096,
    percentDone: 0.25,
    status: 4,
    rateDownload: 0,
    rateUpload: 0,
    peersConnected: 1,
    eta: 0,
    addedDate: 1,
    uploadRatio: 0,
    uploadedEver: 0,
    downloadedEver: 0,
    files: [
        {
            name: "high.mkv",
            length: 1024,
            bytesCompleted: 128,
        },
        {
            name: "normal.txt",
            length: 1024,
            bytesCompleted: 64,
        },
        {
            name: "low.bin",
            length: 2048,
            bytesCompleted: 32,
        },
    ],
    fileStats: [
        {
            wanted: true,
            priority: 1,
        },
        {
            wanted: true,
            priority: 0,
        },
        {
            wanted: true,
            priority: -1,
        },
    ],
    trackers: [],
    peers: [],
});

describe("TransmissionAdapter file priority RPC", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetTransportSessionRuntimeOwner();
    });

    it("maps UI priority bands to Transmission priority-high/normal/low RPC args", async () => {
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

        await adapter.setFilePriority("hash-1", [4], 7);
        await adapter.setFilePriority("hash-1", [5], 4);
        await adapter.setFilePriority("hash-1", [6], 1);

        expect(fetchSpy).toHaveBeenCalledTimes(3);

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
                "priority-high": [4],
            },
        });
        expect(calls[1]).toMatchObject({
            method: "torrent-set",
            arguments: {
                ids: [7],
                "priority-normal": [5],
            },
        });
        expect(calls[2]).toMatchObject({
            method: "torrent-set",
            arguments: {
                ids: [7],
                "priority-low": [6],
            },
        });
    });
});

describe("Transmission file priority normalization", () => {
    it("preserves Transmission's three priority tiers at the frontend boundary", () => {
        const normalized = normalizeTorrentDetail(makeDetail());

        expect(normalized.files).toMatchObject([
            {
                index: 0,
                priority: 7,
                wanted: true,
            },
            {
                index: 1,
                priority: 4,
                wanted: true,
            },
            {
                index: 2,
                priority: 1,
                wanted: true,
            },
        ]);
    });
});
