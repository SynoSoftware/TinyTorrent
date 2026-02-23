import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { RowContextMenuKey } from "@/modules/dashboard/types/torrentTableSurfaces";
import STATUS from "@/shared/status";

const handleDownloadMissingMock = vi.fn();
const handleTorrentActionMock = vi.fn();
const handleBulkActionMock = vi.fn();

vi.mock("@/app/context/RecoveryContext", () => ({
    useRecoveryContext: () => ({
        handleSetLocation: vi.fn(),
        handleOpenFolder: vi.fn(),
        canOpenFolder: true,
        handleDownloadMissing: handleDownloadMissingMock,
    }),
}));

vi.mock("@/app/context/AppCommandContext", () => ({
    useTorrentCommands: () => ({
        handleTorrentAction: handleTorrentActionMock,
        handleBulkAction: handleBulkActionMock,
    }),
}));

type HarnessRef = {
    run: (
        key: RowContextMenuKey,
    ) => ReturnType<
        ReturnType<typeof useTorrentTableContextActions>["handleContextMenuAction"]
    >;
};

const TEST_TORRENT: Torrent = {
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

const createContextMenu = () => ({
    virtualElement: {
        x: 10,
        y: 10,
        getBoundingClientRect: () =>
            ({
                x: 10,
                y: 10,
                width: 0,
                height: 0,
                top: 10,
                right: 10,
                bottom: 10,
                left: 10,
                toJSON: () => ({}),
            }) as DOMRect,
    },
    torrent: TEST_TORRENT,
});

const HookHarness = forwardRef<HarnessRef>((_, ref) => {
    const setContextMenu = vi.fn();
    const hook = useTorrentTableContextActions({
        contextMenu: createContextMenu(),
        findRowElement: vi.fn(() => null),
        openColumnModal: vi.fn(),
        copyToClipboard: async () => ({ status: "copied" as const }),
        buildMagnetLink: () => "magnet:?xt=urn:btih:hash-a",
        setContextMenu,
        selectedTorrents: [TEST_TORRENT],
    });

    useImperativeHandle(
        ref,
        () => ({
            run: (key: RowContextMenuKey) => hook.handleContextMenuAction(key),
        }),
        [hook],
    );
    return null;
});

describe("useTorrentTableContextActions download-missing mapping", () => {
    beforeEach(() => {
        handleDownloadMissingMock.mockReset();
        handleTorrentActionMock.mockReset();
        handleBulkActionMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const mount = async () => {
        const ref = React.createRef<HarnessRef>();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);
        root.render(React.createElement(HookHarness, { ref }));
        await waitForCondition(() => Boolean(ref.current));
        return {
            ref,
            cleanup: () => {
                root.unmount();
                container.remove();
            },
        };
    };

    it("returns success when download-missing is applied", async () => {
        handleDownloadMissingMock.mockResolvedValue({ status: "applied" });
        const mounted = await mount();
        try {
            const outcome = await mounted.ref.current!.run("download-missing");
            expect(outcome).toEqual({ status: "success" });
        } finally {
            mounted.cleanup();
        }
    });

    it("returns unsupported when download-missing is not actionable", async () => {
        handleDownloadMissingMock.mockResolvedValue({
            status: "not_required",
            reason: "not_actionable",
        });
        const mounted = await mount();
        try {
            const outcome = await mounted.ref.current!.run("download-missing");
            expect(outcome).toEqual({
                status: "unsupported",
                reason: "action_not_supported",
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("returns failed when download-missing execution fails", async () => {
        handleDownloadMissingMock.mockResolvedValue({
            status: "failed",
            reason: "execution_failed",
        });
        const mounted = await mount();
        try {
            const outcome = await mounted.ref.current!.run("download-missing");
            expect(outcome).toEqual({
                status: "failed",
                reason: "execution_failed",
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("returns blocked when download-missing resolves to blocked", async () => {
        handleDownloadMissingMock.mockResolvedValue({
            status: "not_required",
            reason: "blocked",
        });
        const mounted = await mount();
        try {
            const outcome = await mounted.ref.current!.run("download-missing");
            expect(outcome).toEqual({
                status: "failed",
                reason: "blocked",
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("returns canceled when download-missing is operation-cancelled", async () => {
        handleDownloadMissingMock.mockResolvedValue({
            status: "not_required",
            reason: "operation_cancelled",
        });
        const mounted = await mount();
        try {
            const outcome = await mounted.ref.current!.run("download-missing");
            expect(outcome).toEqual({
                status: "canceled",
                reason: "operation_cancelled",
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("returns unsupported for non-cancel not_required reasons", async () => {
        const reasons = [
            "no_error_envelope",
            "no_blocking_outcome",
            "set_location",
        ] as const;
        for (const reason of reasons) {
            handleDownloadMissingMock.mockResolvedValue({
                status: "not_required",
                reason,
            });
            const mounted = await mount();
            try {
                const outcome = await mounted.ref.current!.run("download-missing");
                expect(outcome).toEqual({
                    status: "unsupported",
                    reason: "action_not_supported",
                });
            } finally {
                mounted.cleanup();
            }
        }
    });
});
