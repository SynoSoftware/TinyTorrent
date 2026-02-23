import { describe, expect, it } from "vitest";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import STATUS from "@/shared/status";
import {
    canTriggerDownloadMissingAction,
} from "@/modules/dashboard/utils/recoveryEligibility";
import { getEffectiveRecoveryState } from "@/modules/dashboard/utils/recoveryState";

const makeTorrent = (overrides?: Partial<Torrent>): Torrent => ({
    id: "torrent-a",
    hash: "hash-a",
    name: "A",
    state: STATUS.torrent.PAUSED,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    ...overrides,
});

const classificationWithDownloadMissing: MissingFilesClassification = {
    kind: "dataGap",
    confidence: "likely",
    recommendedActions: ["downloadMissing", "openFolder"],
};

const classificationWithoutDownloadMissing: MissingFilesClassification = {
    kind: "volumeLoss",
    confidence: "likely",
    recommendedActions: ["retry", "locate"],
};

describe("recoveryEligibility", () => {
    it("prefers non-ok recovery state over torrent state", () => {
        const torrent = makeTorrent({
            state: STATUS.torrent.PAUSED,
            errorEnvelope: {
                errorClass: "missingFiles",
                errorMessage: null,
                lastErrorAt: null,
                recoveryState: "needsUserAction",
                recoveryActions: [],
            },
        });
        expect(getEffectiveRecoveryState(torrent)).toBe("needsUserAction");
    });

    it("allows download-missing when classification recommends it", () => {
        const torrent = makeTorrent();
        expect(
            canTriggerDownloadMissingAction(
                torrent,
                classificationWithDownloadMissing,
            ),
        ).toBe(true);
    });

    it("allows download-missing fallback for missing-files state without classification", () => {
        const torrent = makeTorrent({
            state: STATUS.torrent.MISSING_FILES,
        });
        expect(canTriggerDownloadMissingAction(torrent, null)).toBe(true);
    });

    it("blocks download-missing when classification does not recommend it and no missing-files signal exists", () => {
        const torrent = makeTorrent({
            state: STATUS.torrent.ERROR,
            errorEnvelope: {
                errorClass: "permissionDenied",
                errorMessage: "access denied",
                lastErrorAt: null,
                recoveryState: "needsUserAction",
                recoveryActions: [],
            },
        });
        expect(
            canTriggerDownloadMissingAction(
                torrent,
                classificationWithoutDownloadMissing,
            ),
        ).toBe(false);
    });
});
