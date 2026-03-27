import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "@/app/components/layout/Navbar";
import type { NavbarViewModel } from "@/app/viewModels/useAppViewModel";

let isNativeHostMock = false;

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, string>) =>
            params?.version ? `${key}:${params.version}` : key,
    }),
}));

vi.mock("@heroui/react", () => ({
    Input: ({
        value,
        onChange,
        startContent: _startContent,
        classNames: _classNames,
        ...props
    }: {
        value?: string;
        onChange?: (event: { currentTarget: { value: string } }) => void;
        startContent?: React.ReactNode;
        classNames?: unknown;
        [key: string]: unknown;
    }) =>
        React.createElement("input", {
            ...props,
            value,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onChange?.({ currentTarget: { value: event.target.value } }),
        }),
    Tabs: ({
        children,
        selectedKey: _selectedKey,
        onSelectionChange: _onSelectionChange,
        classNames: _classNames,
        ...props
    }: {
        children?: React.ReactNode;
        selectedKey?: unknown;
        onSelectionChange?: unknown;
        classNames?: unknown;
        [key: string]: unknown;
    }) => React.createElement("div", props, children),
    Tab: ({
        title,
        ...props
    }: {
        title?: React.ReactNode;
        [key: string]: unknown;
    }) => React.createElement("div", props, title),
    cn: (...values: Array<string | false | null | undefined>) =>
        values.filter(Boolean).join(" "),
}));

vi.mock("@/shared/ui/components/TinyTorrentIcon", () => ({
    TinyTorrentIcon: ({ title }: { title?: string }) =>
        React.createElement("span", null, title ?? "TinyTorrent"),
}));

vi.mock("@/shared/ui/components/StatusIcon", () => ({
    __esModule: true,
    default: ({ className }: { className?: string }) =>
        React.createElement("span", { className }),
}));

vi.mock("@/shared/ui/components/AppTooltip", () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));

vi.mock("@/shared/ui/layout/toolbar-button", () => ({
    ToolbarIconButton: ({
        ariaLabel,
        title,
        onPress,
        disabled,
    }: {
        ariaLabel?: string;
        title?: string;
        onPress?: () => void;
        disabled?: boolean;
    }) =>
        React.createElement(
            "button",
            {
                "aria-label": ariaLabel,
                title,
                disabled,
                onClick: onPress,
            },
            ariaLabel,
        ),
}));

vi.mock("@/shared/ui/components/SmoothProgressBar", () => ({
    SmoothProgressBar: () => React.createElement("div", null, "progress"),
}));

vi.mock("@/shared/ui/layout/window-control-button", () => ({
    WindowControlButton: ({
        ariaLabel,
        title,
        onPress,
    }: {
        ariaLabel?: string;
        title?: string;
        onPress?: () => void;
    }) =>
        React.createElement(
            "button",
            {
                "aria-label": ariaLabel,
                title,
                onClick: onPress,
            },
            ariaLabel,
        ),
}));

vi.mock("@/app/context/AppShellStateContext", () => ({
    useFocusState: () => ({
        setActivePart: vi.fn(),
    }),
}));

vi.mock("@/app/context/PreferencesContext", () => ({
    usePreferences: () => ({
        preferences: { theme: "dark" as const },
        toggleTheme: vi.fn(),
    }),
}));

vi.mock("@/app/runtime", () => ({
    default: {
        get isNativeHost() {
            return isNativeHostMock;
        },
    },
}));

const createViewModel = (
    overrides: Partial<NavbarViewModel> = {},
): NavbarViewModel => ({
    filter: "all",
    searchQuery: "",
    uiMode: "Rpc",
    setFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    onAddTorrent: vi.fn(),
    onAddMagnet: vi.fn(),
    onSettings: vi.fn(),
    hasSelection: false,
    emphasizeActions: {
        pause: false,
        reannounce: false,
        changeLocation: false,
        openFolder: false,
        forceRecheck: false,
    },
    selectionActions: {
        ensureActive: vi.fn(),
        ensurePaused: vi.fn(),
        ensureValid: vi.fn(),
        ensureRemoved: vi.fn(),
    },
    workspaceStyle: "classic",
    onWindowCommand: vi.fn(),
    ...overrides,
});

describe("Navbar", () => {
    beforeEach(() => {
        isNativeHostMock = false;
    });

    it("hides the last island in browser mode", () => {
        isNativeHostMock = false;
        const markup = renderToStaticMarkup(
            React.createElement(Navbar, {
                viewModel: createViewModel({ uiMode: "Rpc" }),
            }),
        );

        expect(markup).not.toContain("toolbar.minimize");
        expect(markup).not.toContain("toolbar.maximize");
        expect(markup).not.toContain("toolbar.close");
    });

    it("shows the last island in native host mode", () => {
        isNativeHostMock = true;
        const markup = renderToStaticMarkup(
            React.createElement(Navbar, {
                viewModel: createViewModel({ uiMode: "Rpc" }),
            }),
        );

        expect(markup).toContain("toolbar.minimize");
        expect(markup).toContain("toolbar.maximize");
        expect(markup).toContain("toolbar.close");
    });
});
