import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import type { Row, RowSelectionState } from "@tanstack/react-table";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { useRowSelectionController } from "@/modules/dashboard/hooks/useRowSelectionController";
import { status } from "@/shared/status";

const useSelectionMock = vi.fn();

vi.mock("@/app/context/AppShellStateContext", () => ({
    useSelection: () => useSelectionMock(),
}));

type HookValue = ReturnType<typeof useRowSelectionController>;

type HarnessRef = {
    getValue: () => HookValue;
};

type TargetKind = "plain" | "button" | "label" | "no-select";

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

type TestRow = Row<Torrent>;

type TestTable = {
    getRowModel: () => { rows: TestRow[] };
    getSelectedRowModel: () => { rows: TestRow[] };
    getRow: (id: string) => TestRow | undefined;
};

type ControllerDeps = Parameters<typeof useRowSelectionController>[0];

const makeTorrent = (
    id: string,
    overrides?: Partial<Torrent>,
): Torrent => ({
    id,
    hash: `${id}-hash`,
    name: id,
    state: status.torrent.downloading,
    speed: {
        down: 0,
        up: 0,
    },
    peerSummary: {
        connected: 0,
    },
    totalSize: 0,
    eta: 0,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
    ...overrides,
});

const makeRow = (
    id: string,
    options?: {
        toggleSelected?: ReturnType<typeof vi.fn>;
        torrentOverrides?: Partial<Torrent>;
    },
): TestRow => ({
    id,
    original: makeTorrent(id, options?.torrentOverrides),
    toggleSelected: options?.toggleSelected ?? vi.fn(),
} as unknown as TestRow);

const makeTable = (rows: TestRow[], rowSelection: RowSelectionState): TestTable => ({
    getRowModel: () => ({ rows }),
    getSelectedRowModel: () => ({
        rows: rows.filter((row) => rowSelection[row.id]),
    }),
    getRow: (id: string) => rows.find((row) => row.id === id),
});

const makeTarget = (kind: TargetKind = "plain"): HTMLElement => ({
    closest: (selector: string) => {
        if (kind === "button" && selector === "button") {
            return {} as Element;
        }
        if (kind === "label" && selector === "label") {
            return {} as Element;
        }
        if (kind === "no-select" && selector === "[data-no-select]") {
            return {} as Element;
        }
        return null;
    },
} as HTMLElement);

const HookHarness = forwardRef<HarnessRef, { deps: ControllerDeps }>(
    ({ deps }, ref) => {
        const value = useRowSelectionController(deps);
        const valueRef = useRef(value);

        useLayoutEffect(() => {
            valueRef.current = value;
        }, [value]);

        useImperativeHandle(
            ref,
            () => ({
                getValue: () => valueRef.current,
            }),
            [],
        );

        return createElement("div");
    },
);

