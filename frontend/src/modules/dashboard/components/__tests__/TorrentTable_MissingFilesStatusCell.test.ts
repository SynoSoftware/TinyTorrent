import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { STATUS } from "@/shared/status";
import { TorrentTable_MissingFilesStatusCell } from "@/modules/dashboard/components/TorrentTable_MissingFilesStatusCell";
import type { Torrent } from "@/modules/dashboard/types/torrent";

const openRecoveryModalMock = vi.fn();
const showFeedbackMock = vi.fn();
const useResolvedRecoveryClassificationMock = vi.fn();
const useMissingFilesProbeMock = vi.fn();
const formatMissingFileDetailsMock = vi.fn();

vi.mock("@/app/context/RecoveryContext", () => ({
    useRecoveryContext: () => ({
        recoverySession: null,
        openRecoveryModal: openRecoveryModalMock,
    }),
}));

vi.mock("@/app/hooks/useActionFeedback", () => ({
    useActionFeedback: () => ({
        showFeedback: showFeedbackMock,
    }),
}));

vi.mock("@/modules/dashboard/hooks/useResolvedRecoveryClassification", () => ({
    useResolvedRecoveryClassification: (...args: unknown[]) =>
        useResolvedRecoveryClassificationMock(...args),
}));

vi.mock("@/services/recovery/missingFilesStore", () => ({
    useMissingFilesProbe: (...args: unknown[]) => useMissingFilesProbeMock(...args),
}));

vi.mock("@/modules/dashboard/utils/missingFiles", () => ({
    formatMissingFileDetails: (...args: unknown[]) =>
        formatMissingFileDetailsMock(...args),
}));

const TEST_TORRENT: Torrent = {
    id: "torrent-a",
    hash: "hash-a",
    name: "A",
    state: STATUS.torrent.DOWNLOADING,
    speed: {
        down: 0,
        up: 0,
    },
    peerSummary: {
        connected: 0,
    },
    totalSize: 1,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 1200,
): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

describe("TorrentTable_MissingFilesStatusCell", () => {
    beforeEach(() => {
        openRecoveryModalMock.mockReset();
        showFeedbackMock.mockReset();
        useResolvedRecoveryClassificationMock.mockReset();
        useMissingFilesProbeMock.mockReset();
        formatMissingFileDetailsMock.mockReset();
        useResolvedRecoveryClassificationMock.mockReturnValue(null);
        useMissingFilesProbeMock.mockReturnValue(null);
        formatMissingFileDetailsMock.mockReturnValue(["probe line"]);
        openRecoveryModalMock.mockReturnValue({ status: "requested" });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders a clickable trigger when classification is missing", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        root.render(
            React.createElement(TorrentTable_MissingFilesStatusCell, {
                torrent: TEST_TORRENT,
                t: ((key: string) => key) as never,
            }),
        );

        await waitForCondition(() => Boolean(container.querySelector("button")));

        const trigger = container.querySelector("button");
        if (!trigger) {
            throw new Error("missing_recovery_trigger");
        }
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(openRecoveryModalMock).toHaveBeenCalledTimes(1);
        expect(openRecoveryModalMock).toHaveBeenCalledWith(TEST_TORRENT);
        expect(showFeedbackMock).not.toHaveBeenCalled();

        root.unmount();
        container.remove();
    });
});
