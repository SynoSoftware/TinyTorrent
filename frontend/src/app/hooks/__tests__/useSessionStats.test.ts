import { beforeAll, describe, expect, it } from "vitest";

import type { SessionStats, TorrentEntity } from "@/services/rpc/entities";

let deriveLiveTransferRates: typeof import("@/app/hooks/useSessionStats").deriveLiveTransferRates;

beforeAll(async () => {
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    });
    ({ deriveLiveTransferRates } = await import("@/app/hooks/useSessionStats"));
});

const makeStats = (): SessionStats => ({
    downloadSpeed: 10,
    uploadSpeed: 20,
    torrentCount: 2,
    activeTorrentCount: 1,
    pausedTorrentCount: 1,
});

const makeTorrent = (
    id: string,
    down: number,
    up: number,
    isGhost = false,
): TorrentEntity => ({
    id,
    hash: `hash-${id}`,
    name: `torrent-${id}`,
    state: "paused",
    speed: { down, up },
    peerSummary: { connected: 0 },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    isGhost,
});

describe("deriveLiveTransferRates", () => {
    it("replaces session aggregate speeds with live torrent snapshot totals", () => {
        const stats = makeStats();

        const next = deriveLiveTransferRates(stats, [
            makeTorrent("1", 128, 32),
            makeTorrent("2", 64, 16),
        ]);

        expect(next.downloadSpeed).toBe(192);
        expect(next.uploadSpeed).toBe(48);
        expect(next.torrentCount).toBe(stats.torrentCount);
    });

    it("ignores ghost torrents when deriving visible transfer rates", () => {
        const stats = makeStats();

        const next = deriveLiveTransferRates(stats, [
            makeTorrent("1", 128, 32),
            makeTorrent("ghost", 500, 500, true),
        ]);

        expect(next.downloadSpeed).toBe(128);
        expect(next.uploadSpeed).toBe(32);
    });

    it("preserves session stats when no torrent snapshot is available", () => {
        const stats = makeStats();

        expect(deriveLiveTransferRates(stats, undefined)).toBe(stats);
        expect(deriveLiveTransferRates(stats, [])).toBe(stats);
    });
});
