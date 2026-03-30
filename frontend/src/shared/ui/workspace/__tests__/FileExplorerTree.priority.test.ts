import React, { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorerTree } from "@/shared/ui/workspace/FileExplorerTree";

const mocks = vi.hoisted(() => ({
    useFileExplorerTreeState: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: () => ({
        getVirtualItems: () => [{ key: "row-0", index: 0, size: 24, start: 0 }],
        getTotalSize: () => 24,
        measure: vi.fn(),
        measureElement: () => undefined,
    }),
}));

vi.mock("@/shared/hooks/useLayoutMetrics", () => ({
    default: () => ({
        rowHeight: 24,
    }),
}));

vi.mock("@/shared/ui/layout/toolbar-button", () => ({
    ToolbarIconButton: ({
        ariaLabel,
        onPress,
    }: {
        ariaLabel?: string;
        onPress?: () => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                "data-testid": ariaLabel,
                onClick: () => onPress?.(),
            },
            ariaLabel ?? "toolbar-button",
        ),
}));

vi.mock("@/shared/ui/layout/glass-surface", () => ({
    FILE_BROWSER: {
        container: "",
        toolbar: "",
        toolbarLead: "",
        toolbarActionGroup: "",
        toolsDivider: "",
        searchInputClassNames: {},
        toolbarSearchWrap: "",
        toolbarSpacer: "",
        toolbarSelectionCount: "",
        toolbarSelectionMeasure: "",
        selectionSummaryBase: "",
        selectionSummaryVisible: "",
        selectionSummaryHidden: "",
        headerRow: "",
        headerCheckboxWrap: "",
        headerCellName: "",
        headerCellCenter: "",
        headerCellEnd: "",
        emptyWrap: "",
        emptyOverlay: "",
        emptyIcon: "",
        emptyText: "",
        virtualCanvas: "",
        virtualRow: "",
    },
    FORM_CONTROL: {
        checkboxPrimaryClassNames: {},
        priorityHeaderSelectClassNames: {},
    },
    DETAILS: {
        headerContextActionButton: "",
    },
    SURFACE: {
        menu: {
            surface: "",
            listClassNames: {},
            itemClassNames: {},
        },
    },
    TABLE: {
        columnHeaderLabel: "",
        columnHeaderIcon: "",
    },
}));

