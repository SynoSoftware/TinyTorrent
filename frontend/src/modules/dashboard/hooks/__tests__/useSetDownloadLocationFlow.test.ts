import React, {
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type ForwardedRef,
} from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useSetDownloadLocationFlow } from "@/modules/dashboard/hooks/useSetDownloadLocationFlow";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

const useSessionMock = vi.hoisted(() => vi.fn());
const useDirectoryPickerMock = vi.hoisted(() => vi.fn());
const useDownloadPathsMock = vi.hoisted(() => vi.fn());
const useEngineSessionDomainMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

vi.mock("@/app/hooks/useDirectoryPicker", () => ({
    useDirectoryPicker: useDirectoryPickerMock,
}));

vi.mock("@/app/hooks/useDownloadPaths", () => ({
    useDownloadPaths: useDownloadPathsMock,
}));

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineSessionDomain: useEngineSessionDomainMock,
}));

type HookSnapshot = ReturnType<typeof useSetDownloadLocationFlow> | null;

type HarnessRef = {
    getValue: () => HookSnapshot;
};

const torrent: Torrent = {
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent",
    state: "paused",
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0 },
    totalSize: 1000,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    downloadDir: "D:\\Downloads",
};

const renderHookHarness = (setDownloadLocation: ({
    torrent,
    path,
}: {
    torrent: Torrent;
    path: string;
}) => Promise<TorrentCommandOutcome>) => {
    const HookHarness = forwardRef(function HookHarness(
        _: object,
        ref: ForwardedRef<HarnessRef>,
    ) {
        const value = useSetDownloadLocationFlow({
            torrent,
            setDownloadLocation,
        });
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
            root.render(
                React.createElement(HookHarness, { ref }),
            );
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

describe("useSetDownloadLocationFlow", () => {
    beforeEach(() => {
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        useSessionMock.mockReturnValue({
            sessionSettings: null,
            refreshSessionSettings: vi.fn(async () => ({})),
        });
        useEngineSessionDomainMock.mockReturnValue({
            updateSessionSettings: vi.fn(async () => {}),
        });
        useDirectoryPickerMock.mockReturnValue({
            canPickDirectory: true,
            pickDirectory: vi.fn(),
        });
        useDownloadPathsMock.mockReturnValue({
            history: [],
            remember: vi.fn(),
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        useSessionMock.mockReset();
        useDirectoryPickerMock.mockReset();
        useDownloadPathsMock.mockReset();
        useEngineSessionDomainMock.mockReset();
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
    });

    it("updates the default download dir after a committed relocate path", async () => {
        const remember = vi.fn();
        const refreshSessionSettings = vi.fn(async () => ({}));
        const updateSessionSettings = vi.fn(async () => {});
        const setDownloadLocation = vi.fn(async () => ({ status: "success" as const }));
        useSessionMock.mockReturnValue({
            sessionSettings: {
                "download-dir": "D:\\Downloads",
            },
            refreshSessionSettings,
        });
        useEngineSessionDomainMock.mockReturnValue({
            updateSessionSettings,
        });
        useDownloadPathsMock.mockReturnValue({
            history: [],
            remember,
        });

        const mounted = renderHookHarness(setDownloadLocation);

        try {
            await act(async () => {
                await mounted.ref.current?.getValue()?.applySetDownloadPath({
                    path: "E:\\Incoming",
                });
            });

            expect(setDownloadLocation).toHaveBeenCalledWith({
                torrent,
                path: "E:\\Incoming",
            });
            expect(remember).toHaveBeenCalledWith("E:\\Incoming");
            expect(updateSessionSettings).toHaveBeenCalledWith({
                "download-dir": "E:\\Incoming",
            });
            expect(refreshSessionSettings).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });

    it("skips the session write when the committed path already matches the default", async () => {
        const refreshSessionSettings = vi.fn(async () => ({}));
        const updateSessionSettings = vi.fn(async () => {});
        const setDownloadLocation = vi.fn(async () => ({ status: "success" as const }));
        useSessionMock.mockReturnValue({
            sessionSettings: {
                "download-dir": "D:\\Downloads",
            },
            refreshSessionSettings,
        });
        useEngineSessionDomainMock.mockReturnValue({
            updateSessionSettings,
        });

        const mounted = renderHookHarness(setDownloadLocation);

        try {
            await act(async () => {
                await mounted.ref.current?.getValue()?.applySetDownloadPath({
                    path: "D:\\Downloads",
                });
            });

            expect(updateSessionSettings).not.toHaveBeenCalled();
            expect(refreshSessionSettings).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
