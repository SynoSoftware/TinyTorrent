import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useState,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { SpeedHistoryDomainProvider } from "@/shared/hooks/useSpeedHistoryDomain";
import { useEngineSpeedHistory } from "@/shared/hooks/useEngineSpeedHistory";

type SpeedHistoryStoreLike = {
    watch: (id: string) => () => void;
    subscribe: (listener: () => void) => () => void;
    get: (id: string) => { down: number[]; up: number[] };
};

type HarnessRef = {
    rerender: () => void;
};

const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 1000,
) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 10);
        });
    }
    throw new Error("wait_for_condition_timeout");
};

const Consumer = () => {
    useEngineSpeedHistory("torrent-1");
    return createElement("div");
};

const Harness = forwardRef<HarnessRef, { store: SpeedHistoryStoreLike }>(
    ({ store }, ref) => {
        const [, setVersion] = useState(0);

        useImperativeHandle(ref, () => ({
            rerender: () => setVersion((current) => current + 1),
        }));

        return createElement(SpeedHistoryDomainProvider, {
            store: store as never,
            children: createElement(Consumer),
        });
    },
);

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const mountHarness = async (
    store: SpeedHistoryStoreLike,
): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(createElement(Harness, { ref, store }));
    await waitForCondition(() => Boolean(ref.current));
    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("useEngineSpeedHistory", () => {
    let unwatchMock: ReturnType<typeof vi.fn>;
    let unsubscribeMock: ReturnType<typeof vi.fn>;
    let watchMock: ReturnType<typeof vi.fn>;
    let subscribeMock: ReturnType<typeof vi.fn>;
    let store: SpeedHistoryStoreLike;

    beforeEach(() => {
        unwatchMock = vi.fn();
        unsubscribeMock = vi.fn();
        watchMock = vi.fn((id: string) => {
            void id;
            return unwatchMock;
        });
        subscribeMock = vi.fn((listener: () => void) => {
            void listener;
            return unsubscribeMock;
        });
        store = {
            watch: watchMock as SpeedHistoryStoreLike["watch"],
            subscribe: subscribeMock as SpeedHistoryStoreLike["subscribe"],
            get: vi.fn(() => ({ down: [], up: [] })),
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("does not re-watch when the domain provider rerenders with the same store", async () => {
        const mounted = await mountHarness(store);

        try {
            expect(watchMock).toHaveBeenCalledTimes(1);
            expect(subscribeMock).toHaveBeenCalledTimes(1);

            mounted.ref.current?.rerender();
            await waitForCondition(() => watchMock.mock.calls.length === 1);

            expect(watchMock).toHaveBeenCalledTimes(1);
            expect(subscribeMock).toHaveBeenCalledTimes(1);
            expect(unwatchMock).not.toHaveBeenCalled();
            expect(unsubscribeMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }

        expect(unwatchMock).toHaveBeenCalledTimes(1);
        expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
});
