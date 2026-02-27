import { useEffect, useMemo } from "react";
import { useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import {
    animationSuppressionKeys,
    type AnimationSuppressionKey,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";
import type { SortingState, Row } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

type QueueControllerDeps = {
    sorting: SortingState;
    pendingQueueOrder: string[] | null;
    setPendingQueueOrder: (order: string[] | null) => void;
    rowIds: string[];
    rowsById: Map<string, Row<Torrent>>;
    rowsLength: number;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    setActiveRowId: (id: string | null) => void;
    setDropTargetRowId: (id: string | null) => void;
};

export const useQueueReorderController = (deps: QueueControllerDeps) => {
    const {
        sorting,
        pendingQueueOrder,
        setPendingQueueOrder,
        rowIds,
        rowsById,
        rowsLength,
        beginAnimationSuppression,
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
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

    const { handleRowDragStart, handleRowDragEnd, handleRowDragCancel } =
        useTorrentRowDrag({
            canReorderQueue,
            rowIds,
            rowsById,
            rowsLength,
            sorting,
            setActiveRowId,
            setDropTargetRowId,
            setPendingQueueOrder,
            beginAnimationSuppression,
            endAnimationSuppression,
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
            setDropTargetRowId(null);
            setPendingQueueOrder(null);
            endAnimationSuppression(animationSuppressionKeys.rowDrag);
            endAnimationSuppression(animationSuppressionKeys.queueReorder);
        }
    }, [
        canReorderQueue,
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
        setPendingQueueOrder,
    ]);

    useEffect(() => {
        if (!pendingQueueOrder) return;
        if (rowIds.length !== pendingQueueOrder.length) return;
        for (let i = 0; i < rowIds.length; i += 1) {
            if (rowIds[i] !== pendingQueueOrder[i]) {
                return;
            }
        }
        setPendingQueueOrder(null);
    }, [pendingQueueOrder, rowIds, setPendingQueueOrder]);

    useEffect(() => {
        if (pendingQueueOrder) return;
        endAnimationSuppression(animationSuppressionKeys.queueReorder);
    }, [pendingQueueOrder, endAnimationSuppression]);

    return {
        canReorderQueue,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useQueueReorderController;


