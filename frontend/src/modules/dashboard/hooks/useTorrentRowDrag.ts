import { useCallback } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { ANIMATION_SUPPRESSION_KEYS } from "@/modules/dashboard/hooks/useTableAnimationGuard";

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
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
        beginAnimationSuppression,
        endAnimationSuppression,
    } = deps;
    const rowsLength =
        typeof deps.rowsLength === "number" ? deps.rowsLength : rowIds.length;

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.rowDrag);
            setActiveRowId(event.active.id as string);
        },
        [beginAnimationSuppression, canReorderQueue, setActiveRowId]
    );

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            setActiveRowId(null);
            setDropTargetRowId(null);
            endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.rowDrag);
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
            beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.queueReorder);
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
            beginAnimationSuppression,
            canReorderQueue,
            endAnimationSuppression,
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
        endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.rowDrag);
        endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.queueReorder);
    }, [
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
    ]);

    return {
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useTorrentRowDrag;
