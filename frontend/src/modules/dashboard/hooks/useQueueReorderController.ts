import { useEffect, useRef } from "react";
import { useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import { useSelection } from "@/app/context/AppShellStateContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import {
    animationSuppressionKeys,
    type AnimationSuppressionKey,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";
import { commandOutcome, type TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { QueueDropTarget } from "@/modules/dashboard/types/torrentTableSurfaces";
import { isQueueTableAction, type TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { SortingState, RowSelectionState } from "@tanstack/react-table";
import {
    areQueueOrdersEqual,
    moveQueuePacketByDirection,
    reorderQueuePacketByDropTarget,
    resolveQueuePacket,
    type QueuePacket,
    type QueueReorderResult,
} from "@/modules/dashboard/hooks/utils/queue-reorder";
import { infraLogger } from "@/shared/utils/infraLogger";

type QueueControllerDeps = {
    sorting: SortingState;
    queueReorderScopeEnabled: boolean;
    pendingQueueOrder: string[] | null;
    setPendingQueueOrder: (order: string[] | null) => void;
    serverOrder: string[];
    queueOrder: string[];
    dropTarget: QueueDropTarget | null;
    rowSelection: RowSelectionState;
    setRowSelection: (next: RowSelectionState) => void;
    anchorIndex: number | null;
    focusIndex: number | null;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    markRowDragInteractionComplete: () => void;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setActiveRowId: (id: string | null) => void;
    setDropTarget: (target: QueueDropTarget | null) => void;
};

type QueueReorderUiStateSnapshot = {
    rowSelection: RowSelectionState;
    anchorRowId: string | null;
    focusRowId: string | null;
    activeId: string | null;
};

const getOrderIndex = (order: string[], rowId: string | null) => {
    if (rowId == null) return null;
    const index = order.indexOf(rowId);
    return index === -1 ? null : index;
};

export const useQueueReorderController = (deps: QueueControllerDeps) => {
    const {
        sorting,
        queueReorderScopeEnabled,
        pendingQueueOrder,
        setPendingQueueOrder,
        serverOrder,
        queueOrder,
        dropTarget,
        rowSelection,
        setRowSelection,
        anchorIndex,
        focusIndex,
        beginAnimationSuppression,
        endAnimationSuppression,
        markRowDragInteractionComplete,
        setAnchorIndex,
        setFocusIndex,
        setActiveRowId,
        setDropTarget,
    } = deps;

    const { dispatch } = useRequiredTorrentActions();
    const { activeId, setActiveId } = useSelection();
    const pendingServerOrderRef = useRef<string[] | null>(null);

    const commitQueueReorder = async (
        reorder: QueueReorderResult,
    ): Promise<TorrentCommandOutcome> => {
        const outcome = await dispatch(
            TorrentIntents.queueReorder(
                reorder.movingIds,
                queueOrder,
                reorder.targetInsertionIndex,
            ),
        );

        return outcome.status === "applied"
            ? commandOutcome.success()
            : outcome.status === "unsupported"
              ? commandOutcome.unsupported()
              : commandOutcome.failed("execution_failed");
    };

    const isQueueSort =
        sorting.length === 1 &&
        typeof sorting[0] === "object" &&
        (sorting[0] as { id?: string; desc?: boolean }).id === "queue" &&
        !Boolean((sorting[0] as { desc?: boolean }).desc);
    const canReorderQueue =
        isQueueSort && queueReorderScopeEnabled && Boolean(dispatch);

    const captureQueueUiStateSnapshot = (): QueueReorderUiStateSnapshot => ({
        rowSelection: { ...rowSelection },
        anchorRowId: anchorIndex == null ? null : (queueOrder[anchorIndex] ?? null),
        focusRowId: focusIndex == null ? null : (queueOrder[focusIndex] ?? null),
        activeId,
    });

    const applyQueueUiState = (
        order: string[],
        snapshot: QueueReorderUiStateSnapshot,
        pendingOrder: string[] | null = order,
    ) => {
        pendingServerOrderRef.current = pendingOrder == null ? null : serverOrder;
        setPendingQueueOrder(pendingOrder);
        setRowSelection(snapshot.rowSelection);
        setAnchorIndex(getOrderIndex(order, snapshot.anchorRowId));
        setFocusIndex(getOrderIndex(order, snapshot.focusRowId));
        setActiveId(
            snapshot.activeId != null && order.includes(snapshot.activeId)
                ? snapshot.activeId
                : null,
        );
    };

    const executeResolvedQueueReorder = async (
        reorder: QueueReorderResult,
        uiStateSnapshot: QueueReorderUiStateSnapshot,
    ): Promise<TorrentCommandOutcome> => {
        infraLogger.debug({
            scope: "queue_reorder",
            event: "optimistic_apply",
            message: "Applying semantic queue reorder optimistically",
            details: {
                currentOrder: queueOrder,
                movingIds: reorder.movingIds,
                targetInsertionIndex: reorder.targetInsertionIndex,
                nextOrder: reorder.nextOrder,
            },
        });
        applyQueueUiState(reorder.nextOrder, uiStateSnapshot);

        const outcome = await commitQueueReorder(reorder);
        if (outcome.status === "success") {
            return outcome;
        }

        applyQueueUiState(queueOrder, uiStateSnapshot, null);

        return outcome;
    };

    const resolveAndExecuteQueueReorder = async (
        actedRowId: string | null | undefined,
        queueActiveRowId: string | null,
        uiStateSnapshot: QueueReorderUiStateSnapshot,
        resolveReorder: (packet: QueuePacket) => QueueReorderResult | null,
    ): Promise<TorrentCommandOutcome> => {
        const packet = resolveQueuePacket({
            queueOrder,
            rowSelection,
            actedRowId,
            activeRowId: queueActiveRowId,
        });
        if (!packet) {
            return commandOutcome.noSelection();
        }

        const reorder = resolveReorder(packet);
        if (!reorder) {
            return commandOutcome.success();
        }

        return executeResolvedQueueReorder(reorder, uiStateSnapshot);
    };

    const executeDroppedQueueReorder = async (
        draggedRowId: string,
        targetRowId: string,
        after: boolean,
        uiStateSnapshot: QueueReorderUiStateSnapshot,
    ): Promise<TorrentCommandOutcome> =>
        resolveAndExecuteQueueReorder(
            draggedRowId,
            uiStateSnapshot.activeId,
            uiStateSnapshot,
            (packet) =>
                reorderQueuePacketByDropTarget(
                    queueOrder,
                    packet,
                    targetRowId,
                    after,
                ),
        );

    const {
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
    } =
        useTorrentRowDrag({
            canReorderQueue,
            queueOrder,
            dropTarget,
            setActiveRowId,
            setDropTarget,
            beginAnimationSuppression,
            endAnimationSuppression,
        markRowDragInteractionComplete,
        captureQueueUiStateSnapshot,
        executeDroppedQueueReorder,
    });

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
        if (areQueueOrdersEqual(serverOrder, pendingQueueOrder)) {
            infraLogger.debug({
                scope: "queue_reorder",
                event: "backend_converged",
                message: "Backend queue order matched the optimistic queue reorder target",
                details: {
                    serverOrder,
                },
            });
            pendingServerOrderRef.current = null;
            setPendingQueueOrder(null);
            return;
        }
        const pendingServerOrder = pendingServerOrderRef.current;
        if (
            pendingServerOrder != null &&
            !areQueueOrdersEqual(serverOrder, pendingServerOrder)
        ) {
            infraLogger.warn({
                scope: "queue_reorder",
                event: "backend_order_mismatch",
                message:
                    "Backend queue order diverged from the optimistic queue reorder target",
                details: {
                    serverOrder,
                    pendingQueueOrder,
                },
            });
            pendingServerOrderRef.current = null;
            setPendingQueueOrder(null);
        }
    }, [pendingQueueOrder, serverOrder, setPendingQueueOrder]);

    const executeQueueAction = async (
        action: TorrentTableAction,
        options?: {
            rowId?: string | null;
        },
    ): Promise<TorrentCommandOutcome> => {
        if (!isQueueTableAction(action) || !canReorderQueue) {
            return commandOutcome.unsupported();
        }

        return resolveAndExecuteQueueReorder(
            options?.rowId,
            activeId,
            captureQueueUiStateSnapshot(),
            (packet) =>
                moveQueuePacketByDirection(
                    queueOrder,
                    packet,
                    action === "queue-move-top"
                        ? "top"
                        : action === "queue-move-bottom"
                          ? "bottom"
                          : action === "queue-move-up"
                            ? "up"
                            : "down",
                ),
        );
    };

    return {
        canReorderQueue,
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
        executeQueueAction,
    };
};

export default useQueueReorderController;


