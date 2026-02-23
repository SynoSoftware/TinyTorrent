import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { STATUS } from "@/shared/status";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";

const useResolvedRecoveryClassificationMock = vi.fn();

vi.mock("@heroui/react", () => ({
    Chip: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@/shared/ui/components/StatusIcon", () => ({
    default: () => React.createElement("i"),
}));

vi.mock("@/shared/utils/recoveryFormat", () => ({
    formatRecoveryStatus: () => "passive_status",
    formatRecoveryStatusFromClassification: () => "passive_status",
    formatRecoveryTooltip: () => "passive_tooltip",
}));

vi.mock("@/modules/dashboard/hooks/useResolvedRecoveryClassification", () => ({
    useResolvedRecoveryClassification: (...args: unknown[]) =>
        useResolvedRecoveryClassificationMock(...args),
}));

vi.mock("@/modules/dashboard/components/TorrentTable_MissingFilesStatusCell", () => ({
    TorrentTable_MissingFilesStatusCell: () =>
        React.createElement("div", { "data-testid": "missing-cell" }, "missing"),
}));

const BASE_TORRENT: Torrent = {
    id: "torrent-a",
    hash: "hash-a",
    name: "A",
    state: STATUS.torrent.ERROR,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    errorEnvelope: {
        errorClass: "missingFiles",
        errorMessage: "missing",
        lastErrorAt: Date.now(),
        recoveryState: "transientWaiting",
        recoveryActions: [],
    },
};

const buildClassification = (
    kind: MissingFilesClassification["kind"],
): MissingFilesClassification => ({
    kind,
    confidence: "likely",
    recommendedActions: [],
});

describe("TorrentTable_StatusCell", () => {
    beforeEach(() => {
        useResolvedRecoveryClassificationMock.mockReset();
    });

    it("keeps passive recovery rendering identical across classification kinds", () => {
        useResolvedRecoveryClassificationMock.mockReturnValue(
            buildClassification("dataGap"),
        );
        const dataGapHtml = renderToString(
            React.createElement(TorrentTable_StatusCell, {
                torrent: BASE_TORRENT,
                t: ((key: string) => key) as never,
            }),
        );

        useResolvedRecoveryClassificationMock.mockReturnValue(
            buildClassification("pathLoss"),
        );
        const pathLossHtml = renderToString(
            React.createElement(TorrentTable_StatusCell, {
                torrent: BASE_TORRENT,
                t: ((key: string) => key) as never,
            }),
        );

        expect(dataGapHtml).toBe(pathLossHtml);
        expect(dataGapHtml).not.toContain("data-testid=\"missing-cell\"");
    });
});

