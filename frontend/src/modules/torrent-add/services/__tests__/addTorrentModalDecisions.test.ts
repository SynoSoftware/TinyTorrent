import { describe, expect, it } from "vitest";
import {
    resolveAddTorrentSubmissionDecision,
    resolveAddTorrentModalSize,
} from "@/modules/torrent-add/services/addTorrentModalDecisions";

describe("add torrent modal decisions", () => {
    describe("submission slice", () => {
        it("allows confirmation only when all gating conditions pass", () => {
            const decision = resolveAddTorrentSubmissionDecision({
                isSelectionEmpty: false,
                isDestinationValid: true,
                resolvedState: "ready",
            });

            expect(decision.canConfirm).toBe(true);
        });

        it("blocks confirmation when destination is invalid", () => {
            const decision = resolveAddTorrentSubmissionDecision({
                isSelectionEmpty: false,
                isDestinationValid: false,
                resolvedState: "ready",
            });

            expect(decision.canConfirm).toBe(false);
        });
    });

    describe("layout slice", () => {
        it("resolves modal size from gate and fullscreen decisions", () => {
            expect(
                resolveAddTorrentModalSize({
                    showDestinationGate: true,
                    isFullscreen: false,
                }),
            ).toBe("lg");
            expect(
                resolveAddTorrentModalSize({
                    showDestinationGate: false,
                    isFullscreen: true,
                }),
            ).toBe("full");
            expect(
                resolveAddTorrentModalSize({
                    showDestinationGate: false,
                    isFullscreen: false,
                }),
            ).toBe("5xl");
        });
    });
});
