import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsFlow } from "@/app/hooks/useSettingsFlow";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import type { ConnectionStatus } from "@/shared/types/rpc";
import { status } from "@/shared/status";

const useSessionMock = vi.hoisted(() => vi.fn());
const usePreferencesMock = vi.hoisted(() => vi.fn());
const useEngineSessionDomainMock = vi.hoisted(() => vi.fn());
const getVersionGatedSessionValueMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: usePreferencesMock,
}));

vi.mock("@/app/providers/engineDomains", () => ({
    useEngineSessionDomain: useEngineSessionDomainMock,
}));

vi.mock("@/shared/utils/infraLogger", () => ({
    infraLogger: {
        error: vi.fn(),
    },
}));

vi.mock("@/services/rpc/version-support", () => ({
    getVersionGatedSessionValue: getVersionGatedSessionValueMock,
    getVersionGatedSettingsSupport: vi.fn(() => ({
        sequential_download: {
            minimum: "4.1.0",
            detectedVersion: "5.0.0",
            state: "supported",
        },
        torrent_complete_verify_enabled: {
            minimum: "4.1.0",
            detectedVersion: "5.0.0",
            state: "supported",
        },
    })),
    removeUnsupportedVersionGatedSettings: vi.fn((settings) => settings),
}));

type HookSnapshot = ReturnType<typeof useSettingsFlow> | null;

const latestSnapshot: { current: HookSnapshot } = {
    current: null,
};

function HookHarness() {
    latestSnapshot.current = useSettingsFlow({
        torrentClient: {} as never,
        isSettingsOpen: false,
        isMountedRef: { current: true },
    });
    return null;
}

const renderHookHarness = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const render = () => {
        act(() => {
            flushSync(() => {
                root.render(React.createElement(HookHarness));
            });
        });
    };

    render();

    return {
        rerender: render,
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
            latestSnapshot.current = null;
        },
    };
};

describe("useSettingsFlow", () => {
    beforeEach(() => {
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        getVersionGatedSessionValueMock.mockImplementation(
            (session: Record<string, unknown>, key: string) => session[key],
        );
        useEngineSessionDomainMock.mockReturnValue({
            canTestPort: false,
            testPort: vi.fn(),
            updateSessionSettings: vi.fn(),
        });
        usePreferencesMock.mockReturnValue({
            preferences: {
                refreshIntervalMs: 2500,
                requestTimeoutMs: 15000,
                tableWatermarkEnabled: true,
                workspaceStyle: "classic",
                showTorrentServerSetup: true,
                addTorrentDefaults: {
                    showAddDialog: true,
                },
            },
            updatePreferences: vi.fn(),
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        latestSnapshot.current = null;
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
        useSessionMock.mockReset();
        usePreferencesMock.mockReset();
        useEngineSessionDomainMock.mockReset();
        getVersionGatedSessionValueMock.mockReset();
    });

    it("hydrates the session download dir without waiting for settings to open", () => {
        const sessionState: {
            reportCommandError: ReturnType<typeof vi.fn>;
            rpcStatus: ConnectionStatus;
            sessionSettings: TransmissionSessionSettings | null;
            refreshSessionSettings: ReturnType<typeof vi.fn>;
            updateRequestTimeout: ReturnType<typeof vi.fn>;
        } = {
            reportCommandError: vi.fn(),
            rpcStatus: status.connection.offline,
            sessionSettings: null,
            refreshSessionSettings: vi.fn(),
            updateRequestTimeout: vi.fn(),
        };
        useSessionMock.mockImplementation(() => sessionState);

        const mounted = renderHookHarness();

        try {
            expect(
                latestSnapshot.current?.settingsConfig.download_dir,
            ).toBe("");
            expect(sessionState.refreshSessionSettings).not.toHaveBeenCalled();

            sessionState.rpcStatus = status.connection.connected;
            sessionState.sessionSettings = {
                "download-dir": "D:\\SessionDownloads",
            };
            mounted.rerender();

            expect(
                latestSnapshot.current?.settingsConfig.download_dir,
            ).toBe("D:\\SessionDownloads");
            expect(sessionState.refreshSessionSettings).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
