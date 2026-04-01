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
    fileBrowser: {
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
    formControl: {
        checkboxPrimaryClassNames: {},
        priorityHeaderSelectClassNames: {},
    },
    details: {
        headerContextActionButton: "",
    },
    surface: {
        menu: {
            surface: "",
            listClassNames: {},
            itemClassNames: {},
        },
    },
    table: {
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
        isDisabled,
        "aria-label": ariaLabel,
    }: {
        onSelectionChange?: (keys: Set<React.Key>) => void;
        children?: React.ReactNode;
        isDisabled?: boolean;
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
                    disabled: isDisabled,
                    onClick: () => {
                        if (isDisabled) return;
                        onSelectionChange?.(new Set(["normal"]));
                    },
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
            value: 1,
        },
        {
            key: "normal",
            labelKey: "priority.normal",
            icon: () => null,
            iconClass: "",
            value: 0,
        },
        {
            key: "low",
            labelKey: "priority.low",
            icon: () => null,
            iconClass: "",
            value: -1,
        },
    ],
    FileExplorerTreeRow: ({
        row,
        onSetPriority,
    }: {
        row: {
            isPriorityEnabled: boolean;
            priorityTargetIndexes: readonly number[];
        };
        onSetPriority: (priority: -1 | 0 | 1, indexes?: number[]) => void;
    }) =>
        React.createElement(
            "button",
            {
                type: "button",
                "data-testid": "row-priority-normal",
                disabled: !row.isPriorityEnabled,
                onClick: () => {
                    if (!row.isPriorityEnabled) return;
                    onSetPriority(0, [...row.priorityTargetIndexes]);
                },
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
                    id: "folder",
                    name: "folder",
                    path: "folder",
                    isFolder: true,
                    depth: 0,
                    children: [],
                    descendantIndexes: [0, 1],
                    totalSize: 2048,
                    bytesCompleted: 0,
                    progress: 0,
                },
            ],
            fileWantedMap: new Map([
                [0, false],
                [1, false],
            ]),
            filePriorityMap: new Map([
                [0, 0],
                [1, 0],
            ]),
        });
    });

    afterEach(() => {
        mocks.useFileExplorerTreeState.mockReset();
        document.body.innerHTML = "";
    });

    it("routes row priority changes directly to onSetPriority", async () => {
        const onFilesToggle = vi.fn(async () => ({ status: "success" } as const));
        const onSetPriority = vi.fn(async () => undefined);
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
                    id: "folder",
                    name: "folder",
                    path: "folder",
                    isFolder: true,
                    depth: 0,
                    children: [],
                    descendantIndexes: [0, 1],
                    totalSize: 2048,
                    bytesCompleted: 0,
                    progress: 0,
                },
            ],
            fileWantedMap: new Map([
                [0, true],
                [1, false],
            ]),
            filePriorityMap: new Map([
                [0, 0],
                [1, 0],
            ]),
        });

        const mounted = mountTree({
            files: [
                { index: 0, name: "folder/file-1.mkv", length: 1024, wanted: true, priority: 0 },
                { index: 1, name: "folder/file-2.mkv", length: 1024, wanted: false, priority: 0 },
            ],
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

            expect(onFilesToggle).not.toHaveBeenCalled();
            expect(onSetPriority).toHaveBeenCalledWith([0], 0);
        } finally {
            mounted.cleanup();
        }
    });

    it("routes header priority changes to the wanted subset only", async () => {
        const onFilesToggle = vi.fn(async () => ({ status: "success" } as const));
        const onSetPriority = vi.fn(async () => undefined);
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
                    id: "folder",
                    name: "folder",
                    path: "folder",
                    isFolder: true,
                    depth: 0,
                    children: [],
                    descendantIndexes: [0, 1],
                    totalSize: 2048,
                    bytesCompleted: 0,
                    progress: 0,
                },
            ],
            fileWantedMap: new Map([
                [0, true],
                [1, false],
            ]),
            filePriorityMap: new Map([
                [0, 0],
                [1, 0],
            ]),
        });

        const mounted = mountTree({
            files: [
                { index: 0, name: "folder/file-1.mkv", length: 1024, wanted: true, priority: 0 },
                { index: 1, name: "folder/file-2.mkv", length: 1024, wanted: false, priority: 0 },
            ],
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

            expect(onFilesToggle).not.toHaveBeenCalled();
            expect(onSetPriority).toHaveBeenCalledWith([0], 0);
        } finally {
            mounted.cleanup();
        }
    });

    it("disables priority changes when no wanted targets exist", async () => {
        const onFilesToggle = vi.fn(async () => ({ status: "success" } as const));
        const onSetPriority = vi.fn(async () => undefined);

        const mounted = mountTree({
            files: [
                { index: 0, name: "folder/file-1.mkv", length: 1024, wanted: false, priority: 0 },
                { index: 1, name: "folder/file-2.mkv", length: 1024, wanted: false, priority: 0 },
            ],
            onFilesToggle,
            onSetPriority,
        });

        try {
            const headerButton = mounted.container.querySelector('[data-testid="fields.priority"]');
            const rowButton = mounted.container.querySelector('[data-testid="row-priority-normal"]');
            if (!(headerButton instanceof HTMLButtonElement) || !(rowButton instanceof HTMLButtonElement)) {
                throw new Error("priority_button_missing");
            }

            await act(async () => {
                headerButton.click();
                rowButton.click();
            });

            expect(headerButton.disabled).toBe(true);
            expect(rowButton.disabled).toBe(true);
            expect(onSetPriority).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("renders header columns in name, size, progress, priority order", () => {
        const onFilesToggle = vi.fn(async () => ({ status: "success" } as const));
        const onSetPriority = vi.fn(async () => undefined);

        const mounted = mountTree({
            files: [
                { index: 0, name: "folder/file-1.mkv", length: 1024, wanted: false, priority: 0, bytesCompleted: 256 },
                { index: 1, name: "folder/file-2.mkv", length: 1024, wanted: false, priority: 0, bytesCompleted: 512 },
            ],
            onFilesToggle,
            onSetPriority,
            showProgress: true,
        });

        try {
            const text = mounted.container.textContent ?? "";
            const nameIndex = text.indexOf("fields.name");
            const sizeIndex = text.indexOf("fields.size");
            const progressIndex = text.indexOf("fields.progress");
            const priorityIndex = text.indexOf("select-normal");

            expect(nameIndex).toBeGreaterThanOrEqual(0);
            expect(sizeIndex).toBeGreaterThan(nameIndex);
            expect(progressIndex).toBeGreaterThan(sizeIndex);
            expect(priorityIndex).toBeGreaterThan(progressIndex);
        } finally {
            mounted.cleanup();
        }
    });
});
