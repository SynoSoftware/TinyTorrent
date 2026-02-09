import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/context/SessionContext", () => ({
    useSession: () => ({
        rpcStatus: "connected",
        uiCapabilities: { uiMode: "Full" as const },
    }),
}));

import {
    useAppShellState,
    useFocusState,
    useSelection,
    useWorkspaceModals,
} from "@/app/context/AppShellStateContext";

const renderProbe = (element: React.ReactElement) => {
    renderToString(element);
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
});