const mountHarness = async (deps: ControllerDeps): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    root.render(createElement(HookHarness, { ref, deps }));

    await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

    if (!ref.current) {
        throw new Error("harness_missing");
    }

    return {
        ref,
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

const createDeps = (overrides?: {
    rows?: TestRow[];
    rowSelection?: RowSelectionState;
    anchorIndex?: number | null;
    focusIndex?: number | null;
}) => {
    const rows = overrides?.rows ?? [makeRow("row-1"), makeRow("row-2")];
    const rowSelection = overrides?.rowSelection ?? {};
    const setRowSelection = vi.fn();
    const setAnchorIndex = vi.fn();
    const setFocusIndex = vi.fn();
    const deps: ControllerDeps = {
        table: makeTable(rows, rowSelection),
        rowIds: rows.map((row) => row.id),
        rowVirtualizerRef: { current: null },
        isMarqueeDraggingRef: { current: false },
        marqueeClickBlockRef: { current: false },
        dragClickBlockRef: { current: false },
        rowSelectionRef: { current: rowSelection },
        rowSelection,
        setRowSelection,
        anchorIndex: overrides?.anchorIndex ?? null,
        setAnchorIndex,
        focusIndex: overrides?.focusIndex ?? null,
        setFocusIndex,
    };

    return {
        deps,
        rows,
        spies: {
            setRowSelection,
            setAnchorIndex,
            setFocusIndex,
        },
    };
};

describe("useRowSelectionController", () => {
    beforeEach(() => {
        useSelectionMock.mockReset();
        useSelectionMock.mockReturnValue({
            selectedIds: [],
            setSelectedIds: vi.fn(),
            activeId: null,
            setActiveId: vi.fn(),
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("activates and selects immediately on plain left pointer-down", async () => {
        const { deps, spies } = createDeps();
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            const setActiveId = useSelectionMock.mock.results[0]?.value
                .setActiveId as ReturnType<typeof vi.fn>;
            setActiveId.mockClear();
            spies.setRowSelection.mockClear();
            spies.setAnchorIndex.mockClear();
            spies.setFocusIndex.mockClear();

            flushSync(() => {
                hook.handleRowPointerDown(
                    {
                        button: 0,
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                );
            });

            expect(setActiveId).toHaveBeenCalledWith("row-1");
            expect(spies.setRowSelection).toHaveBeenCalledWith({
                "row-1": true,
            });
            expect(spies.setAnchorIndex).toHaveBeenCalledWith(0);
            expect(spies.setFocusIndex).toHaveBeenCalledWith(0);
        } finally {
            mounted.cleanup();
        }
    });

    it("suppresses plain release click when pointer activation already handled the non-queue row", async () => {
        const { deps, spies } = createDeps();
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            const setActiveId = useSelectionMock.mock.results[0]?.value
                .setActiveId as ReturnType<typeof vi.fn>;
            setActiveId.mockClear();
            spies.setRowSelection.mockClear();
            spies.setAnchorIndex.mockClear();
            spies.setFocusIndex.mockClear();

            flushSync(() => {
                hook.handleRowClick(
                    {
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                    {
                        suppressPlainClick: true,
                    },
                );
            });

            expect(setActiveId).not.toHaveBeenCalled();
            expect(spies.setRowSelection).not.toHaveBeenCalled();
            expect(spies.setAnchorIndex).not.toHaveBeenCalled();
            expect(spies.setFocusIndex).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("applies plain release click selection in queue-sort fallback mode", async () => {
        const { deps, spies } = createDeps();
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            const setActiveId = useSelectionMock.mock.results[0]?.value
                .setActiveId as ReturnType<typeof vi.fn>;
            setActiveId.mockClear();
            spies.setRowSelection.mockClear();
            spies.setAnchorIndex.mockClear();
            spies.setFocusIndex.mockClear();

            flushSync(() => {
                hook.handleRowClick(
                    {
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                    {
                        suppressPlainClick: false,
                    },
                );
            });

            expect(setActiveId).toHaveBeenCalledWith("row-1");
            expect(spies.setRowSelection).toHaveBeenCalledWith({
                "row-1": true,
            });
            expect(spies.setAnchorIndex).toHaveBeenCalledWith(0);
            expect(spies.setFocusIndex).toHaveBeenCalledWith(0);
        } finally {
            mounted.cleanup();
        }
    });

    it("suppresses the next click after a completed drag interaction", async () => {
        const { deps, spies } = createDeps();
        deps.dragClickBlockRef.current = true;
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            spies.setRowSelection.mockClear();
            spies.setAnchorIndex.mockClear();
            spies.setFocusIndex.mockClear();

            flushSync(() => {
                hook.handleRowClick(
                    {
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                    {
                        suppressPlainClick: false,
                    },
                );
            });

            expect(deps.dragClickBlockRef.current).toBe(false);
            expect(spies.setRowSelection).not.toHaveBeenCalled();
            expect(spies.setAnchorIndex).not.toHaveBeenCalled();
            expect(spies.setFocusIndex).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("ignores drag-click suppression in the non-queue plain-click suppression path", async () => {
        const { deps, spies } = createDeps();
        deps.dragClickBlockRef.current = true;
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            flushSync(() => {
                hook.handleRowClick(
                    {
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                    {
                        suppressPlainClick: true,
                    },
                );
            });

            expect(deps.dragClickBlockRef.current).toBe(true);
            expect(spies.setRowSelection).not.toHaveBeenCalled();
            expect(spies.setAnchorIndex).not.toHaveBeenCalled();
            expect(spies.setFocusIndex).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });

    it("preserves modifier-key selection behavior on release click even when plain clicks are suppressed", async () => {
        const toggleSelected = vi.fn();
        const row = makeRow("row-1", { toggleSelected });
        const { deps, spies } = createDeps({
            rows: [row, makeRow("row-2")],
        });
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            flushSync(() => {
                hook.handleRowClick(
                    {
                        ctrlKey: true,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget(),
                    } as never,
                    "row-1",
                    0,
                    {
                        suppressPlainClick: true,
                    },
                );
            });

            expect(toggleSelected).toHaveBeenCalledTimes(1);
            expect(spies.setAnchorIndex).toHaveBeenCalledWith(0);
            expect(spies.setFocusIndex).toHaveBeenCalledWith(0);
        } finally {
            mounted.cleanup();
        }
    });

    it("ignores interactive descendants for both pointer-down activation and click selection", async () => {
        const { deps, spies } = createDeps();
        const mounted = await mountHarness(deps);
        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            const setActiveId = useSelectionMock.mock.results[0]?.value
                .setActiveId as ReturnType<typeof vi.fn>;
            setActiveId.mockClear();
            spies.setRowSelection.mockClear();
            spies.setAnchorIndex.mockClear();
            spies.setFocusIndex.mockClear();

            flushSync(() => {
                hook.handleRowPointerDown(
                    {
                        button: 0,
                        ctrlKey: false,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget("button"),
                    } as never,
                    "row-1",
                    0,
                );
                hook.handleRowClick(
                    {
                        ctrlKey: true,
                        metaKey: false,
                        shiftKey: false,
                        target: makeTarget("button"),
                    } as never,
                    "row-1",
                    0,
                );
            });

            expect(setActiveId).not.toHaveBeenCalled();
            expect(spies.setRowSelection).not.toHaveBeenCalled();
            expect(spies.setAnchorIndex).not.toHaveBeenCalled();
            expect(spies.setFocusIndex).not.toHaveBeenCalled();
        } finally {
            mounted.cleanup();
        }
    });
});
