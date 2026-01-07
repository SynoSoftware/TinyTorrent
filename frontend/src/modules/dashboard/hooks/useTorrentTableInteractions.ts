import React, { useCallback } from "react";
import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import { useTorrentTableKeyboard } from "./useTorrentTableKeyboard";
import { useTorrentRowDrag } from "./useTorrentRowDrag";

// Hook: provide DnD sensors and table interaction handlers.
// Extracted from `TorrentTable.tsx` and parameterized via a deps object.
export const useTorrentTableInteractions = (deps: any = {}) => {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor)
    );

    // Reuse the same sensor set for rows to avoid duplicate setup.
    const rowSensors = sensors;

    // Wiring: keep this hook as pure orchestration glue. Only pull
    // the small set of values needed for the column-drag handlers.
    const { setActiveDragHeaderId, setColumnOrder, table } = deps;

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragHeaderId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragHeaderId(null);
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            setColumnOrder((order: any) => {
                const oldIndex = order.indexOf(active.id as string);
                const newIndex = order.indexOf(over.id as string);
                if (oldIndex < 0 || newIndex < 0) return order;
                const move = deps.arrayMove as any;
                if (!move) return order;
                const next = move(order, oldIndex, newIndex);
                try {
                    table.setColumnOrder(next as string[]);
                } catch {}
                return next;
            });
        }
    };

    const handleDragCancel = () => {
        setActiveDragHeaderId(null);
    };

    // Delegate row-drag and keyboard to specialized hooks. Forward the
    // full deps object so those hooks can pick what they need.
    const { handleRowDragStart, handleRowDragEnd, handleRowDragCancel } =
        useTorrentRowDrag(deps);

    const { handleKeyDown } = useTorrentTableKeyboard(deps);

    return {
        sensors,
        rowSensors,
        handleDragStart,
        handleDragEnd,
        handleDragCancel,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
        handleKeyDown,
    };
};

export default useTorrentTableInteractions;
