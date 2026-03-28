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
const detectBrowserPlatformMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Accordion: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
    AccordionItem: ({
        title,
        children,
    }: {
        title?: React.ReactNode;
        children?: React.ReactNode;
    }) => React.createElement("div", null, title, children),
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

vi.mock("@/shared/utils/browserPlatform", () => ({
    detectBrowserPlatform: detectBrowserPlatformMock,
}));

vi.mock("@/shared/ui/components/AppTooltip", () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
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
        detectBrowserPlatformMock.mockReturnValue({
            kind: "windows",
            majorVersion: 10,
            minorVersion: 0,
        });
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

    it("shows settings, install, and start guidance when setup guidance is disabled", () => {
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: false,
            },
        });

        const mounted = renderDialog();
        try {
            expect(mounted.container.textContent).toContain(
                "workspace.connection_timeout_dialog.check_settings_label",
            );
            expect(mounted.container.textContent).toContain(
                "http://127.0.0.1:9091",
            );
            expect(mounted.container.textContent).toContain(
                "workspace.connection_timeout_dialog.open_settings",
            );
            expect(mounted.container.textContent).toContain(
                "workspace.connection_timeout_dialog.install_option_label",
            );
            expect(mounted.container.textContent).toContain(
                "workspace.connection_timeout_dialog.start_option_label",
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("uses the detected platform-specific Transmission download link", () => {
        usePreferencesMock.mockReturnValue({
            preferences: {
                showTorrentServerSetup: true,
            },
        });

        const mounted = renderDialog();
        try {
            const downloadLink = mounted.container.querySelector("a[href]");
            expect(downloadLink?.getAttribute("href")).toBe(
                "https://github.com/transmission/transmission/releases/download/4.1.1/transmission-4.1.1-x64.msi",
            );
        } finally {
            mounted.cleanup();
        }
    });
});
