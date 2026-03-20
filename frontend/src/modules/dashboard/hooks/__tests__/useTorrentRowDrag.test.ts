import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import type { Row } from "@tanstack/react-table";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowSelectionState } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { status } from "@/shared/status";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";

const dispatchMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const useSelectionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/context/AppCommandContext", () => ({
    useRequiredTorrentActions: () => ({
        dispatch: dispatchMock,
    }),
}));

vi.mock("@/app/context/AppShellStateContext", () => ({
    useSelection: () => useSelectionMock(),
}));

type HookValue = ReturnType<typeof useTorrentRowDrag>;

type HarnessRef = {
    getValue: () => HookValue;
};

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    rerender: (deps: Parameters<typeof useTorrentRowDrag>[0]) => Promise<void>;
    cleanup: () => void;
};

type TestRow = Row<Torrent>;

const makeTorrent = (id: string): Torrent => ({
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
});

const makeRow = (id: string): TestRow =>
    ({
        id,
        original: makeTorrent(id),
    } as unknown as TestRow);

const makeSelection = (ids: string[]): RowSelectionState =>
    Object.fromEntries(ids.map((id) => [id, true])) as RowSelectionState;

const flush = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

const makeDragEndEvent = (
    activeId: string,
    overId: string,
    options?: {
        isAfterOver?: boolean;
    },
) =>
    ({
        active: {
            id: activeId,
            rect: {
                current: {
                    translated: {
                        top: options?.isAfterOver ? 45 : 35,
                        height: 10,
                    },
                },
            },
        },
        over: {
            id: overId,
            rect: {
                top: 40,
                height: 10,
            },
        },
    } as never);

const makeDragOverEvent = (
    activeId: string,
    overId: string,
    options?: {
        activeTop?: number;
        activeHeight?: number;
        overTop?: number;
        overHeight?: number;
    },
) =>
    ({
        activatorEvent: {
            clientY: 0,
        },
        delta: {
            x: 0,
            y: 0,
        },
        active: {
            id: activeId,
            rect: {
                current: {
                    translated: {
                        top: options?.activeTop ?? 0,
                        height: options?.activeHeight ?? 10,
                    },
                },
            },
        },
        over: {
            id: overId,
            rect: {
                top: options?.overTop ?? 40,
                height: options?.overHeight ?? 10,
            },
        },
    } as never);

const HookHarness = forwardRef<
    HarnessRef,
    {
        deps: Parameters<typeof useTorrentRowDrag>[0];
    }
>(({ deps }, ref) => {
    const value = useTorrentRowDrag(deps);
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
});

const mountHarness = async (
    deps: Parameters<typeof useTorrentRowDrag>[0],
): Promise<MountedHarness> => {
    const ref = React.createRef<HarnessRef>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = async (nextDeps: Parameters<typeof useTorrentRowDrag>[0]) => {
        root.render(createElement(HookHarness, { ref, deps: nextDeps }));
        await flush();
    };

    await render(deps);

    if (!ref.current) {
        throw new Error("harness_missing");
    }

    return {
        ref,
        rerender: async (nextDeps) => {
            await render(nextDeps);
            if (!ref.current) {
                throw new Error("harness_missing");
            }
        },
        cleanup: () => {
            root.unmount();
            container.remove();
        },
    };
};

