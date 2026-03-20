import { useEffect, useMemo } from "react";
import { useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import {
    animationSuppressionKeys,
    type AnimationSuppressionKey,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";
import type { QueueDropTarget } from "@/modules/dashboard/types/torrentTableSurfaces";
import type { SortingState, Row, RowSelectionState } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

type QueueControllerDeps = {
    sorting: SortingState;
    pendingQueueOrder: string[] | null;
    setPendingQueueOrder: (order: string[] | null) => void;
    serverOrder: string[];
    rowIds: string[];
    rowsById: Map<string, Row<Torrent>>;
    dropTarget: QueueDropTarget | null;
    rowSelection: RowSelectionState;
    setRowSelection: (next: RowSelectionState) => void;
    anchorIndex: number | null;
    focusIndex: number | null;
    rowsLength: number;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    markRowDragInteractionComplete: () => void;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setActiveRowId: (id: string | null) => void;
    setDropTarget: (target: QueueDropTarget | null) => void;
};

export const useQueueReorderController = (deps: QueueControllerDeps) => {
    const {
        sorting,
        pendingQueueOrder,
        setPendingQueueOrder,
        serverOrder,
        rowIds,
        rowsById,
        dropTarget,
        rowSelection,
        setRowSelection,
        anchorIndex,
        focusIndex,
        rowsLength,
        beginAnimationSuppression,
        endAnimationSuppression,
        markRowDragInteractionComplete,
        setAnchorIndex,
        setFocusIndex,
        setActiveRowId,
        setDropTarget,
    } = deps;

    const { dispatch } = useRequiredTorrentActions();

    const isQueueSort = useMemo(
        () =>
            sorting.some(
                (s) =>
                    typeof s === "object" &&
                    (s as { id?: string }).id === "queue"
            ),
        [sorting]
    );
    const canReorderQueue = isQueueSort && Boolean(dispatch);

    const {
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
    } =
        useTorrentRowDrag({
            canReorderQueue,
            rowIds,
            rowsById,
            dropTarget,
            rowSelection,
            setRowSelection,
            anchorIndex,
            focusIndex,
            rowsLength,
            setActiveRowId,
            setDropTarget,
            setAnchorIndex,
            setFocusIndex,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
            markRowDragInteractionComplete,
        });
    if (import.meta.env.DEV) {
        if (
            !Array.isArray(rowIds) ||
            rowIds.length !== rowsLength ||
            rowsLength !== rowsById.size
        ) {
            throw new Error(
                "Queue controller invariant violated: rowIds/rowsLength/rowsById must describe the same row set"
            );
        }
    }

    useEffect(() => {
        if (!canReorderQueue) {
            setActiveRowId(null);
            setDropTarget(null);
            setPendingQueueOrder(null);
            endAnimationSuppression(animationSuppressionKeys.rowDrag);
        }
    }, [
        canReorderQueue,
        endAnimationSuppression,
        setActiveRowId,
        setDropTarget,
        setPendingQueueOrder,
    ]);

    useEffect(() => {
        if (!pendingQueueOrder) return;
        if (serverOrder.length !== pendingQueueOrder.length) return;
        for (let i = 0; i < serverOrder.length; i += 1) {
            if (serverOrder[i] !== pendingQueueOrder[i]) {
                return;
            }
        }
        setPendingQueueOrder(null);
    }, [pendingQueueOrder, serverOrder, setPendingQueueOrder]);

    return {
        canReorderQueue,
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useQueueReorderController;


