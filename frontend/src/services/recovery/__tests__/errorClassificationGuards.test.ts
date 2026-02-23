import { describe, expect, it } from "vitest";
import STATUS from "@/shared/status";
import {
    isActionableRecoveryErrorClass,
    shouldUseRecoveryGateForResume,
} from "@/services/recovery/errorClassificationGuards";

describe("errorClassificationGuards", () => {
    it("treats unknown and localError as actionable recovery classes", () => {
        expect(isActionableRecoveryErrorClass("unknown")).toBe(true);
        expect(isActionableRecoveryErrorClass("localError")).toBe(true);
        expect(isActionableRecoveryErrorClass("missingFiles")).toBe(true);
    });

    it("routes paused unknown-error torrents through the recovery gate", () => {
        expect(
            shouldUseRecoveryGateForResume({
                state: STATUS.torrent.PAUSED,
                errorEnvelope: { errorClass: "unknown" },
            }),
        ).toBe(true);
    });

    it("does not route active torrents through the gate when only unknown error metadata is present", () => {
        expect(
            shouldUseRecoveryGateForResume({
                state: STATUS.torrent.DOWNLOADING,
                errorEnvelope: { errorClass: "unknown" },
            }),
        ).toBe(false);
    });
});
