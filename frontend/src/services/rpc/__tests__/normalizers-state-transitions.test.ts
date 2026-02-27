import { describe, expect, it } from "vitest";
import { status } from "@/shared/status";
import { enforceStateTransition } from "@/services/rpc/normalizers";

describe("normalizer state transitions", () => {
    it("allows paused to checking transition", () => {
        expect(enforceStateTransition(status.torrent.paused, status.torrent.checking)).toBe(status.torrent.checking);
    });

    it("allows recheck transitions from generic error", () => {
        expect(enforceStateTransition(status.torrent.error, status.torrent.checking)).toBe(status.torrent.checking);
    });

    it("allows active torrents to enter checking for manual verify", () => {
        expect(enforceStateTransition(status.torrent.downloading, status.torrent.checking)).toBe(status.torrent.checking);
        expect(enforceStateTransition(status.torrent.seeding, status.torrent.checking)).toBe(status.torrent.checking);
        expect(enforceStateTransition(status.torrent.stalled, status.torrent.checking)).toBe(status.torrent.checking);
    });
});
