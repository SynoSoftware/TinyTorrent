import { describe, expect, it } from "vitest";
import STATUS from "@/shared/status";
import { enforceStateTransition } from "@/services/rpc/normalizers";

describe("normalizer state transitions", () => {
    it("allows missing-files recovery transitions", () => {
        expect(
            enforceStateTransition(
                STATUS.torrent.MISSING_FILES,
                STATUS.torrent.CHECKING,
            ),
        ).toBe(STATUS.torrent.CHECKING);
        expect(
            enforceStateTransition(
                STATUS.torrent.MISSING_FILES,
                STATUS.torrent.DOWNLOADING,
            ),
        ).toBe(STATUS.torrent.DOWNLOADING);
        expect(
            enforceStateTransition(
                STATUS.torrent.MISSING_FILES,
                STATUS.torrent.SEEDING,
            ),
        ).toBe(STATUS.torrent.SEEDING);
    });

    it("allows recheck transitions from generic error", () => {
        expect(
            enforceStateTransition(
                STATUS.torrent.ERROR,
                STATUS.torrent.CHECKING,
            ),
        ).toBe(STATUS.torrent.CHECKING);
    });
});
