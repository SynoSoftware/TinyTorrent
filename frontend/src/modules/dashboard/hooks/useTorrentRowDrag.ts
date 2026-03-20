import { useCallback, useRef } from "react";
import { useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import { useSelection } from "@/app/context/AppShellStateContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { animationSuppressionKeys } from "@/modules/dashboard/hooks/useTableAnimationGuard";
import type { QueueDropTarget } from "@/modules/dashboard/types/torrentTableSurfaces";
import type { Row, RowSelectionState } from "@tanstack/react-table";
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
    dropTarget?: QueueDropTarget | null;
    rowSelection: RowSelectionState;
    setRowSelection: (next: RowSelectionState) => void;
    anchorIndex: number | null;
    focusIndex: number | null;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setActiveRowId: (id: string | null) => void;
    setDropTarget: (target: QueueDropTarget | null) => void;
    setPendingQueueOrder: (order: string[] | null) => void;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    markRowDragInteractionComplete: () => void;
    rowsLength?: number;
};

export const useTorrentRowDrag = (deps: UseTorrentRowDragDeps) => {
    const {
        canReorderQueue,
        rowIds,
        rowsById,
        dropTarget = null,
        rowSelection,
        setRowSelection,
        anchorIndex,
        focusIndex,
        setAnchorIndex,
        setFocusIndex,
        setActiveRowId,
        setDropTarget,
        setPendingQueueOrder,
        beginAnimationSuppression,
        endAnimationSuppression,
        markRowDragInteractionComplete,
        rowsLength: providedRowsLength,
    } = deps;
    void providedRowsLength;
    const rowDragActiveRef = useRef(false);
    const dragSelectionSnapshotRef = useRef<{
        draggedId: string;
        draggedWasSelected: boolean;
        rowSelection: RowSelectionState;
        anchorRowId: string | null;
        focusRowId: string | null;
        activeId: string | null;
    } | null>(null);
    const { activeId, setActiveId } = useSelection();

    const reorderRowsAsPacket = useCallback(
        (draggedId: string, dropIndex: number) => {
            const draggedIndex = rowIds.indexOf(draggedId);
            if (draggedIndex === -1) {
                return null;
            }

            const selectedSet = new Set(
                rowIds.filter((rowId) => rowSelection[rowId]),
            );
            const movingIds = selectedSet.has(draggedId)
                ? rowIds.filter((rowId) => selectedSet.has(rowId))
                : [draggedId];
            const movingSet = new Set(movingIds);

            const stayingIds = rowIds.filter((rowId) => !movingSet.has(rowId));
            const removedBeforeDrop = rowIds
                .slice(0, dropIndex)
                .filter((rowId) => movingSet.has(rowId)).length;
            const normalizedInsertIndex = dropIndex - removedBeforeDrop;
            const boundedInsertIndex = Math.max(
                0,
                Math.min(stayingIds.length, normalizedInsertIndex),
            );

            const nextOrder = [
                ...stayingIds.slice(0, boundedInsertIndex),
                ...movingIds,
                ...stayingIds.slice(boundedInsertIndex),
            ];
            if (nextOrder.every((rowId, index) => rowId === rowIds[index])) {
                return null;
            }

            const currentStart = rowIds.indexOf(movingIds[0] ?? draggedId);
            const newStart = boundedInsertIndex;
            const newEnd = newStart + movingIds.length - 1;
            const direction: "up" | "down" =
                newStart < currentStart ? "up" : "down";
            const steps = Math.abs(newStart - currentStart);
            if (steps === 0) {
                return null;
            }

            return {
                draggedId,
                movingIds,
                nextOrder,
                newStart,
                newEnd,
                direction,
                steps,
            };
        },
        [rowIds, rowSelection],
    );

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            const draggedId = String(event.active.id);
            setDropTarget(null);
            const draggedWasSelected = Boolean(rowSelection[draggedId]);
            dragSelectionSnapshotRef.current = {
                draggedId,
                draggedWasSelected,
                rowSelection: { ...rowSelection },
                anchorRowId:
                    anchorIndex == null ? null : (rowIds[anchorIndex] ?? null),
                focusRowId:
                    focusIndex == null ? null : (rowIds[focusIndex] ?? null),
                activeId,
            };
            rowDragActiveRef.current = true;
            beginAnimationSuppression(animationSuppressionKeys.rowDrag);
            setActiveRowId(draggedId);
        },
        [
            activeId,
            anchorIndex,
            beginAnimationSuppression,
            canReorderQueue,
            focusIndex,
            rowIds,
            rowSelection,
            setActiveRowId,
            setDropTarget,
        ]
    );

    const handleRowDragOver = useCallback(
        (event: DragOverEvent) => {
            if (!canReorderQueue) return;
            const { active, over } = event;
            if (!active || !over) return;

            const draggedId = String(active.id);
            const overId = String(over.id);
            if (draggedId === overId) return;

            const overIndex = rowIds.indexOf(overId);
            if (overIndex === -1) return;

            const translatedRect = active.rect?.current?.translated ?? null;
            const activeMidY =
                translatedRect == null
                    ? null
                    : translatedRect.top + translatedRect.height / 2;
            const overRect = over.rect ?? null;
            const overMidY =
                overRect == null ? null : overRect.top + overRect.height / 2;
            const after =
                activeMidY != null && overMidY != null
                    ? activeMidY > overMidY
                    : rowIds.indexOf(draggedId) < overIndex;

            setDropTarget({
                rowId: overId,
                after,
            });
        },
        [canReorderQueue, rowIds, rowSelection, setDropTarget],
    );

    const { dispatch } = useRequiredTorrentActions();

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            const hadActiveDrag = rowDragActiveRef.current;
            rowDragActiveRef.current = false;
            setActiveRowId(null);
            setDropTarget(null);
            endAnimationSuppression(animationSuppressionKeys.rowDrag);
            if (!canReorderQueue) return;
            if (hadActiveDrag) {
                markRowDragInteractionComplete();
            }
            const { active, over } = event;
            if (!active || !over) return;
            const draggedId = String(active.id);
            const reportedOverId = String(over.id);
            const overId = dropTarget?.rowId ?? reportedOverId;
            if (overId === draggedId) return;
            const overIndex = rowIds.indexOf(overId);
            if (overIndex === -1) return;

            const selectedSet = new Set(
                rowIds.filter((rowId) => rowSelection[rowId]),
            );
            const movingIds = selectedSet.has(draggedId)
                ? rowIds.filter((rowId) => selectedSet.has(rowId))
                : [draggedId];
            const translatedRect = active.rect?.current?.translated ?? null;
            const activeMidY =
                translatedRect == null
                    ? null
                    : translatedRect.top + translatedRect.height / 2;
            const overRect = over.rect ?? null;
            const overMidY =
                overRect == null ? null : overRect.top + overRect.height / 2;
            const isAfterOver =
                dropTarget?.after ??
                (activeMidY != null && overMidY != null
                    ? activeMidY > overMidY
                    : rowIds.indexOf(draggedId) < overIndex);

            const reorder = reorderRowsAsPacket(
                draggedId,
                overIndex + (isAfterOver ? 1 : 0),
            );
            if (!reorder) return;

            setPendingQueueOrder(reorder.nextOrder);
            const dragSelectionSnapshot = dragSelectionSnapshotRef.current;
            if (dragSelectionSnapshot?.draggedWasSelected) {
                const nextSelection: RowSelectionState = {};
                reorder.movingIds.forEach((rowId) => {
                    nextSelection[rowId] = true;
                });
                setRowSelection(nextSelection);
                setAnchorIndex(reorder.newStart);
                setFocusIndex(reorder.newEnd);
                setActiveId(reorder.draggedId);
            } else if (dragSelectionSnapshot) {
                setRowSelection(dragSelectionSnapshot.rowSelection);
                if (dragSelectionSnapshot.anchorRowId == null) {
                    setAnchorIndex(null);
                } else {
                    setAnchorIndex(
                        reorder.nextOrder.indexOf(dragSelectionSnapshot.anchorRowId),
                    );
                }
                if (dragSelectionSnapshot.focusRowId == null) {
                    setFocusIndex(null);
                } else {
                    setFocusIndex(
                        reorder.nextOrder.indexOf(dragSelectionSnapshot.focusRowId),
                    );
                }
                setActiveId(dragSelectionSnapshot.activeId);
            }

            const orderedQueueMoveIds =
                reorder.direction === "down"
                    ? [...reorder.movingIds].reverse()
                    : reorder.movingIds;
            let workingOrder = [...rowIds];
            for (const rowId of orderedQueueMoveIds) {
                const currentIndex = workingOrder.indexOf(rowId);
                const targetIndex = reorder.nextOrder.indexOf(rowId);
                if (currentIndex === -1 || targetIndex === -1) {
                    continue;
                }
                const steps = Math.abs(targetIndex - currentIndex);
                if (steps === 0) {
                    continue;
                }
                const row = rowsById.get(rowId);
                await dispatch(
                    TorrentIntents.queueMove(
                        row?.original.id ?? row?.original.hash ?? rowId,
                        reorder.direction,
                        steps,
                    ),
                );
                workingOrder = arrayMove(workingOrder, currentIndex, targetIndex);
            }
            dragSelectionSnapshotRef.current = null;
        },
        [
            canReorderQueue,
            endAnimationSuppression,
            rowsById,
            markRowDragInteractionComplete,
            reorderRowsAsPacket,
            setActiveId,
            setAnchorIndex,
            setFocusIndex,
            setActiveRowId,
            setDropTarget,
            setPendingQueueOrder,
            setRowSelection,
            dispatch,
            dropTarget,
        ]
    );

    const handleRowDragCancel = useCallback(() => {
        const hadActiveDrag = rowDragActiveRef.current;
        rowDragActiveRef.current = false;
        dragSelectionSnapshotRef.current = null;
        setActiveRowId(null);
        setDropTarget(null);
        setPendingQueueOrder(null);
        endAnimationSuppression(animationSuppressionKeys.rowDrag);
        if (hadActiveDrag) {
            markRowDragInteractionComplete();
        }
    }, [
        endAnimationSuppression,
        markRowDragInteractionComplete,
        setActiveRowId,
        setDropTarget,
        setPendingQueueOrder,
    ]);

    return {
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useTorrentRowDrag;


