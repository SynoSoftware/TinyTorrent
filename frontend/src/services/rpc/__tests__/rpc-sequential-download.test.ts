import { afterEach, describe, expect, it, vi } from "vitest";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import { resetTransportSessionRuntimeOwner } from "@/services/transport";

type AdapterInternals = {
    handshakeState: "idle" | "handshaking" | "ready" | "invalid";
    idMap: Map<string, number>;
    sessionId: string;
    sessionSettingsCache?: {
        version?: string;
        "rpc-version-semver"?: string;
        "sequential_download"?: boolean;
        "torrent_added_verify_mode"?: "fast" | "full";
        "torrent_complete_verify_enabled"?: boolean;
    };
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

describe("TransmissionAdapter sequential download support", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetTransportSessionRuntimeOwner();
    });

    it("detects sequential download support from rpc-version-semver", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    result: "success",
                    arguments: {
                        "rpc-version-semver": "6.0.0",
                        version: "4.0.0-dev (test)",
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );
        const adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        primeAdapterSession(adapter);

        const engineInfo = await adapter.detectEngine();

        expect(engineInfo.capabilities.sequentialDownload).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("uses sequential_download when mutating a torrent", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        result: "success",
                        arguments: {
                            "rpc-version-semver": "6.0.0",
                        },
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

        await adapter.setSequentialDownload("hash-1", true);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [, init] = fetchSpy.mock.calls[1] as [unknown, RequestInit];
        const body = JSON.parse(String(init.body)) as {
            method: string;
            arguments: Record<string, unknown>;
        };
        expect(body.method).toBe("torrent-set");
        expect(body.arguments).toMatchObject({
            ids: [7],
            sequential_download: true,
        });
        expect(body.arguments).not.toHaveProperty("sequentialDownload");
    });

    it("normalizes snake_case sequential download from torrent-get", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    result: "success",
                    arguments: {
                        torrents: [
                            {
                                id: 7,
                                hashString: "hash-1",
                                name: "Torrent 1",
                                totalSize: 100,
                                percentDone: 0.5,
                                status: 4,
                                rateDownload: 10,
                                rateUpload: 0,
                                peersConnected: 1,
                                eta: 60,
                                addedDate: 1,
                                uploadRatio: 0,
                                uploadedEver: 0,
                                downloadedEver: 50,
                                sequential_download: true,
                            },
                        ],
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );
        const adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        primeAdapterSession(adapter);

        const torrents = await adapter.getTorrents();

        expect(torrents).toHaveLength(1);
        expect(torrents[0]?.sequentialDownload).toBe(true);
    });

    it("drops unsupported session settings at the adapter boundary", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
        internals.sessionSettingsCache = {
            version: "4.0.0",
            "rpc-version-semver": "4.0.0",
        };

        await adapter.updateSessionSettings({
            "sequential_download": true,
            "torrent_added_verify_mode": "full",
            "torrent_complete_verify_enabled": true,
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