vi.mock("@heroui/react", () => ({
    Checkbox: ({
        onValueChange,
    }: {
        onValueChange?: (selected: boolean) => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                onClick: () => onValueChange?.(true),
            },
            "checkbox",
        ),
    Dropdown: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    DropdownItem: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", null, children),
    DropdownMenu: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", null, children),
    DropdownTrigger: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    Input: ({
        value,
        onValueChange,
        placeholder,
    }: {
        value?: string;
        onValueChange?: (value: string) => void;
        placeholder?: string;
    }) =>
        React.createElement("input", {
            value,
            placeholder,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onValueChange?.(event.target.value),
        }),
    Select: ({
        onSelectionChange,
        children,
        "aria-label": ariaLabel,
    }: {
        onSelectionChange?: (keys: Set<React.Key>) => void;
        children?: React.ReactNode;
        "aria-label"?: string;
    }) =>
        React.createElement(
            "div",
            null,
            React.createElement(
                "button",
                {
                    type: "button",
                    "data-testid": ariaLabel,
                    onClick: () => onSelectionChange?.(new Set(["normal"])),
                },
                "select-normal",
            ),
            children,
        ),
    SelectItem: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

vi.mock("@/shared/ui/workspace/useFileExplorerTreeState", () => ({
    useFileExplorerTreeState: mocks.useFileExplorerTreeState,
}));

vi.mock("@/shared/ui/workspace/FileExplorerTreeRow", () => ({
    prioritySelectOptions: [
        {
            key: "high",
            labelKey: "priority.high",
            icon: () => null,
            iconClass: "",
            value: 7,
        },
        {
            key: "normal",
            labelKey: "priority.normal",
            icon: () => null,
            iconClass: "",
            value: 4,
        },
        {
            key: "low",
            labelKey: "priority.low",
            icon: () => null,
            iconClass: "",
            value: 1,
        },
        {
            key: "skip",
            labelKey: "priority.dont_download",
            icon: () => null,
            iconClass: "",
            value: "skip",
        },
    ],
    FileExplorerTreeRow: ({
        onSetPriority,
    }: {
        onSetPriority: (priority: 1 | 4 | 7 | "skip", indexes?: number[]) => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                "data-testid": "row-priority-normal",
                onClick: () => onSetPriority(4, [1]),
            },
            "row-priority-normal",
        ),
}));

type MountedTree = {
    container: HTMLDivElement;
    cleanup: () => void;
};

const mountTree = (viewModel: React.ComponentProps<typeof FileExplorerTree>["viewModel"]): MountedTree => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    flushSync(() => {
        root.render(React.createElement(FileExplorerTree, { viewModel }));
    });
    return {
        container,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

describe("FileExplorerTree priority changes", () => {
    beforeEach(() => {
        mocks.useFileExplorerTreeState.mockReturnValue({
            searchQuery: "",
            setSearchQuery: vi.fn(),
            filterMode: "all",
            setFilterMode: vi.fn(),
            expandedIds: new Set<string>(),
            toggleExpand: vi.fn(),
            expandAll: vi.fn(),
            collapseAll: vi.fn(),
            visibleNodes: [
                {
                    id: "folder/file-1",
                    name: "file-1.mkv",
                    path: "folder/file-1.mkv",
                    isFolder: false,
                    depth: 1,
                    children: [],
                    descendantIndexes: [1],
                    totalSize: 1024,
                    bytesCompleted: 0,
                    progress: 0,
                },
            ],
            fileWantedMap: new Map([[1, false]]),
            filePriorityMap: new Map([[1, 4]]),
        });
    });

    afterEach(() => {
        mocks.useFileExplorerTreeState.mockReset();
        document.body.innerHTML = "";
    });

    it("re-enables skipped files before applying a row priority change", async () => {
        const calls: string[] = [];
        const onFilesToggle = vi.fn(async () => {
            calls.push("toggle");
            return { status: "success" } as const;
        });
        const onSetPriority = vi.fn(async () => {
            calls.push("priority");
        });

        const mounted = mountTree({
            files: [{ index: 1, name: "folder/file-1.mkv", length: 1024, wanted: false, priority: 4 }],
            onFilesToggle,
            onSetPriority,
        });

        try {
            const button = mounted.container.querySelector('[data-testid="row-priority-normal"]');
            if (!(button instanceof HTMLButtonElement)) {
                throw new Error("row_priority_button_missing");
            }

            await act(async () => {
                button.click();
            });

            expect(onFilesToggle).toHaveBeenCalledWith([1], true);
            expect(onSetPriority).toHaveBeenCalledWith([1], 4);
            expect(calls).toEqual(["toggle", "priority"]);
        } finally {
            mounted.cleanup();
        }
    });

    it("re-enables skipped files before applying the header priority change", async () => {
        const calls: string[] = [];
        const onFilesToggle = vi.fn(async () => {
            calls.push("toggle");
            return { status: "success" } as const;
        });
        const onSetPriority = vi.fn(async () => {
            calls.push("priority");
        });

        const mounted = mountTree({
            files: [{ index: 1, name: "folder/file-1.mkv", length: 1024, wanted: false, priority: 4 }],
            onFilesToggle,
            onSetPriority,
        });

        try {
            const button = mounted.container.querySelector('[data-testid="fields.priority"]');
            if (!(button instanceof HTMLButtonElement)) {
                throw new Error("header_priority_button_missing");
            }

            await act(async () => {
                button.click();
            });

            expect(onFilesToggle).toHaveBeenCalledWith([1], true);
            expect(onSetPriority).toHaveBeenCalledWith([1], 4);
            expect(calls).toEqual(["toggle", "priority"]);
        } finally {
            mounted.cleanup();
        }
    });
});
