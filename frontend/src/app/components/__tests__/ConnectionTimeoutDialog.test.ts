import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ConnectionTimeoutDialog } from "@/app/components/ConnectionTimeoutDialog";

const useConnectionConfigMock = vi.hoisted(() => vi.fn());
const useWorkspaceModalsMock = vi.hoisted(() => vi.fn());
const usePreferencesMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());
const useUiClockMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Button: ({ children, href, onPress }: { children?: React.ReactNode; href?: string; onPress?: () => void }) =>
        React.createElement(
            href ? "a" : "button",
            href
                ? {
                      href,
                  }
                : {
                      type: "button",
                      onClick: onPress,
                  },
            children,
        ),
}));

vi.mock("@/shared/ui/layout/ModalEx", () => ({
    ModalEx: ({
        open,
        title,
        children,
    }: {
        open: boolean;
        title: string;
        children?: React.ReactNode;
    }) =>
        React.createElement(
            "section",
            {
                "data-open": String(open),
                "data-title": title,
            },
            title,
            children,
        ),
}));

vi.mock("@/app/context/ConnectionConfigContext", () => ({
    useConnectionConfig: useConnectionConfigMock,
}));

vi.mock("@/app/context/AppShellStateContext", () => ({
    useWorkspaceModals: useWorkspaceModalsMock,
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: usePreferencesMock,
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

vi.mock("@/shared/hooks/useUiClock", () => ({
    useUiClock: useUiClockMock,
}));

const renderDialog = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    flushSync(() => {
        root.render(React.createElement(ConnectionTimeoutDialog));
    });

    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("ConnectionTimeoutDialog", () => {
    beforeEach(() => {
        useConnectionConfigMock.mockReturnValue({
            activeRpcConnection: {
                serverUrl: "http://127.0.0.1:9091",
            },
        });
        useWorkspaceModalsMock.mockReturnValue({
            isSettingsOpen: false,
            openSettings: vi.fn(),
        });
        useSessionMock.mockReturnValue({
            connectionTimeoutDialog: {
                isOpen: true,
                action: "probe",
                retryStatus: null,
                dismiss: vi.fn(),
            },
            reconnect: vi.fn(),
            rpcStatus: "error",
            uiCapabilities: {
                isLoopback: true,
            },
        });
        useUiClockMock.mockReturnValue({
            tick: 0,
            lastTickAt: 0,
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("shows the welcome copy while setup guidance is enabled", () => {
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: true,
            },
        });

        const mounted = renderDialog();
        try {
            const modal = mounted.container.querySelector("section");
            expect(modal?.getAttribute("data-open")).toBe("true");
            expect(modal?.getAttribute("data-title")).toBe(
                "workspace.connection_timeout_dialog.welcome_title",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("shows the generic startup timeout copy when startup guidance is disabled", () => {
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: false,
            },
        });

        const mounted = renderDialog();
        try {
            const modal = mounted.container.querySelector("section");
            expect(modal?.getAttribute("data-open")).toBe("true");
            expect(modal?.getAttribute("data-title")).toBe(
                "workspace.connection_timeout_dialog.startup_title",
            );
        } finally {
            mounted.cleanup();
        }
    });
});
