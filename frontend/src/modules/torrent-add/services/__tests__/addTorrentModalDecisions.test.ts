import { describe, expect, it } from "vitest";
import {
    resolveAddTorrentDestinationDecision,
    resolveAddTorrentSubmissionDecision,
    resolveAddTorrentModalSize,
    resolveAddTorrentResolvedState,
} from "@/modules/torrent-add/services/addTorrentModalDecisions";

describe("add torrent modal decisions", () => {
    describe("resolved state slice", () => {
        it("resolves magnet without metadata as pending", () => {
            const state = resolveAddTorrentResolvedState({
                source: {
                    kind: "magnet",
                    label: "magnet",
                    magnetLink: "magnet:?xt=urn:btih:abc",
                    status: "resolving",
                },
                fileCount: 0,
            });

            expect(state).toBe("pending");
        });

        it("resolves file source with files as ready", () => {
            const state = resolveAddTorrentResolvedState({
                source: null,
                fileCount: 2,
            });

            expect(state).toBe("ready");
        });
    });

    describe("destination slice", () => {
        it("resolves gate and validation flags from one authority", () => {
            const decision = resolveAddTorrentDestinationDecision({
                destinationDecision: {
                    normalizedPath: "/data",
                    canProceed: false,
                    blockReason: "invalid",
                    blockMessageKey: "directory_browser.error",
                    validationReason: "validation_unavailable",
                    gauge: null,
                    availableSpaceBytes: null,
                },
                destinationValidation: {
                    status: "valid",
                    probeWarning: "free_space_unavailable",
                    hasValue: true,
                },
                destinationDraft: "",
                destinationGateCompleted: false,
                destinationGateTried: true,
            });

            expect(decision.activeDestination).toBe("/data");
            expect(decision.showDestinationGate).toBe(true);
            expect(decision.hasSpaceWarning).toBe(true);
            expect(decision.isDestinationGateRequiredError).toBe(true);
            expect(decision.isDestinationGateInvalidError).toBe(true);
        });
    });

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