const makeBaseDeps = (
    rowIds: string[],
    options: {
        rowSelection: RowSelectionState;
        anchorIndex: number | null;
        focusIndex: number | null;
        dropTarget?: Parameters<typeof useTorrentRowDrag>[0]["dropTarget"];
        activeId?: string | null;
        canReorderQueue?: boolean;
    },
    callbacks: {
        setRowSelection?: ReturnType<typeof vi.fn>;
        setAnchorIndex?: ReturnType<typeof vi.fn>;
        setFocusIndex?: ReturnType<typeof vi.fn>;
        setActiveRowId?: ReturnType<typeof vi.fn>;
        setDropTarget?: ReturnType<typeof vi.fn>;
        setPendingQueueOrder?: ReturnType<typeof vi.fn>;
        beginAnimationSuppression?: ReturnType<typeof vi.fn>;
        endAnimationSuppression?: ReturnType<typeof vi.fn>;
        markRowDragInteractionComplete?: ReturnType<typeof vi.fn>;
        setActiveId?: ReturnType<typeof vi.fn>;
    } = {},
) => {
    const rows = rowIds.map(makeRow);
    const rowsById = new Map(rows.map((row) => [row.id, row] as const));
    const setRowSelection = callbacks.setRowSelection ?? vi.fn();
    const setAnchorIndex = callbacks.setAnchorIndex ?? vi.fn();
    const setFocusIndex = callbacks.setFocusIndex ?? vi.fn();
    const setActiveRowId = callbacks.setActiveRowId ?? vi.fn();
    const setDropTarget = callbacks.setDropTarget ?? vi.fn();
    const setPendingQueueOrder = callbacks.setPendingQueueOrder ?? vi.fn();
    const beginAnimationSuppression =
        callbacks.beginAnimationSuppression ?? vi.fn();
    const endAnimationSuppression = callbacks.endAnimationSuppression ?? vi.fn();
    const markRowDragInteractionComplete =
        callbacks.markRowDragInteractionComplete ?? vi.fn();
    const setActiveId = callbacks.setActiveId ?? vi.fn();

    useSelectionMock.mockReturnValue({
        selectedIds: Object.keys(options.rowSelection),
        setSelectedIds: vi.fn(),
        activeId: options.activeId ?? null,
        setActiveId,
    });

    return {
        deps: {
            canReorderQueue: options.canReorderQueue ?? true,
            rowIds,
            rowsById,
            dropTarget: options.dropTarget ?? null,
            rowSelection: options.rowSelection,
            setRowSelection,
            anchorIndex: options.anchorIndex,
            focusIndex: options.focusIndex,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
            rowsLength: rowIds.length,
        } as Parameters<typeof useTorrentRowDrag>[0],
        callbacks: {
            setRowSelection,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
            setActiveId,
        },
    };
};

type QueueDragStepSpec = {
    order: string[];
    selectedIds: string[];
    draggedId: string;
    dropTarget: {
        rowId: string;
        after: boolean;
    };
    activeId?: string | null;
};

const runQueueDragStep = async (spec: QueueDragStepSpec) => {
    dispatchMock.mockClear();
    const { deps, callbacks } = makeBaseDeps(
        spec.order,
        {
            rowSelection: makeSelection(spec.selectedIds),
            anchorIndex: spec.order.findIndex((rowId) =>
                spec.selectedIds.includes(rowId),
            ),
            focusIndex: (() => {
                for (let i = spec.order.length - 1; i >= 0; i -= 1) {
                    if (spec.selectedIds.includes(spec.order[i])) {
                        return i;
                    }
                }
                return null;
            })(),
            dropTarget: spec.dropTarget,
            activeId: spec.activeId ?? spec.selectedIds[0] ?? null,
        },
        {
            setPendingQueueOrder: vi.fn(),
            setRowSelection: vi.fn(),
            setAnchorIndex: vi.fn(),
            setFocusIndex: vi.fn(),
            setActiveRowId: vi.fn(),
            setDropTarget: vi.fn(),
            beginAnimationSuppression: vi.fn(),
            endAnimationSuppression: vi.fn(),
            markRowDragInteractionComplete: vi.fn(),
            setActiveId: vi.fn(),
        },
    );
    const mounted = await mountHarness(deps);

    try {
        const hook = mounted.ref.current?.getValue();
        if (!hook) {
            throw new Error("hook_missing");
        }

        await hook.handleRowDragStart({
            active: { id: spec.draggedId },
        } as never);
        await hook.handleRowDragEnd(
            makeDragEndEvent(spec.draggedId, spec.dropTarget.rowId, {
                isAfterOver: spec.dropTarget.after,
            }),
        );

        return callbacks;
    } finally {
        mounted.cleanup();
    }
};

