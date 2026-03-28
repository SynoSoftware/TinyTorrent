import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useSettingsModalController } from "@/modules/settings/hooks/useSettingsModalController";
import {
    DEFAULT_SETTINGS_CONFIG,
    type SettingsConfig,
} from "@/modules/settings/data/config";
import type { SettingsModalViewModel } from "@/app/viewModels/useAppViewModel";
import { status } from "@/shared/status";

const useSessionMock = vi.hoisted(() => vi.fn());
const usePreferencesMock = vi.hoisted(() => vi.fn());
const useDownloadPathsMock = vi.hoisted(() => vi.fn());
const browseDirectoryMock = vi.hoisted(() => vi.fn());
const writeClipboardOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@heroui/toast", () => ({
    addToast: vi.fn(),
}));

vi.mock("@/app/context/SessionContext", () => ({
    useSession: useSessionMock,
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: usePreferencesMock,
}));

vi.mock("@/app/hooks/useDownloadPaths", () => ({
    useDownloadPaths: useDownloadPathsMock,
    mergeDownloadPaths: (history: string[], nextPath: string) => [
        nextPath,
        ...history.filter((entry) => entry !== nextPath),
    ],
}));

vi.mock("@/app/agents/shell-agent", () => ({
    shellAgent: {
        browseDirectory: browseDirectoryMock,
    },
}));

vi.mock("@/app/services/scheduler", () => ({
    scheduler: {
        scheduleTimeout: (callback: () => void, delayMs: number) => {
            const timeoutId = window.setTimeout(callback, delayMs);
            return () => window.clearTimeout(timeoutId);
        },
    },
}));

vi.mock("@/shared/utils/clipboard", () => ({
    writeClipboardOutcome: writeClipboardOutcomeMock,
}));

vi.mock("@/config/logic", () => ({
    registry: {
        timing: {
            ui: {
                clipboardBadgeMs: 1000,
                toastMs: 2000,
            },
        },
    },
}));

type HookSnapshot = ReturnType<typeof useSettingsModalController> | null;

const latestSnapshot: { current: HookSnapshot } = {
    current: null,
};

function HookHarness({ viewModel }: { viewModel: SettingsModalViewModel }) {
    latestSnapshot.current = useSettingsModalController(viewModel);
    return null;
}

const renderHookHarness = (viewModel: SettingsModalViewModel) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
        flushSync(() => {
            root.render(React.createElement(HookHarness, { viewModel }));
        });
    });

    return {
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
            latestSnapshot.current = null;
        },
    };
};

const advanceTimers = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

const flushMicrotasks = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

const createViewModel = (
    overrides?: Partial<SettingsModalViewModel> & {
        config?: Partial<SettingsConfig>;
    },
): SettingsModalViewModel => ({
    isOpen: true,
    onClose: vi.fn(),
    config: {
        ...DEFAULT_SETTINGS_CONFIG,
        workspace_style: "immersive",
        refresh_interval_ms: 2500,
        request_timeout_ms: 15000,
        table_watermark_enabled: false,
        show_add_torrent_dialog: false,
        show_torrent_server_setup: false,
        ...overrides?.config,
    },
    settingsLoadError: false,
    onTestPort: vi.fn().mockResolvedValue({ status: "unsupported" }),
    capabilities: {
        blocklistSupported: true,
        versionGatedSettings: {
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
        },
    },
    onRestoreInsights: vi.fn(),
    hasDismissedInsights: false,
    onApplyUserPreferencesPatch: vi.fn(),
    onApplySettingsPatch: vi.fn().mockRejectedValue(new Error("offline")),
    ...overrides,
});

