import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import TorrentTable_HeaderMenu from "@/modules/dashboard/components/TorrentTable_HeaderMenu";
import type { TorrentTableHeaderMenuViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
        React.createElement(React.Fragment, null, children)
    ),
}));

vi.mock("@heroui/react", () => ({
    Dropdown: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownTrigger: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownSection: ({ children }: { children: React.ReactNode }) => (
        React.createElement("div", null, children)
    ),
    DropdownItem: ({
        children,
        onPress,
        startContent,
    }: {
        children: React.ReactNode;
        onPress?: () => void;
        startContent?: React.ReactNode;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                onClick: () => onPress?.(),
            },
            startContent,
            React.createElement("span", null, children),
        ),
    Checkbox: ({
        isSelected,
        onValueChange,
    }: {
        isSelected?: boolean;
        onValueChange?: (value: boolean) => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                "data-testid": "header-menu-checkbox",
                "data-selected": isSelected,
                onClick: () => onValueChange?.(!isSelected),
            },
            "checkbox",
        ),
    cn: (...parts: Array<string | undefined | false>) =>
        parts.filter(Boolean).join(" "),
}));

describe("TorrentTable_HeaderMenu", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("toggles a column when its checkbox is clicked", async () => {
        const toggleVisibility = vi.fn();
        const viewModel: TorrentTableHeaderMenuViewModel = {
            headerMenuTriggerRect: {
                top: 10,
                left: 20,
                width: 0,
                height: 0,
                right: 20,
                bottom: 10,
                x: 20,
                y: 10,
                toJSON: () => ({}),
            },
            onClose: vi.fn(),
            headerMenuActiveColumn: null,
            headerMenuItems: [
                {
                    label: "Status",
                    isPinned: false,
                    column: {
                        id: "status",
                        getIsVisible: () => true,
                        toggleVisibility,
                    } as never,
                },
            ],
            headerMenuHideLabel: "Hide",
            isHeaderMenuHideEnabled: false,
            autoFitAllColumns: vi.fn(),
            handleHeaderMenuAction: (action) => {
                action();
            },
        };

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root: Root = createRoot(container);

        await act(async () => {
            root.render(React.createElement(TorrentTable_HeaderMenu, { viewModel }));
        });

        const checkbox = container.querySelector(
            "[data-testid='header-menu-checkbox']",
        ) as HTMLButtonElement | null;

        expect(checkbox).not.toBeNull();

        await act(async () => {
            checkbox?.click();
        });

        expect(toggleVisibility).toHaveBeenCalledWith(false);

        root.unmount();
        container.remove();
    });
});
