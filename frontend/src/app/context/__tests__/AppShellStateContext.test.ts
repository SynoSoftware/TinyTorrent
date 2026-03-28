import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const useSessionMock = vi.hoisted(() => vi.fn());
const usePreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: usePreferencesMock,
}));

import {
    AppShellStateProvider,
    useAppShellState,
    useFocusState,
    useSelection,
    useWorkspaceModals,
} from "@/app/context/AppShellStateContext";

const renderProbe = (element: React.ReactElement) => {
    renderToString(element);
};

const renderProvider = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(
                AppShellStateProvider,
                null,
                React.createElement("div"),
            ),
        );
    });

    return {
        rerender: () => {
            act(() => {
                root.render(
                    React.createElement(
                        AppShellStateProvider,
                        null,
                        React.createElement("div"),
                    ),
                );
            });
        },
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
};

const expectProviderError = (useHook: () => unknown) => {
    const Probe = () => {
        useHook();
        return null;
    };
    expect(() => renderProbe(React.createElement(Probe))).toThrow(
        "useAppShellState must be used within AppShellStateProvider"
    );
};

describe("AppShellStateContext", () => {
    let updatePreferencesMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        updatePreferencesMock = vi.fn();
        useSessionMock.mockReturnValue({
            rpcStatus: "connected",
            uiCapabilities: { uiMode: "Full" as const },
        });
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: false,
            },
            setSettingsTab: vi.fn(),
            updatePreferences: updatePreferencesMock,
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
    });

    it("throws when useAppShellState is used outside provider", () => {
        expectProviderError(() => useAppShellState());
    });

    it("throws when useFocusState is used outside provider", () => {
        expectProviderError(() => useFocusState());
    });

    it("throws when useSelection is used outside provider", () => {
        expectProviderError(() => useSelection());
    });

    it("throws when useWorkspaceModals is used outside provider", () => {
        expectProviderError(() => useWorkspaceModals());
    });

    it("clears setup guidance after the first successful connection transition", () => {
        const sessionState = {
            rpcStatus: "connecting",
            uiCapabilities: { uiMode: "Full" as const },
        };
        useSessionMock.mockImplementation(() => sessionState);
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: true,
            },
            setSettingsTab: vi.fn(),
            updatePreferences: updatePreferencesMock,
        });

        const mounted = renderProvider();
        try {
            expect(updatePreferencesMock).not.toHaveBeenCalled();
            sessionState.rpcStatus = "connected";
            mounted.rerender();
            expect(updatePreferencesMock).toHaveBeenCalledWith({
                showTorrentServerSetup: false,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("does not clear setup guidance just because it is enabled while already connected", () => {
        useSessionMock.mockReturnValue({
            rpcStatus: "connected",
            uiCapabilities: { uiMode: "Full" as const },
        });
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: true,
            },
            setSettingsTab: vi.fn(),
            updatePreferences: updatePreferencesMock,
        });

        const mounted = renderProvider();
        try {
            expect(updatePreferencesMock).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
