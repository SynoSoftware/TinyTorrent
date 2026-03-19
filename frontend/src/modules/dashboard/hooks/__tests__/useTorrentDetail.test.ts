import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useRef,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useTorrentDetail } from "@/modules/dashboard/hooks/useTorrentDetail";
import { status } from "@/shared/status";

const subscribeNonTableMock = vi.fn();
const reportReadErrorMock = vi.fn();

let inspectorTabMock: "general" | "pieces" | "trackers" = "general";

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineHeartbeatDomain: () => ({
        subscribeNonTable: subscribeNonTableMock,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        reportReadError: reportReadErrorMock,
        rpcStatus: status.connection.connected,
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

    useImperativeHandle(ref, () => ({
        loadDetail: (torrentId: string, detail?: Record<string, unknown>) =>
            viewModel.loadDetail(
                torrentId,
                ({ id: torrentId, ...(detail ?? {}) } as never),
            ),
    }));

    return createElement("div");
});

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = async (): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(createElement(HookHarness, { ref }));
    await waitForCondition(() => Boolean(ref.current), 1200);
    return {
        ref,
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

});
