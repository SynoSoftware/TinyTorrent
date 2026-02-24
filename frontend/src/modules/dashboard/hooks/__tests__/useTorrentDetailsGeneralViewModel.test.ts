import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import STATUS from "@/shared/status";
import { useTorrentDetailsGeneralViewModel } from "@/modules/dashboard/hooks/useTorrentDetailsGeneralViewModel";

const handleDownloadMissingMock = vi.fn();
const handleSetLocationMock = vi.fn();
const isDownloadMissingInFlightMock = vi.fn(() => false);
const handleOpenFolderMock = vi.fn(async () => ({ status: "success" as const }));
const handleTorrentActionMock = vi.fn(async () => ({ status: "success" as const }));
const useMissingFilesProbeMock = vi.fn<(torrentId?: string | number) => unknown>(
    () => null,
);
const useResolvedRecoveryClassificationMock = vi.fn<
    (torrent: TorrentDetail) => unknown
>(() => null);

vi.mock("@/app/context/RecoveryContext", () => ({
    useRecoveryContext: () => ({
        handleSetLocation: handleSetLocationMock,
        handleDownloadMissing: handleDownloadMissingMock,
        isDownloadMissingInFlight: isDownloadMissingInFlightMock,
        setLocationCapability: { canBrowse: true, supportsManual: true },
        canOpenFolder: true,
        handleOpenFolder: handleOpenFolderMock,
    }),
}));

vi.mock("@/app/context/AppCommandContext", () => ({
    useTorrentCommands: () => ({
        handleTorrentAction: handleTorrentActionMock,
    }),
}));

vi.mock("@/services/recovery/missingFilesStore", () => ({
    useMissingFilesProbe: (torrentId?: string | number) =>
        useMissingFilesProbeMock(torrentId),
}));

vi.mock("@/modules/dashboard/hooks/useResolvedRecoveryClassification", () => ({
    useResolvedRecoveryClassification: (torrent: TorrentDetail) =>
        useResolvedRecoveryClassificationMock(torrent),
}));

type ViewModelRef = {
    current: ReturnType<typeof useTorrentDetailsGeneralViewModel> | null;
};

const tMock = ((key: string) => key) as unknown as TFunction;

function Harness({
    vmRef,
    torrent,
    isRecoveryBlocked,
}: {
    vmRef: ViewModelRef;
    torrent: TorrentDetail;
    isRecoveryBlocked?: boolean;
}) {
    const vm = useTorrentDetailsGeneralViewModel({
        torrent,
        downloadDir: torrent.downloadDir ?? torrent.savePath ?? "",
        isRecoveryBlocked,
        t: tMock,
    });
    useEffect(() => {
        vmRef.current = vm;
    }, [vm, vmRef]);
    return null;
}

const BASE_TORRENT: TorrentDetail = {
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
    savePath: "D:\\Data",
    downloadDir: "D:\\Data",
    errorEnvelope: {
        errorClass: "unknown",
        errorMessage: null,
        lastErrorAt: null,
        recoveryState: "blocked",
        recoveryActions: [],
    },
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 1_000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) return;
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 20);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const readVm = (vmRef: ViewModelRef) => {
    if (!vmRef.current) {
        throw new Error("view_model_not_ready");
    }
    return vmRef.current;
};

const mountHarness = async (
    torrent: TorrentDetail,
    isRecoveryBlocked?: boolean,
) => {
    const vmRef: ViewModelRef = { current: null };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(
        React.createElement(Harness, {
            vmRef,
            torrent,
            isRecoveryBlocked,
        }),
    );
    await waitForCondition(() => vmRef.current !== null);
    return {
        vmRef,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useTorrentDetailsGeneralViewModel", () => {
    beforeEach(() => {
        handleDownloadMissingMock.mockReset();
        handleSetLocationMock.mockReset();
        isDownloadMissingInFlightMock.mockReset();
        isDownloadMissingInFlightMock.mockReturnValue(false);
        handleOpenFolderMock.mockReset();
        handleOpenFolderMock.mockResolvedValue({ status: "success" });
        handleTorrentActionMock.mockReset();
        handleTorrentActionMock.mockResolvedValue({ status: "success" });
        useMissingFilesProbeMock.mockReset();
        useMissingFilesProbeMock.mockReturnValue(null);
        useResolvedRecoveryClassificationMock.mockReset();
        useResolvedRecoveryClassificationMock.mockReturnValue(null);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("surfaces blocked recovery hint from blocked recovery state even without active modal lock", async () => {
        const mounted = await mountHarness(BASE_TORRENT, false);
        try {
            expect(readVm(mounted.vmRef).recoveryBlockedMessage).toBe(
                "recovery.status.blocked",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps details-layer cancellation silent by delegating download-missing only once", async () => {
        handleDownloadMissingMock.mockResolvedValue({
            status: "not_required",
            reason: "operation_cancelled",
        });
        const mounted = await mountHarness(BASE_TORRENT, false);
        try {
            readVm(mounted.vmRef).onDownloadMissing();
            await waitForCondition(
                () => handleDownloadMissingMock.mock.calls.length === 1,
            );
            expect(handleDownloadMissingMock).toHaveBeenCalledWith(BASE_TORRENT);
            expect(handleTorrentActionMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("surfaces the raw Transmission error string in the general tab view model", async () => {
        const erroredTorrent: TorrentDetail = {
            ...BASE_TORRENT,
            errorString: "  cannot move data to destination  ",
        };
        const mounted = await mountHarness(erroredTorrent, false);
        try {
            expect(readVm(mounted.vmRef).transmissionError).toBe(
                "  cannot move data to destination  ",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("treats checking torrents as active so toggle pauses during hashing", async () => {
        const checkingTorrent: TorrentDetail = {
            ...BASE_TORRENT,
            state: STATUS.torrent.CHECKING,
            verificationProgress: 0.42,
        };
        const mounted = await mountHarness(checkingTorrent, false);
        try {
            const vm = readVm(mounted.vmRef);
            expect(vm.mainActionLabel).toBe("toolbar.pause");
            vm.onToggleStartStop();
            await waitForCondition(
                () => handleTorrentActionMock.mock.calls.length === 1,
            );
            expect(handleTorrentActionMock).toHaveBeenCalledWith(
                "pause",
                checkingTorrent,
            );
        } finally {
            mounted.cleanup();
        }
    });
});
