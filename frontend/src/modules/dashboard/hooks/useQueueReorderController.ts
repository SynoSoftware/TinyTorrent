import { useCallback, useEffect, useRef } from "react";
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
    visibleQueueOrder: string[];
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
        visibleQueueOrder,
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
    const pendingReorderRef = useRef<{
        serverOrder: string[];
        uiStateSnapshot: QueueReorderUiStateSnapshot;
    } | null>(null);

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

    const queueSorting =
        sorting.length === 1 && typeof sorting[0] === "object"
            ? (sorting[0] as { id?: string; desc?: boolean })
            : null;
    const isQueueSort = sorting.length === 0 || queueSorting?.id === "queue";
    const queueSortDescending = Boolean(queueSorting?.desc);
    const canReorderQueue =
        isQueueSort && queueReorderScopeEnabled && Boolean(dispatch);

    const toVisibleQueueOrder = useCallback(
        (order: string[]) =>
            queueSortDescending ? [...order].reverse() : order,
        [queueSortDescending],
    );

    const captureQueueUiStateSnapshot = (): QueueReorderUiStateSnapshot => ({
        rowSelection: { ...rowSelection },
        anchorRowId:
            anchorIndex == null ? null : (visibleQueueOrder[anchorIndex] ?? null),
        focusRowId:
            focusIndex == null ? null : (visibleQueueOrder[focusIndex] ?? null),
        activeId,
    });

    const applyQueueUiState = useCallback(
        (
            order: string[],
            snapshot: QueueReorderUiStateSnapshot,
            pendingOrder: string[] | null = order,
        ) => {
            pendingReorderRef.current =
                pendingOrder == null
                    ? null
                    : {
                          serverOrder,
                          uiStateSnapshot: snapshot,
                      };
            const visibleOrder = toVisibleQueueOrder(order);
            setPendingQueueOrder(pendingOrder);
            setRowSelection(snapshot.rowSelection);
            setAnchorIndex(getOrderIndex(visibleOrder, snapshot.anchorRowId));
            setFocusIndex(getOrderIndex(visibleOrder, snapshot.focusRowId));
            setActiveId(
                snapshot.activeId != null &&
                    visibleOrder.includes(snapshot.activeId)
                    ? snapshot.activeId
                    : null,
            );
        },
        [
            serverOrder,
            setActiveId,
            setAnchorIndex,
            setFocusIndex,
            setPendingQueueOrder,
            setRowSelection,
            toVisibleQueueOrder,
        ],
    );

    const executeResolvedQueueReorder = async (
        reorder: QueueReorderResult,
        uiStateSnapshot: QueueReorderUiStateSnapshot,
    ): Promise<TorrentCommandOutcome> => {
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
                    queueSortDescending ? !after : after,
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
            visibleQueueOrder,
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
            pendingReorderRef.current = null;
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
            pendingReorderRef.current = null;
            setPendingQueueOrder(null);
            return;
        }
        const pendingReorder = pendingReorderRef.current;
        if (
            pendingReorder != null &&
            !areQueueOrdersEqual(serverOrder, pendingReorder.serverOrder)
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
            applyQueueUiState(serverOrder, pendingReorder.uiStateSnapshot, null);
        }
    }, [applyQueueUiState, pendingQueueOrder, serverOrder, setPendingQueueOrder]);

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


