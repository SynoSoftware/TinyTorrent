import { describe, expect, it } from "vitest";
import { buildOptimisticStatusUpdatesForAction } from "@/app/domain/torrentActionPolicy";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample torrent",
        state: status.torrent.paused,
        ...overrides,
    }) as Torrent;

describe("torrentActionPolicy", () => {
    it("projects checking for paused -> recheck", () => {
        const updates = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({ state: status.torrent.paused }),
        ]);

        expect(updates).toEqual([
            { id: "torrent-1", state: status.torrent.checking },
        ]);
    });

    it("does not project resume while checking", () => {
        const updates = buildOptimisticStatusUpdatesForAction("resume", [
            makeTorrent({
                state: status.torrent.checking,
                verificationProgress: 0.42,
            }),
        ]);

        expect(updates).toEqual([]);
    });

    it("projects paused for downloading state", () => {
        const pauseProjection = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({ state: status.torrent.downloading }),
        ]);
        expect(pauseProjection).toEqual([
            { id: "torrent-1", state: status.torrent.paused },
        ]);
    });

    it("projects paused while checking-like", () => {
        const recheckProjection = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({ state: status.torrent.downloading }),
        ]);
        expect(recheckProjection).toEqual([
            { id: "torrent-1", state: status.torrent.checking },
        ]);

        const pauseProjection = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({
                state: status.torrent.checking,
                verificationProgress: 0.23,
            }),
        ]);
        expect(pauseProjection).toEqual([
            { id: "torrent-1", state: status.torrent.paused },
        ]);
    });

    it("skips no-op projections in mixed bulk actions", () => {
        const updates = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({ id: "paused", state: status.torrent.paused }),
            makeTorrent({ id: "checking", state: status.torrent.checking }),
            makeTorrent({ id: "seeding", state: status.torrent.seeding }),
        ]);

        expect(updates).toEqual([
            { id: "checking", state: status.torrent.paused },
            { id: "seeding", state: status.torrent.paused },
        ]);
    });

    it("returns no optimistic updates for non-optimistic actions", () => {
        const updates = buildOptimisticStatusUpdatesForAction("queue-move-top", [
            makeTorrent({ state: status.torrent.downloading }),
        ]);

        expect(updates).toEqual([]);
    });

    it("treats verification progress as checking-like for recheck no-op", () => {
        const updates = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({
                state: status.torrent.paused,
                verificationProgress: 0.11,
            }),
        ]);

        expect(updates).toEqual([]);
    });
});

