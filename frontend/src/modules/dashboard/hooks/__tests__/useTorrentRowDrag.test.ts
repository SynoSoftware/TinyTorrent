import React, {
    createElement,
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commandOutcome } from "@/app/context/AppCommandContext";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";

type HookValue = ReturnType<typeof useTorrentRowDrag>;

type HarnessRef = {
    getValue: () => HookValue;
};

type MountedHarness = {
    ref: React.RefObject<HarnessRef | null>;
    cleanup: () => void;
};

const flush = () =>
    new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
    });

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
    root.render(createElement(HookHarness, { ref, deps }));
    await flush();

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

const makeDragOverEvent = (activeId: string, overId: string) =>
    ({
        active: {
            id: activeId,
        },
        over: {
            id: overId,
        },
    } as never);

const makeDragEndEvent = (activeId: string, overId: string) =>
    ({
        active: {
            id: activeId,
        },
        over: {
            id: overId,
        },
    } as never);
const makeDragStartEvent = (activeId: string) => ({ active: { id: activeId } } as never);

const makeDeps = (
    overrides: Partial<Parameters<typeof useTorrentRowDrag>[0]> = {},
) => {
    const captureQueueUiStateSnapshot = vi.fn(() => ({
        rowSelection: { "row-2": true },
        anchorRowId: "row-2",
        focusRowId: "row-2",
        activeId: "row-2",
    }));

    const deps: Parameters<typeof useTorrentRowDrag>[0] = {
        canReorderQueue: true,
        queueOrder: ["row-1", "row-2", "row-3"],
        dropTarget: null,
        setActiveRowId: vi.fn(),
        setDropTarget: vi.fn(),
        beginAnimationSuppression: vi.fn(),
        endAnimationSuppression: vi.fn(),
        markRowDragInteractionComplete: vi.fn(),
        captureQueueUiStateSnapshot,
        executeDroppedQueueReorder: vi.fn(async () => commandOutcome.success()),
        ...overrides,
    };

    return {
        deps,
        callbacks: {
            captureQueueUiStateSnapshot,
            executeDroppedQueueReorder:
                deps.executeDroppedQueueReorder as ReturnType<typeof vi.fn>,
            setActiveRowId: deps.setActiveRowId as ReturnType<typeof vi.fn>,
            setDropTarget: deps.setDropTarget as ReturnType<typeof vi.fn>,
            beginAnimationSuppression:
                deps.beginAnimationSuppression as ReturnType<typeof vi.fn>,
            endAnimationSuppression:
                deps.endAnimationSuppression as ReturnType<typeof vi.fn>,
            markRowDragInteractionComplete:
                deps.markRowDragInteractionComplete as ReturnType<typeof vi.fn>,
        },
    };
};

describe("useTorrentRowDrag", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("stores insert-before when dragging upward over a row", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragOver(makeDragOverEvent("row-3", "row-2"));
            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-2",
                after: false,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("stores insert-after when dragging downward over a row", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragOver(makeDragOverEvent("row-1", "row-2"));
            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-2",
                after: true,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("treats dragging below the last row as insert-after", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragOver(makeDragOverEvent("row-1", "row-3"));

            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-3",
                after: true,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("treats dragging above the first row as insert-before", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragOver(makeDragOverEvent("row-3", "row-1"));

            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-1",
                after: false,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("delegates drag-end reorder with the captured snapshot and stored drop target", async () => {
        const { deps, callbacks } = makeDeps({
            dropTarget: { rowId: "row-2", after: false },
        });
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragStart(makeDragStartEvent("row-3"));
            await hook.handleRowDragEnd(makeDragEndEvent("row-3", "row-2"));

            expect(callbacks.executeDroppedQueueReorder).toHaveBeenCalledWith(
                "row-3",
                "row-2",
                false,
                {
                    rowSelection: { "row-2": true },
                    anchorRowId: "row-2",
                    focusRowId: "row-2",
                    activeId: "row-2",
                },
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("falls back to sortable slot semantics when no stored drop target exists", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragStart(makeDragStartEvent("row-1"));
            await hook.handleRowDragEnd(makeDragEndEvent("row-1", "row-2"));

            expect(callbacks.executeDroppedQueueReorder).toHaveBeenCalledWith(
                "row-1",
                "row-2",
                true,
                expect.any(Object),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("keeps adjacent downward moves as insert-after", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragStart(makeDragStartEvent("row-1"));
            hook.handleRowDragOver(makeDragOverEvent("row-1", "row-2"));

            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith({
                rowId: "row-2",
                after: true,
            });
        } finally {
            mounted.cleanup();
        }
    });

    it("uses edge-aware fallback semantics on drag end when no stored drop target exists", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragStart(makeDragStartEvent("row-3"));
            await hook.handleRowDragEnd(makeDragEndEvent("row-3", "row-1"));

            expect(callbacks.executeDroppedQueueReorder).toHaveBeenCalledWith(
                "row-3",
                "row-1",
                false,
                expect.any(Object),
            );
        } finally {
            mounted.cleanup();
        }
    });

    it("clears drag state on cancel", async () => {
        const { deps, callbacks } = makeDeps();
        const mounted = await mountHarness(deps);

        try {
            const hook = mounted.ref.current?.getValue();
            if (!hook) throw new Error("hook_missing");

            hook.handleRowDragStart(makeDragStartEvent("row-1"));
            hook.handleRowDragCancel();

            expect(callbacks.setActiveRowId).toHaveBeenNthCalledWith(1, "row-1");
            expect(callbacks.setActiveRowId).toHaveBeenLastCalledWith(null);
            expect(callbacks.setDropTarget).toHaveBeenLastCalledWith(null);
            expect(callbacks.markRowDragInteractionComplete).toHaveBeenCalledTimes(1);
        } finally {
            mounted.cleanup();
        }
    });
});
