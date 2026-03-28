import React, {
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type ForwardedRef,
} from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useRpcConnection } from "@/app/hooks/useRpcConnection";
import { status } from "@/shared/status";

const useEngineSessionDomainMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineSessionDomain: useEngineSessionDomainMock,
}));

vi.mock("@/shared/utils/infraLogger", () => ({
    infraLogger: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

type HookSnapshot = ReturnType<typeof useRpcConnection> | null;

type HarnessRef = {
    getValue: () => HookSnapshot;
};

const LOCALHOST_SUCCESS_MS = 100;
const LOCALHOST_TIMEOUT_MS = 200;

const renderHookHarness = () => {
    const HookHarness = forwardRef(function HookHarness(
        _: object,
        ref: ForwardedRef<HarnessRef>,
    ) {
        const value = useRpcConnection();
        const valueRef = useRef<HookSnapshot>(value);

        useLayoutEffect(() => {
            valueRef.current = value;
        }, [value]);

        useImperativeHandle(
            ref,
            () => ({
                getValue: () => valueRef.current,
            }),
            [],
        );

        return null;
    });

    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
        flushSync(() => {
            root.render(React.createElement(HookHarness, { ref }));
        });
    });

    if (!ref.current) {
        throw new Error("harness_missing");
    }

    return {
        ref,
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
};

const advance = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

const resolveAfter = (ms: number) =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });

const rejectAfter = (ms: number, error: Error) =>
    new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(error), ms);
    });

const createAbortError = () => {
    const error = new Error("Transmission RPC request aborted");
    error.name = "AbortError";
    return error;
};

const createConnectionError = () => new TypeError("Failed to fetch");

describe("useRpcConnection", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-27T00:00:00.000Z"));
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        useEngineSessionDomainMock.mockReset();
        vi.useRealTimers();
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
    });

    it("starts the startup probe immediately on mount", () => {
        const probeConnection = vi.fn().mockImplementation(() => resolveAfter(250));

        useEngineSessionDomainMock.mockReturnValue({
            probeConnection,
            resetConnection: vi.fn(),
        });

        const mounted = renderHookHarness();
        try {
            expect(probeConnection).toHaveBeenCalledTimes(1);
            expect(mounted.ref.current?.getValue()?.connectionStatusView.state).toBe(
                "connecting",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("opens the startup dialog after the first timed-out startup probe", async () => {
        useEngineSessionDomainMock.mockReturnValue({
            probeConnection: vi
                .fn()
                .mockImplementation(() =>
                    rejectAfter(LOCALHOST_TIMEOUT_MS, createAbortError()),
                ),
            resetConnection: vi.fn(),
        });

        const mounted = renderHookHarness();
        try {
            await advance(LOCALHOST_TIMEOUT_MS - 1);

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                false,
            );

            await advance(1);
            await act(async () => {});

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                true,
            );
            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.action).toBe(
                "probe",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps the startup dialog closed when localhost connects within the first probe budget", async () => {
        useEngineSessionDomainMock.mockReturnValue({
            probeConnection: vi
                .fn()
                .mockImplementationOnce(() => resolveAfter(LOCALHOST_SUCCESS_MS)),
            resetConnection: vi.fn(),
        });

        const mounted = renderHookHarness();
        try {
            await advance(LOCALHOST_SUCCESS_MS);

            expect(mounted.ref.current?.getValue()?.rpcStatus).toBe(
                status.connection.connected,
            );

            await advance(LOCALHOST_TIMEOUT_MS);

            expect(mounted.ref.current?.getValue()?.rpcStatus).toBe(
                status.connection.connected,
            );
            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                false,
            );
            expect(
                mounted.ref.current?.getValue()?.connectionStatusView.retryStatus,
            ).toBeNull();
        } finally {
            mounted.cleanup();
        }
    });

    it("re-arms the timeout dialog for a manual reconnect after dismissal", async () => {
        const probeConnection = vi
            .fn()
            .mockImplementation(() =>
                rejectAfter(LOCALHOST_TIMEOUT_MS, createAbortError()),
            );

        useEngineSessionDomainMock.mockReturnValue({
            probeConnection,
            resetConnection: vi.fn(),
        });

        const mounted = renderHookHarness();
        try {
            await advance(LOCALHOST_TIMEOUT_MS);
            await act(async () => {});

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                true,
            );

            act(() => {
                mounted.ref.current?.getValue()?.connectionTimeoutDialog.dismiss();
            });

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                false,
            );

            let reconnectPromise:
                | ReturnType<NonNullable<HookSnapshot>["reconnect"]>
                | undefined;
            await act(async () => {
                reconnectPromise = mounted.ref.current?.getValue()?.reconnect({
                    disableRetry: true,
                });
            });

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                false,
            );
            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.action).toBe(
                null,
            );

            await advance(LOCALHOST_TIMEOUT_MS);
            await act(async () => {});
            await act(async () => {
                await reconnectPromise;
            });

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                true,
            );
            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.action).toBe(
                "reconnect",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("shows the reconnect dialog again when a manual reconnect fails without timing out", async () => {
        const probeConnection = vi
            .fn()
            .mockImplementationOnce(() =>
                rejectAfter(LOCALHOST_TIMEOUT_MS, createAbortError()),
            )
            .mockRejectedValueOnce(createConnectionError());

        useEngineSessionDomainMock.mockReturnValue({
            probeConnection,
            resetConnection: vi.fn(),
        });

        const mounted = renderHookHarness();
        try {
            await advance(LOCALHOST_TIMEOUT_MS);
            await act(async () => {});

            act(() => {
                mounted.ref.current?.getValue()?.connectionTimeoutDialog.dismiss();
            });

            let reconnectPromise:
                | ReturnType<NonNullable<HookSnapshot>["reconnect"]>
                | undefined;
            await act(async () => {
                reconnectPromise = mounted.ref.current?.getValue()?.reconnect({
                    disableRetry: true,
                });
            });

            await act(async () => {
                await reconnectPromise;
            });

            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.isOpen).toBe(
                true,
            );
            expect(mounted.ref.current?.getValue()?.connectionTimeoutDialog.action).toBe(
                "reconnect",
            );
        } finally {
            mounted.cleanup();
        }
    });

});
