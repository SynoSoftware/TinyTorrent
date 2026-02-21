import { describe, expect, it } from "vitest";
import { buildOptimisticStatusUpdatesForAction } from "@/app/domain/torrentActionPolicy";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import STATUS from "@/shared/status";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent =>
    ({
        id: "torrent-1",
        hash: "hash-1",
        name: "Sample torrent",
        state: STATUS.torrent.PAUSED,
        ...overrides,
    }) as Torrent;

describe("torrentActionPolicy", () => {
    it("projects checking for paused -> recheck", () => {
        const updates = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({ state: STATUS.torrent.PAUSED }),
        ]);

        expect(updates).toEqual([
            { id: "torrent-1", state: STATUS.torrent.CHECKING },
        ]);
    });

    it("does not project resume while checking", () => {
        const updates = buildOptimisticStatusUpdatesForAction("resume", [
            makeTorrent({
                state: STATUS.torrent.CHECKING,
                verificationProgress: 0.42,
            }),
        ]);

        expect(updates).toEqual([]);
    });

    it("projects paused for downloading state", () => {
        const pauseProjection = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({ state: STATUS.torrent.DOWNLOADING }),
        ]);
        expect(pauseProjection).toEqual([
            { id: "torrent-1", state: STATUS.torrent.PAUSED },
        ]);
    });

    it("projects paused while checking-like", () => {
        const recheckProjection = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({ state: STATUS.torrent.DOWNLOADING }),
        ]);
        expect(recheckProjection).toEqual([
            { id: "torrent-1", state: STATUS.torrent.CHECKING },
        ]);

        const pauseProjection = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({
                state: STATUS.torrent.CHECKING,
                verificationProgress: 0.23,
            }),
        ]);
        expect(pauseProjection).toEqual([
            { id: "torrent-1", state: STATUS.torrent.PAUSED },
        ]);
    });

    it("skips no-op projections in mixed bulk actions", () => {
        const updates = buildOptimisticStatusUpdatesForAction("pause", [
            makeTorrent({ id: "paused", state: STATUS.torrent.PAUSED }),
            makeTorrent({ id: "checking", state: STATUS.torrent.CHECKING }),
            makeTorrent({ id: "seeding", state: STATUS.torrent.SEEDING }),
        ]);

        expect(updates).toEqual([
            { id: "checking", state: STATUS.torrent.PAUSED },
            { id: "seeding", state: STATUS.torrent.PAUSED },
        ]);
    });

    it("returns no optimistic updates for non-optimistic actions", () => {
        const updates = buildOptimisticStatusUpdatesForAction("queue-move-top", [
            makeTorrent({ state: STATUS.torrent.DOWNLOADING }),
        ]);

        expect(updates).toEqual([]);
    });

    it("treats verification progress as checking-like for recheck no-op", () => {
        const updates = buildOptimisticStatusUpdatesForAction("recheck", [
            makeTorrent({
                state: STATUS.torrent.PAUSED,
                verificationProgress: 0.11,
            }),
        ]);

        expect(updates).toEqual([]);
    });
});
