import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDestinationRootProbeCache } from "@/shared/domain/destinationRootProbeCache";

describe("destination root probe cache", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reuses successful probe results within ttl for same epoch", async () => {
        const cache = createDestinationRootProbeCache({
            successTtlMs: 1000,
            errorTtlMs: 200,
        });
        const checkFreeSpace = vi
            .fn()
            .mockResolvedValue({
                path: "C:\\",
                sizeBytes: 1024,
            });

        const first = await cache.resolve({
            probeRoot: "C:\\",
            checkFreeSpace,
            epoch: 1,
        });
        const second = await cache.resolve({
            probeRoot: "C:\\",
            checkFreeSpace,
            epoch: 1,
        });

        expect(checkFreeSpace).toHaveBeenCalledTimes(1);
        expect(first).toEqual({
            ok: true,
            freeSpace: {
                path: "C:\\",
                sizeBytes: 1024,
            },
        });
        expect(second).toEqual(first);
    });

    it("invalidates cached results after ttl expires", async () => {
        const cache = createDestinationRootProbeCache({
            successTtlMs: 1000,
            errorTtlMs: 200,
        });
        const checkFreeSpace = vi
            .fn()
            .mockResolvedValue({
                path: "D:\\",
                sizeBytes: 2048,
            });

        await cache.resolve({
            probeRoot: "D:\\",
            checkFreeSpace,
            epoch: 1,
        });
        vi.advanceTimersByTime(1001);
        await cache.resolve({
            probeRoot: "D:\\",
            checkFreeSpace,
            epoch: 1,
        });

        expect(checkFreeSpace).toHaveBeenCalledTimes(2);
    });

    it("invalidates cached results when epoch changes", async () => {
        const cache = createDestinationRootProbeCache({
            successTtlMs: 1000,
            errorTtlMs: 200,
        });
        const checkFreeSpace = vi
            .fn()
            .mockResolvedValue({
                path: "E:\\",
                sizeBytes: 4096,
            });

        await cache.resolve({
            probeRoot: "E:\\",
            checkFreeSpace,
            epoch: 1,
        });
        await cache.resolve({
            probeRoot: "E:\\",
            checkFreeSpace,
            epoch: 2,
        });

        expect(checkFreeSpace).toHaveBeenCalledTimes(2);
    });

    it("caches root errors with error ttl", async () => {
        const cache = createDestinationRootProbeCache({
            successTtlMs: 1000,
            errorTtlMs: 200,
        });
        const checkFreeSpace = vi.fn().mockRejectedValue(new Error("offline"));

        const first = await cache.resolve({
            probeRoot: "Z:\\",
            checkFreeSpace,
            epoch: 1,
        });
        const second = await cache.resolve({
            probeRoot: "Z:\\",
            checkFreeSpace,
            epoch: 1,
        });

        expect(checkFreeSpace).toHaveBeenCalledTimes(1);
        expect(first).toEqual({
            ok: false,
            reason: "root_unreachable",
        });
        expect(second).toEqual(first);
    });
});
