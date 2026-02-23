import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useWorkspaceTorrentDomain } from "@/app/orchestrators/useWorkspaceTorrentDomain";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import STATUS from "@/shared/status";
import { BULK_RESUME_CONCURRENCY } from "@/config/logic";

const resumeTorrentWithRecoveryMock = vi.fn();
const executeDownloadMissingMock = vi.fn();
const handlePrepareDeleteMock = vi.fn();
const markTorrentPausedByUserMock = vi.fn();
const dispatchTorrentSelectionActionMock = vi.fn();

type ExecuteSelectionAction = (
    action: TorrentTableAction,
    targets: Torrent[],
) => Promise<TorrentCommandOutcome>;

let capturedExecuteSelectionAction: ExecuteSelectionAction | null = null;

const TORRENT_A: Torrent = {
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

const TORRENT_B: Torrent = {
    ...TORRENT_A,
    id: "torrent-b",
    hash: "hash-b",
    name: "B",
};

vi.mock("@/modules/dashboard/hooks/useTorrentData", () => ({
    useTorrentData: () => ({
        torrents: [TORRENT_A, TORRENT_B],
        isInitialLoadFinished: true,
        refresh: vi.fn(async () => {}),
        runtimeSummary: {
            activeDownloadCount: 0,
            activeDownloadRequiredBytes: 0,
            verifyingCount: 0,
            verifyingAverageProgress: 0,
            singleVerifyingName: null,
        },
        ghostTorrents: [],
    }),
}));

vi.mock("@/modules/dashboard/hooks/useTorrentDetail", () => ({
    useTorrentDetail: () => ({
        detailData: null,
        loadDetail: vi.fn(async () => {}),
        refreshDetailData: vi.fn(async () => {}),
        clearDetail: vi.fn(),
        mutateDetail: vi.fn(),
    }),
}));

vi.mock("@/app/actions/torrentDispatch", () => ({
    createTorrentDispatch: () => vi.fn(async () => ({ status: "applied" as const })),
}));

vi.mock("@/app/hooks/useOptimisticStatuses", () => ({
    useOptimisticStatuses: () => ({
        optimisticStatuses: {},
        updateOptimisticStatuses: vi.fn(),
        updateOperationOverlays: vi.fn(),
    }),
}));

vi.mock("@/app/context/AppShellStateContext", () => ({
    useSelection: () => ({
        selectedIds: [TORRENT_A.id, TORRENT_B.id],
        activeId: null,
        setActiveId: vi.fn(),
    }),
}));

vi.mock("@/modules/dashboard/hooks/useDetailControls", () => ({
    useDetailControls: () => ({
        handleFileSelectionChange: vi.fn(async () => {}),
        handleSequentialToggle: vi.fn(async () => {}),
        handleSuperSeedingToggle: vi.fn(async () => {}),
    }),
}));

vi.mock("@/app/hooks/useOpenTorrentFolder", () => ({
    useOpenTorrentFolder: () => vi.fn(async () => ({ status: "success" as const })),
}));

vi.mock("@/app/orchestrators/useTorrentOrchestrator", () => ({
    useTorrentOrchestrator: () => ({
        addTorrent: {},
        recovery: {
            state: {
                session: null,
                isBusy: false,
                isDetailRecoveryBlocked: false,
                queuedCount: 0,
                queuedItems: [],
            },
            modal: {},
            locationEditor: {},
            setLocation: {},
            actions: {
                executeDownloadMissing: executeDownloadMissingMock,
                resumeTorrentWithRecovery: resumeTorrentWithRecoveryMock,
                handlePrepareDelete: handlePrepareDeleteMock,
                markTorrentPausedByUser: markTorrentPausedByUserMock,
            },
        },
    }),
}));

vi.mock("@/app/hooks/useTorrentWorkflow", () => ({
    useTorrentWorkflow: (params: unknown) => {
        const value = params as {
            executeSelectionAction: ExecuteSelectionAction;
        };
        capturedExecuteSelectionAction = value.executeSelectionAction;
        return {
            pendingDelete: null,
            confirmDelete: vi.fn(async () => ({ status: "success" as const })),
            clearPendingDelete: vi.fn(),
            handleTorrentAction: vi.fn(async () => ({ status: "success" as const })),
            handleBulkAction: vi.fn(async () => ({ status: "success" as const })),
            removedIds: new Set<string>(),
        };
    },
}));

vi.mock("@/app/utils/torrentActionDispatcher", () => ({
    dispatchTorrentAction: vi.fn(async () => ({ status: "success" as const })),
    dispatchTorrentSelectionAction: (
        ...args: Parameters<typeof dispatchTorrentSelectionActionMock>
    ) => dispatchTorrentSelectionActionMock(...args),
}));

function Harness() {
    useWorkspaceTorrentDomain({
        torrentClient: {} as never,
        settingsConfig: {} as never,
        rpcStatus: STATUS.connection.CONNECTED,
        pollingIntervalMs: 1000,
        markTransportConnected: () => {},
        refreshSessionStatsData: async () => {},
        reportCommandError: () => {},
        capabilities: {} as never,
    });
    return null;
}

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 1000,
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

describe("useWorkspaceTorrentDomain bulk resume recovery routing", () => {
    beforeEach(() => {
        capturedExecuteSelectionAction = null;
        resumeTorrentWithRecoveryMock.mockReset();
        executeDownloadMissingMock.mockReset();
        handlePrepareDeleteMock.mockReset();
        markTorrentPausedByUserMock.mockReset();
        dispatchTorrentSelectionActionMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const mountHarness = async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);
        root.render(React.createElement(Harness));
        await waitForCondition(() => Boolean(capturedExecuteSelectionAction));
        return {
            cleanup: () => {
                root.unmount();
                container.remove();
            },
        };
    };

    it("routes bulk resume through resumeTorrentWithRecovery for each selected torrent", async () => {
        resumeTorrentWithRecoveryMock
            .mockResolvedValueOnce({ status: "applied" })
            .mockResolvedValueOnce({ status: "cancelled" });
        const mounted = await mountHarness();
        try {
            const outcome = await capturedExecuteSelectionAction!("resume", [
                TORRENT_A,
                TORRENT_B,
            ]);
            expect(outcome).toEqual({ status: "success" });
            expect(resumeTorrentWithRecoveryMock).toHaveBeenCalledTimes(2);
            expect(resumeTorrentWithRecoveryMock).toHaveBeenNthCalledWith(
                1,
                TORRENT_A,
                { suppressFeedback: true },
            );
            expect(resumeTorrentWithRecoveryMock).toHaveBeenNthCalledWith(
                2,
                TORRENT_B,
                { suppressFeedback: true },
            );
            expect(dispatchTorrentSelectionActionMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("caps bulk resume concurrency to configured limit", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        resumeTorrentWithRecoveryMock.mockImplementation(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 20);
            });
            inFlight -= 1;
            return { status: "applied" as const };
        });
        const mounted = await mountHarness();
        try {
            const targets = Array.from({ length: 12 }, (_, index) => ({
                ...TORRENT_A,
                id: `bulk-${index}`,
                hash: `bulk-hash-${index}`,
                name: `Bulk ${index}`,
            }));
            const outcome = await capturedExecuteSelectionAction!(
                "resume",
                targets,
            );
            expect(outcome).toEqual({ status: "success" });
            expect(resumeTorrentWithRecoveryMock).toHaveBeenCalledTimes(
                targets.length,
            );
            expect(maxInFlight).toBeLessThanOrEqual(BULK_RESUME_CONCURRENCY);
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps bounded concurrency under high-cardinality bulk resume batches", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const unhandledRejections: unknown[] = [];
        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            unhandledRejections.push(event.reason);
            event.preventDefault();
        };
        window.addEventListener("unhandledrejection", onUnhandledRejection);
        resumeTorrentWithRecoveryMock.mockImplementation(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 10);
            });
            inFlight -= 1;
            return { status: "applied" as const };
        });
        const mounted = await mountHarness();
        try {
            const targets = Array.from({ length: 100 }, (_, index) => ({
                ...TORRENT_A,
                id: `bulk-high-${index}`,
                hash: `bulk-high-hash-${index}`,
                name: `Bulk High ${index}`,
            }));
            const outcome = await capturedExecuteSelectionAction!(
                "resume",
                targets,
            );
            expect(outcome).toEqual({ status: "success" });
            expect(resumeTorrentWithRecoveryMock).toHaveBeenCalledTimes(
                targets.length,
            );
            expect(maxInFlight).toBeLessThanOrEqual(BULK_RESUME_CONCURRENCY);
            expect(unhandledRejections).toHaveLength(0);
        } finally {
            window.removeEventListener("unhandledrejection", onUnhandledRejection);
            mounted.cleanup();
        }
    });

    it("preserves blocked/error surfacing even when per-torrent feedback is suppressed", async () => {
        resumeTorrentWithRecoveryMock
            .mockResolvedValueOnce({ status: "applied" })
            .mockResolvedValueOnce({
                status: "failed",
                reason: "dispatch_not_applied",
            });
        const mounted = await mountHarness();
        try {
            const outcome = await capturedExecuteSelectionAction!("resume", [
                TORRENT_A,
                TORRENT_B,
            ]);
            expect(outcome).toEqual({
                status: "failed",
                reason: "execution_failed",
            });
            expect(resumeTorrentWithRecoveryMock).toHaveBeenNthCalledWith(
                1,
                TORRENT_A,
                { suppressFeedback: true },
            );
            expect(resumeTorrentWithRecoveryMock).toHaveBeenNthCalledWith(
                2,
                TORRENT_B,
                { suppressFeedback: true },
            );
        } finally {
            mounted.cleanup();
        }
    });
});
