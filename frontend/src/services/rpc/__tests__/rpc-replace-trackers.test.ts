import { afterEach, describe, expect, it, vi } from "vitest";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";

type AdapterInternals = {
    resolveIds: (ids: string[]) => Promise<number[]>;
    mutate: (method: string, args: Record<string, unknown>) => Promise<void>;
};

describe("TransmissionAdapter.replaceTrackers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("skips mutation when tracker list is empty after normalization", async () => {
        const adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        const internals = adapter as unknown as AdapterInternals;
        const resolveIdsSpy = vi
            .spyOn(internals, "resolveIds")
            .mockResolvedValue([1]);
        const mutateSpy = vi.spyOn(internals, "mutate").mockResolvedValue();

        await adapter.replaceTrackers(["torrent-a"], [" ", "\t", ""]);

        expect(resolveIdsSpy).not.toHaveBeenCalled();
        expect(mutateSpy).not.toHaveBeenCalled();
    });

    it("mutates with normalized newline-separated tracker list", async () => {
        const adapter = new TransmissionAdapter({ endpoint: "http://localhost" });
        const internals = adapter as unknown as AdapterInternals;
        const resolveIdsSpy = vi
            .spyOn(internals, "resolveIds")
            .mockResolvedValue([42]);
        const mutateSpy = vi.spyOn(internals, "mutate").mockResolvedValue();

        await adapter.replaceTrackers(["torrent-b"], [
            " https://tracker-a/announce ",
            "",
            "https://tracker-b/announce",
        ]);

        expect(resolveIdsSpy).toHaveBeenCalledWith(["torrent-b"]);
        expect(mutateSpy).toHaveBeenCalledWith("torrent-set", {
            ids: [42],
            trackerList:
                "https://tracker-a/announce\nhttps://tracker-b/announce",
        });
    });
});

