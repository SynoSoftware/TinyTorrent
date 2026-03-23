import { useCallback, useRef } from "react";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { animationSuppressionKeys } from "@/modules/dashboard/hooks/useTableAnimationGuard";
import type { QueueDropTarget } from "@/modules/dashboard/types/torrentTableSurfaces";
import type { AnimationSuppressionKey } from "@/modules/dashboard/hooks/useTableAnimationGuard";

type QueueReorderUiStateSnapshot = {
    rowSelection: Record<string, boolean>;
    anchorRowId: string | null;
    focusRowId: string | null;
    activeId: string | null;
};

const resolveDropAfter = (
    queueOrder: string[],
    draggedRowId: string,
    targetRowId: string,
) => {
    const draggedIndex = queueOrder.indexOf(draggedRowId);
    const targetIndex = queueOrder.indexOf(targetRowId);

    if (draggedIndex === -1 || targetIndex === -1) {
        return false;
    }

    return draggedIndex < targetIndex;
};

// Parameterized wiring-friendly hook. Provide the dependencies that
// previously lived in `TorrentTable.tsx` as a single object so the
// hook remains a mechanical extraction and the parent keeps ownership
// of state.
type UseTorrentRowDragDeps = {
    canReorderQueue: boolean;
    queueOrder: string[];
    dropTarget?: QueueDropTarget | null;
    setActiveRowId: (id: string | null) => void;
    setDropTarget: (target: QueueDropTarget | null) => void;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    markRowDragInteractionComplete: () => void;
    captureQueueUiStateSnapshot: () => QueueReorderUiStateSnapshot;
    executeDroppedQueueReorder: (
        draggedRowId: string,
        targetRowId: string,
        after: boolean,
        snapshot: QueueReorderUiStateSnapshot,
    ) => Promise<TorrentCommandOutcome>;
};

export const useTorrentRowDrag = (deps: UseTorrentRowDragDeps) => {
    const {
        canReorderQueue,
        queueOrder,
        dropTarget = null,
        setActiveRowId,
        setDropTarget,
        beginAnimationSuppression,
        endAnimationSuppression,
        markRowDragInteractionComplete,
        captureQueueUiStateSnapshot,
        executeDroppedQueueReorder,
    } = deps;
    const rowDragActiveRef = useRef(false);
    const dragSelectionSnapshotRef = useRef<QueueReorderUiStateSnapshot | null>(
        null,
    );

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            const draggedId = String(event.active.id);
            setDropTarget(null);
            dragSelectionSnapshotRef.current = captureQueueUiStateSnapshot();
            rowDragActiveRef.current = true;
            beginAnimationSuppression(animationSuppressionKeys.rowDrag);
            setActiveRowId(draggedId);
        },
        [
            beginAnimationSuppression,
            canReorderQueue,
            captureQueueUiStateSnapshot,
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

            const after = resolveDropAfter(
                queueOrder,
                draggedId,
                overId,
            );

            setDropTarget({
                rowId: overId,
                after,
            });
        },
        [canReorderQueue, queueOrder, setDropTarget],
    );

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
            const isAfterOver =
                dropTarget?.after ??
                resolveDropAfter(
                    queueOrder,
                    draggedId,
                    overId,
                );

            const dragSelectionSnapshot = dragSelectionSnapshotRef.current;
            if (dragSelectionSnapshot) {
                await executeDroppedQueueReorder(
                    draggedId,
                    overId,
                    isAfterOver,
                    dragSelectionSnapshot,
                );
            }
            dragSelectionSnapshotRef.current = null;
        },
        [
            canReorderQueue,
            endAnimationSuppression,
            executeDroppedQueueReorder,
            markRowDragInteractionComplete,
            setActiveRowId,
            setDropTarget,
            dropTarget,
            queueOrder,
        ]
    );

    const handleRowDragCancel = useCallback(() => {
        const hadActiveDrag = rowDragActiveRef.current;
        rowDragActiveRef.current = false;
        dragSelectionSnapshotRef.current = null;
        setActiveRowId(null);
        setDropTarget(null);
        endAnimationSuppression(animationSuppressionKeys.rowDrag);
        if (hadActiveDrag) {
            markRowDragInteractionComplete();
        }
    }, [
        endAnimationSuppression,
        markRowDragInteractionComplete,
        setActiveRowId,
        setDropTarget,
    ]);

    return {
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useTorrentRowDrag;


