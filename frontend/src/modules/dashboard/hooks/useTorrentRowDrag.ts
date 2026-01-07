import React, { useCallback } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

// Parameterized wiring-friendly hook. Provide the dependencies that
// previously lived in `TorrentTable.tsx` as a single object so the
// hook remains a mechanical extraction and the parent keeps ownership
// of state.
export const useTorrentRowDrag = (deps: any) => {
    const {
        canReorderQueue,
        rowIds,
        rowsById,
        onAction,
        sorting,
        rowsLength,
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
        setSuppressLayoutAnimations,
    } = deps;

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            setSuppressLayoutAnimations(true);
            setActiveRowId(event.active.id as string);
        },
        [canReorderQueue, setSuppressLayoutAnimations, setActiveRowId]
    );

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            setActiveRowId(null);
            setDropTargetRowId(null);
            if (!canReorderQueue) return;
            const { active, over } = event;
            if (!active || !over || active.id === over.id) return;
            const draggedIndex = rowIds.indexOf(active.id as string);
            const targetIndex = rowIds.indexOf(over.id as string);
            if (draggedIndex === -1 || targetIndex === -1) return;
            const draggedRow = rowsById.get(active.id as string);
            if (!draggedRow || !onAction) return;

            const queueSort = sorting.find((s: any) => s.id === "queue");
            const isDesc = queueSort?.desc;

            const normalizedFrom = isDesc
                ? rowsLength - 1 - draggedIndex
                : draggedIndex;
            const normalizedTo = isDesc
                ? rowsLength - 1 - targetIndex
                : targetIndex;
            const delta = normalizedTo - normalizedFrom;
            if (delta === 0) return;

            const nextOrder = arrayMove(rowIds, draggedIndex, targetIndex);
            setPendingQueueOrder(nextOrder);

            const actionKey = delta > 0 ? "queue-move-down" : "queue-move-up";
            const steps = Math.abs(delta);
            for (let i = 0; i < steps; i++) {
                // Allow onAction to be either sync or async
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                await onAction(actionKey, draggedRow.original);
            }
        },
        [
            canReorderQueue,
            onAction,
            sorting,
            rowIds,
            rowsById,
            rowsLength,
            setActiveRowId,
            setDropTargetRowId,
            setPendingQueueOrder,
        ]
    );

    const handleRowDragCancel = useCallback(() => {
        setActiveRowId(null);
        setDropTargetRowId(null);
        setPendingQueueOrder(null);
        setSuppressLayoutAnimations(false);
    }, [
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
        setSuppressLayoutAnimations,
    ]);

    return {
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useTorrentRowDrag;
