import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { status } from "@/shared/status";
import type { ConnectionStatus } from "@/shared/types/rpc";

const subscribeNonTableMock = vi.fn();
const reportReadErrorMock = vi.fn();

let inspectorTabMock: "general" | "pieces" | "trackers" = "general";
let rpcStatusMock: ConnectionStatus = status.connection.connected;

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineHeartbeatDomain: () => ({
        subscribeNonTable: subscribeNonTableMock,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        reportReadError: reportReadErrorMock,
        rpcStatus: rpcStatusMock,
    }),
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: () => ({
        preferences: {
            inspectorTab: inspectorTabMock,
        },
    }),
}));

type HarnessRef = {
    loadDetail: (
        torrentId: string,
        detail?: Record<string, unknown>,
    ) => Promise<void>;
    getDetailData: () => Record<string, unknown> | null;
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 2000,
) => {
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

const HookHarness = forwardRef<HarnessRef>((_, ref) => {
    const isMountedRef = useRef(true);
    const viewModel = useTorrentDetail({
        torrentClient: {} as never,
        isMountedRef,
    });
    const viewModelRef = useRef(viewModel);

    useLayoutEffect(() => {
        viewModelRef.current = viewModel;
    }, [viewModel]);

    useImperativeHandle(ref, () => ({
        loadDetail: (torrentId: string, detail?: Record<string, unknown>) =>
            viewModelRef.current.loadDetail(
                torrentId,
                ({ id: torrentId, ...(detail ?? {}) } as never),
            ),
        getDetailData: () => viewModelRef.current.detailData as Record<string, unknown> | null,
    }));

    return createElement("div");
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    rerender: () => void;
    cleanup: () => void;
};

const mountHarness = async (): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = () => root.render(createElement(HookHarness, { ref }));
    render();
    await waitForCondition(() => Boolean(ref.current), 1200);
    return {
        ref,
        rerender: () => {
            flushSync(() => {
                render();
            });
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useTorrentDetail", () => {
    beforeEach(() => {
        subscribeNonTableMock.mockReset();
        reportReadErrorMock.mockReset();
        subscribeNonTableMock.mockReturnValue({
            unsubscribe: vi.fn(),
        });
        inspectorTabMock = "general";
        rpcStatusMock = status.connection.connected;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("preloads tracker stats through the detail heartbeat even before the trackers tab is active", async () => {
        const mounted = await mountHarness();
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            flushSync(() => {
                void harness.loadDetail("torrent-1");
            });

            await waitForCondition(() => subscribeNonTableMock.mock.calls.length > 0);

            expect(subscribeNonTableMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: "detail",
                    detailId: "torrent-1",
                    detailProfile: "standard",
                    includeTrackerStats: true,
                }),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps pieces detail profile while still preloading tracker stats", async () => {
        inspectorTabMock = "pieces";
        const mounted = await mountHarness();
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            flushSync(() => {
                void harness.loadDetail("torrent-2");
            });

            await waitForCondition(() => subscribeNonTableMock.mock.calls.length > 0);

            expect(subscribeNonTableMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: "detail",
                    detailId: "torrent-2",
                    detailProfile: "pieces",
                    includeTrackerStats: true,
                }),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("normalizes placeholder detail state before the heartbeat fills in full data", async () => {
        const mounted = await mountHarness();
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            flushSync(() => {
                void harness.loadDetail("torrent-3");
            });

            await waitForCondition(() => {
                const detail = harness.getDetailData();
                return Boolean(detail && typeof detail.speed === "object");
            });

            const detail = harness.getDetailData();
            expect(detail).not.toBeNull();
            expect((detail as { speed?: { down?: number; up?: number } }).speed?.down).toBe(0);
            expect((detail as { speed?: { down?: number; up?: number } }).speed?.up).toBe(0);
            expect(
                (detail as { peerSummary?: { connected?: number; total?: number } }).peerSummary?.connected,
            ).toBe(0);
            expect(detail?.id).toBe("torrent-3");
            expect(detail?.hash).toBe("torrent-3");
        } finally {
            mounted.cleanup();
        }
    });

    it("clears detail state when the session disconnects", async () => {
        const mounted = await mountHarness();
        try {
            const harness = mounted.ref.current;
            if (!harness) {
                throw new Error("harness_missing");
            }

            flushSync(() => {
                void harness.loadDetail("torrent-4");
            });

            await waitForCondition(() => harness.getDetailData()?.id === "torrent-4");

            rpcStatusMock = status.connection.error;
            mounted.rerender();

            await waitForCondition(() => harness.getDetailData() === null);
            expect(harness.getDetailData()).toBeNull();
        } finally {
            mounted.cleanup();
        }
    });

});
