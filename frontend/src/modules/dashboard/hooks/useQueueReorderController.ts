import { useEffect, useMemo } from "react";
import {
    ANIMATION_SUPPRESSION_KEYS,
    type AnimationSuppressionKey,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useTorrentRowDrag } from "./useTorrentRowDrag";
import type { SortingState, Row } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";

type QueueControllerDeps = {
    sorting: SortingState;
    onAction?: (
        action: TorrentTableAction,
        torrent: Torrent
    ) => Promise<void> | void | undefined;
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
        onAction,
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

    const isQueueSort = useMemo(
        () =>
            sorting.some(
                (s) => typeof s === "object" && (s as { id?: string }).id === "queue"
            ),
        [sorting]
    );
    const canReorderQueue = isQueueSort && Boolean(onAction);

    const { handleRowDragStart, handleRowDragEnd, handleRowDragCancel } =
        useTorrentRowDrag({
            canReorderQueue,
            rowIds,
            rowsById,
            rowsLength,
            onAction,
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
            endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.rowDrag);
            endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.queueReorder);
        }
    }, [
        canReorderQueue,
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
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
    }, [pendingQueueOrder, rowIds]);

    useEffect(() => {
        if (pendingQueueOrder) return;
        endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.queueReorder);
    }, [pendingQueueOrder, endAnimationSuppression]);

    return {
        canReorderQueue,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
    };
};

export default useQueueReorderController;
