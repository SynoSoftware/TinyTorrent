import React from "react";
import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import type { Row, RowSelectionState, SortingState } from "@tanstack/react-table";
import { useTorrentTableKeyboard } from "./useTorrentTableKeyboard";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { AnimationSuppressionKey } from "@/modules/dashboard/hooks/useTableAnimationGuard";

type RowVirtualizerLike = {
    scrollToIndex: (index: number) => void;
};

type DragHandlers = {
    handleRowDragStart: (event: DragStartEvent) => void;
    handleRowDragEnd: (event: DragEndEvent) => Promise<void>;
    handleRowDragCancel: () => void;
};

type TorrentTableInteractionsDeps = DragHandlers & {
    setActiveDragHeaderId: (id: string | null) => void;
    setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
    arrayMove: (items: string[], oldIndex: number, newIndex: number) => string[];
    table: {
        setColumnOrder: (updater: React.SetStateAction<string[]>) => void;
        getRowModel: () => { rows: Array<Row<Torrent>> };
    };
    anchorIndex: number | null;
    focusIndex: number | null;
    setRowSelection: (next: RowSelectionState) => void;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setHighlightedRowId: (id: string | null) => void;
    selectAllRows: () => void;
    rowVirtualizer: RowVirtualizerLike;
    canReorderQueue: boolean;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
    setActiveRowId: (id: string | null) => void;
    setDropTargetRowId: (id: string | null) => void;
    rowIds: string[];
    rowsById: Map<string, Row<Torrent>>;
    sorting: SortingState;
    rows: Array<Row<Torrent>>;
};

// Hook: provide DnD sensors and table interaction handlers.
// Extracted from `TorrentTable.tsx` and parameterized via a deps object.
export const useTorrentTableInteractions = (deps: TorrentTableInteractionsDeps) => {
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
            setColumnOrder((order) => {
                const oldIndex = order.indexOf(active.id as string);
                const newIndex = order.indexOf(over.id as string);
                if (oldIndex < 0 || newIndex < 0) return order;
                const move = deps.arrayMove;
                const next = move(order, oldIndex, newIndex);
                try {
                    table.setColumnOrder(next);
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
    const {
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
    } = deps;

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