const expectPendingOrder = (
    callbacks: ReturnType<typeof makeBaseDeps>["callbacks"],
    expected: string[],
) => {
    expect(callbacks.setPendingQueueOrder).toHaveBeenCalledWith(expected);
};

const rerenderWithOrder = async (
    mounted: MountedHarness,
    order: string[],
    options: {
        selectedIds: string[];
        dropTarget: {
            rowId: string;
            after: boolean;
        } | null;
        activeId?: string | null;
    },
    callbacks: ReturnType<typeof makeBaseDeps>["callbacks"],
) => {
    const nextDeps = makeBaseDeps(
        order,
        {
            rowSelection: makeSelection(options.selectedIds),
            anchorIndex: order.findIndex((rowId) =>
                options.selectedIds.includes(rowId),
            ),
            focusIndex: (() => {
                for (let i = order.length - 1; i >= 0; i -= 1) {
                    if (options.selectedIds.includes(order[i])) {
                        return i;
                    }
                }
                return null;
            })(),
            dropTarget: options.dropTarget,
            activeId: options.activeId ?? options.selectedIds[0] ?? null,
        },
        callbacks,
    );
    await mounted.rerender(nextDeps.deps);
};

describe("useTorrentRowDrag", () => {
    beforeEach(() => {
        dispatchMock.mockClear();
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

    it("realigns keyboard focus to the moved row after a successful queue reorder", async () => {
        const rows = ["row-1", "row-2", "row-3", "row-4", "row-5"].map(makeRow);
        const rowsById = new Map(rows.map((row) => [row.id, row] as const));
        const setAnchorIndex = vi.fn();
        const setFocusIndex = vi.fn();
        const setActiveRowId = vi.fn();
        const setDropTarget = vi.fn();
        const setPendingQueueOrder = vi.fn();
        const setRowSelection = vi.fn();
        const beginAnimationSuppression = vi.fn();
        const endAnimationSuppression = vi.fn();
        const markRowDragInteractionComplete = vi.fn();

        const mounted = await mountHarness({
            canReorderQueue: true,
            rowIds: rows.map((row) => row.id),
            rowsById,
            rowSelection: { "row-2": true },
            setRowSelection,
            anchorIndex: 1,
            focusIndex: 1,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
            rowsLength: rows.length,
        });

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            await hook.handleRowDragStart({ active: { id: "row-2" } } as never);
            await hook.handleRowDragEnd({
                active: { id: "row-2" },
                over: { id: "row-4" },
            } as never);

            expect(setPendingQueueOrder).toHaveBeenCalledWith([
                "row-1",
                "row-3",
                "row-4",
                "row-2",
                "row-5",
            ]);
            expect(setRowSelection).toHaveBeenLastCalledWith({
                "row-2": true,
            });
            expect(setAnchorIndex).toHaveBeenCalledWith(3);
            expect(setFocusIndex).toHaveBeenCalledWith(3);
            expect(dispatchMock).toHaveBeenCalledWith({
                type: "QUEUE_MOVE",
                torrentId: "row-2",
                direction: "down",
                steps: 2,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("normalizes a drop inside the dragged packet against the reduced list", async () => {
        const rows = ["row-1", "row-2", "row-3", "row-4", "row-5"].map(makeRow);
        const rowsById = new Map(rows.map((row) => [row.id, row] as const));
        const setAnchorIndex = vi.fn();
        const setFocusIndex = vi.fn();
        const setActiveRowId = vi.fn();
        const setDropTarget = vi.fn();
        const setPendingQueueOrder = vi.fn();
        const setRowSelection = vi.fn();
        const beginAnimationSuppression = vi.fn();
        const endAnimationSuppression = vi.fn();
        const markRowDragInteractionComplete = vi.fn();
        const setActiveId = vi.fn();
        useSelectionMock.mockReturnValue({
            selectedIds: ["row-1", "row-2", "row-4", "row-5"],
            setSelectedIds: vi.fn(),
            activeId: null,
            setActiveId,
        });

        const mounted = await mountHarness({
            canReorderQueue: true,
            rowIds: rows.map((row) => row.id),
            rowsById,
            rowSelection: {
                "row-1": true,
                "row-2": true,
                "row-4": true,
                "row-5": true,
            } satisfies RowSelectionState,
            setRowSelection,
            anchorIndex: 0,
            focusIndex: 4,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
            rowsLength: rows.length,
        });

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            await hook.handleRowDragStart({ active: { id: "row-1" } } as never);
            await hook.handleRowDragEnd({
                active: {
                    id: "row-1",
                    rect: {
                        current: {
                            translated: {
                                top: 45,
                                height: 10,
                            },
                        },
                    },
                },
                over: {
                    id: "row-4",
                    rect: {
                        top: 40,
                        height: 10,
                    },
                },
            } as never);

            expect(setPendingQueueOrder).toHaveBeenCalledWith([
                "row-3",
                "row-1",
                "row-2",
                "row-4",
                "row-5",
            ]);
            expect(setRowSelection).toHaveBeenLastCalledWith({
                "row-1": true,
                "row-2": true,
                "row-4": true,
                "row-5": true,
            });
            expect(setAnchorIndex).toHaveBeenCalledWith(1);
            expect(setFocusIndex).toHaveBeenCalledWith(4);
            expect(setActiveId).toHaveBeenCalledWith("row-1");
        } finally {
            mounted.cleanup();
        }
    });

    it("stores dropTarget.after from the pointer position over the hovered row midpoint", async () => {
        const rows = ["row-1", "row-2", "row-3"].map(makeRow);
        const rowsById = new Map(rows.map((row) => [row.id, row] as const));
        const setDropTarget = vi.fn();
        const mounted = await mountHarness({
            canReorderQueue: true,
            rowIds: rows.map((row) => row.id),
            rowsById,
            rowSelection: {},
            anchorIndex: null,
            focusIndex: null,
            setRowSelection: vi.fn(),
            setAnchorIndex: vi.fn(),
            setFocusIndex: vi.fn(),
            setActiveRowId: vi.fn(),
            setDropTarget,
            setPendingQueueOrder: vi.fn(),
            beginAnimationSuppression: vi.fn(),
            endAnimationSuppression: vi.fn(),
            markRowDragInteractionComplete: vi.fn(),
            rowsLength: rows.length,
        });

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            await hook.handleRowDragStart({ active: { id: "row-1" } } as never);
            await hook.handleRowDragOver(
                makeDragOverEvent("row-1", "row-2", {
                    activeTop: 30,
                    activeHeight: 10,
                    overTop: 40,
                    overHeight: 10,
                }),
            );
            expect(setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-2",
                after: false,
            });

            await hook.handleRowDragOver(
                makeDragOverEvent("row-1", "row-2", {
                    activeTop: 50,
                    activeHeight: 10,
                    overTop: 40,
                    overHeight: 10,
                }),
            );
            expect(setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-2",
                after: true,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("trusts the stored dropTarget.after on drag end", async () => {
        const rows = ["row-1", "row-2", "row-3"].map(makeRow);
        const rowsById = new Map(rows.map((row) => [row.id, row] as const));
        const setPendingQueueOrder = vi.fn();
        const mounted = await mountHarness({
            canReorderQueue: true,
            rowIds: rows.map((row) => row.id),
            rowsById,
            rowSelection: {},
            anchorIndex: null,
            focusIndex: null,
            dropTarget: { rowId: "row-2", after: false },
            setRowSelection: vi.fn(),
            setAnchorIndex: vi.fn(),
            setFocusIndex: vi.fn(),
            setActiveRowId: vi.fn(),
            setDropTarget: vi.fn(),
            setPendingQueueOrder,
            beginAnimationSuppression: vi.fn(),
            endAnimationSuppression: vi.fn(),
            markRowDragInteractionComplete: vi.fn(),
            rowsLength: rows.length,
        });

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            await hook.handleRowDragStart({ active: { id: "row-3" } } as never);
            await hook.handleRowDragEnd(
                makeDragEndEvent("row-3", "row-2", {
                    isAfterOver: true,
                }),
            );

            expect(setPendingQueueOrder).toHaveBeenCalledWith([
                "row-1",
                "row-3",
                "row-2",
            ]);
        } finally {
            mounted.cleanup();
        }
    });

    it("moves a selected non-contiguous packet after the remaining rows", async () => {
        const rows = ["row-1", "row-2", "row-3", "row-4", "row-5"].map(makeRow);
        const rowsById = new Map(rows.map((row) => [row.id, row] as const));
        const setAnchorIndex = vi.fn();
        const setFocusIndex = vi.fn();
        const setActiveRowId = vi.fn();
        const setDropTarget = vi.fn();
        const setPendingQueueOrder = vi.fn();
        const setRowSelection = vi.fn();
        const beginAnimationSuppression = vi.fn();
        const endAnimationSuppression = vi.fn();
        const markRowDragInteractionComplete = vi.fn();
        const setActiveId = vi.fn();
        useSelectionMock.mockReturnValue({
            selectedIds: ["row-1", "row-4", "row-5"],
            setSelectedIds: vi.fn(),
            activeId: null,
            setActiveId,
        });

        const mounted = await mountHarness({
            canReorderQueue: true,
            rowIds: rows.map((row) => row.id),
            rowsById,
            rowSelection: {
                "row-1": true,
                "row-4": true,
                "row-5": true,
            } satisfies RowSelectionState,
            setRowSelection,
            anchorIndex: 0,
            focusIndex: 4,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
            rowsLength: rows.length,
        });

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) {
                throw new Error("hook_missing");
            }

            await hook.handleRowDragStart({ active: { id: "row-1" } } as never);
            await hook.handleRowDragEnd(
                makeDragEndEvent("row-1", "row-4", {
                    isAfterOver: false,
                }),
            );

            expect(setPendingQueueOrder).toHaveBeenCalledWith([
                "row-2",
                "row-3",
                "row-1",
                "row-4",
                "row-5",
            ]);
            expect(setRowSelection).toHaveBeenLastCalledWith({
                "row-1": true,
                "row-4": true,
                "row-5": true,
            });
            expect(setAnchorIndex).toHaveBeenCalledWith(2);
            expect(setFocusIndex).toHaveBeenCalledWith(4);
            expect(setActiveId).toHaveBeenCalledWith("row-1");
        } finally {
            mounted.cleanup();
        }
    });

    it("moves an unselected row stepwise through a selected packet without stalling", async () => {
        const selectedIds = ["row-1", "row-2", "row-3"];
        let order = ["row-1", "row-2", "row-3", "row-4", "row-5"];

        const steps = [
            {
                dropTarget: { rowId: "row-3", after: false },
                expected: ["row-1", "row-2", "row-4", "row-3", "row-5"],
            },
            {
                dropTarget: { rowId: "row-2", after: false },
                expected: ["row-1", "row-4", "row-2", "row-3", "row-5"],
            },
            {
                dropTarget: { rowId: "row-1", after: false },
                expected: ["row-4", "row-1", "row-2", "row-3", "row-5"],
            },
            {
                dropTarget: { rowId: "row-2", after: false },
                expected: ["row-1", "row-4", "row-2", "row-3", "row-5"],
            },
            {
                dropTarget: { rowId: "row-3", after: false },
                expected: ["row-1", "row-2", "row-4", "row-3", "row-5"],
            },
            {
                dropTarget: { rowId: "row-5", after: false },
                expected: ["row-1", "row-2", "row-3", "row-4", "row-5"],
            },
            {
                dropTarget: { rowId: "row-5", after: true },
                expected: ["row-1", "row-2", "row-3", "row-5", "row-4"],
            },
        ] as const;

        for (const step of steps) {
            const callbacks = await runQueueDragStep({
                order,
                selectedIds,
                draggedId: "row-4",
                dropTarget: step.dropTarget,
            });

            expectPendingOrder(callbacks, [...step.expected]);
            expect(callbacks.setRowSelection).toHaveBeenLastCalledWith(
                makeSelection(selectedIds),
            );
            expect(callbacks.setActiveId).toHaveBeenCalledWith("row-1");
            order = [...step.expected];
        }
    });

    it("moves a selected packet stepwise down to the end and back up without retry-only stalls", async () => {
        const selectedIds = ["row-1", "row-2"];
        let order = ["row-1", "row-2", "row-3", "row-4", "row-5"];
        const { deps, callbacks } = makeBaseDeps(
            order,
            {
                rowSelection: makeSelection(selectedIds),
                anchorIndex: 0,
                focusIndex: 1,
                dropTarget: { rowId: "row-3", after: true },
                activeId: "row-1",
            },
            {
                setPendingQueueOrder: vi.fn(),
                setRowSelection: vi.fn(),
                setAnchorIndex: vi.fn(),
                setFocusIndex: vi.fn(),
                setActiveRowId: vi.fn(),
                setDropTarget: vi.fn(),
                beginAnimationSuppression: vi.fn(),
                endAnimationSuppression: vi.fn(),
                markRowDragInteractionComplete: vi.fn(),
                setActiveId: vi.fn(),
            },
        );

        const mounted = await mountHarness(deps);

        try {
            const steps = [
                {
                    draggedId: "row-1",
                    target: { rowId: "row-3", after: true },
                    translatedTop: 45,
                    expected: ["row-3", "row-1", "row-2", "row-4", "row-5"],
                },
                {
                    draggedId: "row-1",
                    target: { rowId: "row-4", after: true },
                    translatedTop: 45,
                    expected: ["row-3", "row-4", "row-1", "row-2", "row-5"],
                },
                {
                    draggedId: "row-1",
                    target: { rowId: "row-5", after: true },
                    translatedTop: 45,
                    expected: ["row-3", "row-4", "row-5", "row-1", "row-2"],
                },
                {
                    draggedId: "row-1",
                    target: { rowId: "row-5", after: false },
                    translatedTop: -5,
                    expected: ["row-3", "row-4", "row-1", "row-2", "row-5"],
                },
                {
                    draggedId: "row-1",
                    target: { rowId: "row-4", after: false },
                    translatedTop: -5,
                    expected: ["row-3", "row-1", "row-2", "row-4", "row-5"],
                },
                {
                    draggedId: "row-1",
                    target: { rowId: "row-3", after: false },
                    translatedTop: -5,
                    expected: ["row-1", "row-2", "row-3", "row-4", "row-5"],
                },
            ] as const;

            for (const step of steps) {
                const hook = mounted.ref.current?.getValue();
                if (!hook) {
                    throw new Error("hook_missing");
                }

                dispatchMock.mockClear();
                callbacks.setPendingQueueOrder.mockClear();

                await hook.handleRowDragStart({
                    active: { id: step.draggedId },
                } as never);
                await hook.handleRowDragOver(
                    {
                        active: {
                            id: step.draggedId,
                            rect: {
                                current: {
                                    translated: {
                                        top: step.translatedTop,
                                        height: 10,
                                    },
                                },
                            },
                        },
                        over: {
                            id: step.target.rowId,
                            rect: {
                                top: 40,
                                height: 10,
                            },
                        },
                    } as never,
                );
                await hook.handleRowDragEnd(
                    {
                        active: {
                            id: step.draggedId,
                            rect: {
                                current: {
                                    translated: {
                                        top: step.translatedTop,
                                        height: 10,
                                    },
                                },
                            },
                        },
                        over: {
                            id: step.target.rowId,
                            rect: {
                                top: 40,
                                height: 10,
                            },
                        },
                    } as never,
                );

                expect(callbacks.setPendingQueueOrder).toHaveBeenCalledWith(
                    step.expected,
                );
                expect(callbacks.setRowSelection).toHaveBeenLastCalledWith(
                    makeSelection(selectedIds),
                );
                expect(callbacks.setActiveId).toHaveBeenCalledWith("row-1");

                order = [...step.expected];
                await rerenderWithOrder(
                    mounted,
                    order,
                    {
                        selectedIds,
                        dropTarget: null,
                        activeId: "row-1",
                    },
                    callbacks,
                );
            }
        } finally {
            mounted.cleanup();
        }
    });
});
