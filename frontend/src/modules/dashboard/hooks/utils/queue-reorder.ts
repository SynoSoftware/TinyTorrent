import type { RowSelectionState } from "@tanstack/react-table";

export type QueueMoveDirection = "top" | "up" | "down" | "bottom";

export type QueuePacket = {
    movingIds: string[];
    currentInsertionIndex: number;
};

export type QueueReorderResult = {
    movingIds: string[];
    nextOrder: string[];
    targetInsertionIndex: number;
};

type QueuePacketParams = {
    queueOrder: string[];
    rowSelection: RowSelectionState;
    actedRowId?: string | null;
    activeRowId?: string | null;
};

export const areQueueOrdersEqual = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

const getSelectedQueueIds = (
    queueOrder: string[],
    rowSelection: RowSelectionState,
) => queueOrder.filter((rowId) => rowSelection[rowId]);

const buildQueuePacket = (
    queueOrder: string[],
    movingIds: string[],
): QueuePacket | null => {
    if (!movingIds.length) {
        return null;
    }

    const currentStart = queueOrder.indexOf(movingIds[0]);
    if (currentStart === -1) {
        return null;
    }
    const movingSet = new Set(movingIds);
    const currentInsertionIndex = queueOrder
        .slice(0, currentStart)
        .filter((rowId) => !movingSet.has(rowId)).length;

    return {
        movingIds,
        currentInsertionIndex,
    };
};

export const resolveQueuePacket = ({
    queueOrder,
    rowSelection,
    actedRowId,
    activeRowId,
}: QueuePacketParams): QueuePacket | null => {
    const selectedQueueIds = getSelectedQueueIds(queueOrder, rowSelection);

    if (actedRowId != null) {
        if (!queueOrder.includes(actedRowId)) {
            return null;
        }

        const movingIds = rowSelection[actedRowId]
            ? selectedQueueIds
            : [actedRowId];

        return buildQueuePacket(queueOrder, movingIds);
    }

    if (selectedQueueIds.length > 0) {
        return buildQueuePacket(queueOrder, selectedQueueIds);
    }

    if (activeRowId != null && queueOrder.includes(activeRowId)) {
        return buildQueuePacket(queueOrder, [activeRowId]);
    }

    return null;
};

const reorderQueuePacket = (
    queueOrder: string[],
    packet: QueuePacket,
    reducedInsertIndex: number,
): QueueReorderResult | null => {
    const movingSet = new Set(packet.movingIds);
    const reducedOrder = queueOrder.filter((rowId) => !movingSet.has(rowId));
    const boundedInsertIndex = Math.max(
        0,
        Math.min(reducedOrder.length, reducedInsertIndex),
    );

    const nextOrder = [
        ...reducedOrder.slice(0, boundedInsertIndex),
        ...packet.movingIds,
        ...reducedOrder.slice(boundedInsertIndex),
    ];
    if (areQueueOrdersEqual(nextOrder, queueOrder)) return null;

    return {
        movingIds: packet.movingIds,
        nextOrder,
        targetInsertionIndex: boundedInsertIndex,
    };
};

export const reorderQueuePacketByDropTarget = (
    queueOrder: string[],
    packet: QueuePacket,
    targetRowId: string,
    after: boolean,
): QueueReorderResult | null => {
    const targetIndex = queueOrder.indexOf(targetRowId);
    if (targetIndex === -1) {
        return null;
    }

    const movingSet = new Set(packet.movingIds);
    const fullInsertIndex = targetIndex + (after ? 1 : 0);
    const removedBeforeInsert = queueOrder
        .slice(0, fullInsertIndex)
        .filter((rowId) => movingSet.has(rowId)).length;

    return reorderQueuePacket(
        queueOrder,
        packet,
        fullInsertIndex - removedBeforeInsert,
    );
};

export const moveQueuePacketByDirection = (
    queueOrder: string[],
    packet: QueuePacket,
    direction: QueueMoveDirection,
): QueueReorderResult | null => {
    const reducedOrderLength = queueOrder.length - packet.movingIds.length;

    switch (direction) {
        case "top":
            return reorderQueuePacket(queueOrder, packet, 0);
        case "bottom":
            return reorderQueuePacket(queueOrder, packet, reducedOrderLength);
        case "up":
            return reorderQueuePacket(
                queueOrder,
                packet,
                Math.max(0, packet.currentInsertionIndex - 1),
            );
        case "down":
            return reorderQueuePacket(
                queueOrder,
                packet,
                Math.min(reducedOrderLength, packet.currentInsertionIndex + 1),
            );
    }
};