describe("useSettingsModalController", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: true,
        });
        useSessionMock.mockReturnValue({
            rpcStatus: status.connection.offline,
            uiCapabilities: {
                uiMode: "Rpc",
                canBrowse: false,
                shellAgentAvailable: false,
                clipboardWriteSupported: false,
            },
        });
        usePreferencesMock.mockReturnValue({
            preferences: {
                settingsTab: "gui",
                addTorrentDefaults: {
                    showAddDialog: false,
                },
            },
            setSettingsTab: vi.fn(),
            setAddTorrentHistory: vi.fn(),
        });
        useDownloadPathsMock.mockReturnValue({
            current: "",
            history: [],
        });
        browseDirectoryMock.mockReset();
        writeClipboardOutcomeMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
        useSessionMock.mockReset();
        usePreferencesMock.mockReset();
        useDownloadPathsMock.mockReset();
        vi.useRealTimers();
        latestSnapshot.current = null;
        Object.assign(globalThis, {
            IS_REACT_ACT_ENVIRONMENT: false,
        });
    });

    it("applies local gui and polling settings without an RPC session", async () => {
        const onApplyUserPreferencesPatch = vi.fn();
        const onApplySettingsPatch = vi.fn();
        const mounted = renderHookHarness(
            createViewModel({
                onApplyUserPreferencesPatch,
                onApplySettingsPatch,
            }),
        );

        try {
            await advanceTimers(0);

            await act(async () => {
                const controller = latestSnapshot.current;
                await controller?.modal.settingsFormActions.onApplySetting(
                    "workspace_style",
                    "classic",
                );
                await controller?.modal.settingsFormActions.onApplySetting(
                    "request_timeout_ms",
                    12000,
                );
            });

            expect(onApplySettingsPatch).not.toHaveBeenCalled();
            expect(onApplyUserPreferencesPatch).toHaveBeenNthCalledWith(1, {
                workspace_style: "classic",
            });
            expect(onApplyUserPreferencesPatch).toHaveBeenNthCalledWith(2, {
                request_timeout_ms: 12000,
            });
            expect(
                latestSnapshot.current?.modal.settingsFormState.config.workspace_style,
            ).toBe("classic");
            expect(
                latestSnapshot.current?.modal.settingsFormState.config.request_timeout_ms,
            ).toBe(12000);
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps local ui resets even when server-backed defaults cannot be pushed offline", async () => {
        const onApplyUserPreferencesPatch = vi.fn();
        const onApplySettingsPatch = vi.fn().mockRejectedValue(new Error("offline"));
        const mounted = renderHookHarness(
            createViewModel({
                onApplyUserPreferencesPatch,
                onApplySettingsPatch,
            }),
        );

        try {
            await advanceTimers(0);

            act(() => {
                latestSnapshot.current?.commands.onReset();
            });
            await flushMicrotasks();

            expect(onApplySettingsPatch).not.toHaveBeenCalled();
            expect(onApplyUserPreferencesPatch).toHaveBeenCalledWith({
                refresh_interval_ms: DEFAULT_SETTINGS_CONFIG.refresh_interval_ms,
                request_timeout_ms: DEFAULT_SETTINGS_CONFIG.request_timeout_ms,
                table_watermark_enabled:
                    DEFAULT_SETTINGS_CONFIG.table_watermark_enabled,
                workspace_style: DEFAULT_SETTINGS_CONFIG.workspace_style,
                show_add_torrent_dialog:
                    DEFAULT_SETTINGS_CONFIG.show_add_torrent_dialog,
                show_torrent_server_setup:
                    DEFAULT_SETTINGS_CONFIG.show_torrent_server_setup,
            });
            expect(
                latestSnapshot.current?.modal.settingsFormState.config.workspace_style,
            ).toBe(DEFAULT_SETTINGS_CONFIG.workspace_style);
            expect(
                latestSnapshot.current?.modal.settingsFormState.config.refresh_interval_ms,
            ).toBe(DEFAULT_SETTINGS_CONFIG.refresh_interval_ms);
            expect(
                latestSnapshot.current?.modal.settingsFormState.config.request_timeout_ms,
            ).toBe(DEFAULT_SETTINGS_CONFIG.request_timeout_ms);
            expect(latestSnapshot.current?.modal.modalError).toBe(
                "settings.modal.error_apply",
            );
        } finally {
            mounted.cleanup();
        }
    });
});
