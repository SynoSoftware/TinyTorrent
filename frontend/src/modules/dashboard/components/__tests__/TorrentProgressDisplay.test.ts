import { describe, expect, it } from "vitest";
import { getEffectiveProgress } from "@/modules/dashboard/components/TorrentProgressDisplay";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample torrent",
        state: status.torrent.paused,
        totalSize: 100,
        progress: 1,
        verificationProgress: undefined,
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0, sending: 0, getting: 0, seeds: 0 },
        eta: -1,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        added: 0,
        ...overrides,
    }) as Torrent;

describe("TorrentProgressDisplay helpers", () => {
    it("prefers verification progress while checking", () => {
        const progress = getEffectiveProgress(
            makeTorrent({
                state: status.torrent.checking,
                progress: 1,
                verificationProgress: 0.37,
            }),
        );

        expect(progress).toBe(0.37);
    });

    it("uses optimistic checking state for progress selection", () => {
        const progress = getEffectiveProgress(
            makeTorrent({
                state: status.torrent.paused,
                progress: 1,
                verificationProgress: 0.21,
            }),
            { state: status.torrent.checking },
        );

        expect(progress).toBe(0.21);
    });

    it("does not fall back to completed percent while checking without verification progress", () => {
        const progress = getEffectiveProgress(
            makeTorrent({
                state: status.torrent.checking,
                progress: 1,
                verificationProgress: undefined,
            }),
        );

        expect(progress).toBe(0);
    });

    it("does not fall back to completed percent for optimistic recheck before daemon progress arrives", () => {
        const progress = getEffectiveProgress(
            makeTorrent({
                state: status.torrent.paused,
                progress: 1,
                verificationProgress: undefined,
            }),
            { state: status.torrent.checking },
        );

        expect(progress).toBe(0);
    });
});
