import { describe, expect, it } from "vitest";
import STATUS from "@/shared/status";
import { enforceStateTransition } from "@/services/rpc/normalizers";

describe("normalizer state transitions", () => {
    it("allows paused to checking transition", () => {
        expect(enforceStateTransition(STATUS.torrent.PAUSED, STATUS.torrent.CHECKING)).toBe(STATUS.torrent.CHECKING);
    });

    it("allows recheck transitions from generic error", () => {
        expect(enforceStateTransition(STATUS.torrent.ERROR, STATUS.torrent.CHECKING)).toBe(STATUS.torrent.CHECKING);
    });

    it("allows active torrents to enter checking for manual verify", () => {
        expect(enforceStateTransition(STATUS.torrent.DOWNLOADING, STATUS.torrent.CHECKING)).toBe(STATUS.torrent.CHECKING);
        expect(enforceStateTransition(STATUS.torrent.SEEDING, STATUS.torrent.CHECKING)).toBe(STATUS.torrent.CHECKING);
        expect(enforceStateTransition(STATUS.torrent.STALLED, STATUS.torrent.CHECKING)).toBe(STATUS.torrent.CHECKING);
    });
});
