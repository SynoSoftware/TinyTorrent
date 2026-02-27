import { useCallback } from "react";
import { useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { animationSuppressionKeys } from "@/modules/dashboard/hooks/useTableAnimationGuard";
import type { Row, SortingState } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { AnimationSuppressionKey } from "@/modules/dashboard/hooks/useTableAnimationGuard";

// Parameterized wiring-friendly hook. Provide the dependencies that
// previously lived in `TorrentTable.tsx` as a single object so the
// hook remains a mechanical extraction and the parent keeps ownership
// of state.
type UseTorrentRowDragDeps = {
    canReorderQueue: boolean;
    rowIds: string[];
    rowsById: Map<string, Row<Torrent>>;
    sorting: SortingState;
    setActiveRowId: (id: string | null) => void;
    setDropTargetRowId: (id: string | null) => void;
    setPendingQueueOrder: (order: string[] | null) => void;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    rowsLength?: number;
};

export const useTorrentRowDrag = (deps: UseTorrentRowDragDeps) => {
    const {
        canReorderQueue,
        rowIds,
        rowsById,
        sorting,
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
        beginAnimationSuppression,
        endAnimationSuppression,
        rowsLength: providedRowsLength,
    } = deps;
    const rowsLength =
        typeof providedRowsLength === "number"
            ? providedRowsLength
            : rowIds.length;

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            beginAnimationSuppression(animationSuppressionKeys.rowDrag);
            setActiveRowId(event.active.id as string);
        },
        [beginAnimationSuppression, canReorderQueue, setActiveRowId]
    );

    const { dispatch } = useRequiredTorrentActions();

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            setActiveRowId(null);
            setDropTargetRowId(null);
            endAnimationSuppression(animationSuppressionKeys.rowDrag);
            if (!canReorderQueue) return;
            const { active, over } = event;
            if (!active || !over || active.id === over.id) return;
            const draggedIndex = rowIds.indexOf(active.id as string);
            const targetIndex = rowIds.indexOf(over.id as string);
            if (draggedIndex === -1 || targetIndex === -1) return;
            const draggedRow = rowsById.get(active.id as string);
            if (!draggedRow) return;

            const queueSort = sorting.find(
                (s) => (s as { id?: string }).id === "queue"
            );
            const isDesc = (queueSort as { desc?: boolean } | undefined)?.desc;

            const normalizedFrom = isDesc
                ? rowsLength - 1 - draggedIndex
                : draggedIndex;
            const normalizedTo = isDesc
                ? rowsLength - 1 - targetIndex
                : targetIndex;
            const delta = normalizedTo - normalizedFrom;
            if (delta === 0) return;

            const nextOrder = arrayMove(rowIds, draggedIndex, targetIndex);
            beginAnimationSuppression(animationSuppressionKeys.queueReorder);
            setPendingQueueOrder(nextOrder);

            const direction = delta > 0 ? "down" : "up";
            const steps = Math.abs(delta);
            // Dispatch a single QUEUE_MOVE intent (provider maps to legacy handlers)
            await dispatch(
                TorrentIntents.queueMove(
                    draggedRow.original.id ?? draggedRow.original.hash,
                    direction as "up" | "down" | "top" | "bottom",
                    steps
                )
            );
        },
        [
            beginAnimationSuppression,
            canReorderQueue,
            endAnimationSuppression,
            sorting,
            rowIds,
            rowsById,
            rowsLength,
            setActiveRowId,
            setDropTargetRowId,
            setPendingQueueOrder,
            dispatch,
        ]
    );

    const handleRowDragCancel = useCallback(() => {
        setActiveRowId(null);
        setDropTargetRowId(null);
        setPendingQueueOrder(null);
        endAnimationSuppression(animationSuppressionKeys.rowDrag);
        endAnimationSuppression(animationSuppressionKeys.queueReorder);
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


