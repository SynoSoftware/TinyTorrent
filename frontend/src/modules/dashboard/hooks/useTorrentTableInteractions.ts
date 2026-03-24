import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragOverEvent,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import type { Row, RowSelectionState } from "@tanstack/react-table";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { useTorrentTableKeyboard } from "@/modules/dashboard/hooks/useTorrentTableKeyboard";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

const COLUMN_DRAG_ACTIVATION_DISTANCE_PX = 18;
const COLUMN_TOUCH_DRAG_DELAY_MS = 250;
const COLUMN_TOUCH_DRAG_TOLERANCE_PX = 8;
const ROW_DRAG_ACTIVATION_DISTANCE_PX = 12;
const ROW_TOUCH_DRAG_DELAY_MS = 250;
const ROW_TOUCH_DRAG_TOLERANCE_PX = 5;

type RowVirtualizerLike = {
    scrollToIndex: (index: number) => void;
};

export type ColumnDragCommitOutcome =
    | { status: "applied" }
    | {
          status: "rejected";
          reason: "missing_target" | "same_target" | "invalid_index";
      }
    | { status: "failed"; reason: "commit_failed" };

type DragHandlers = {
    handleRowDragStart: (event: DragStartEvent) => void;
    handleRowDragOver: (event: DragOverEvent) => void;
    handleRowDragEnd: (event: DragEndEvent) => Promise<void>;
    handleRowDragCancel: () => void;
};

type TorrentTableInteractionsDeps = DragHandlers & {
    setActiveDragHeaderId: (id: string | null) => void;
    commitColumnDragOrder: (
        activeColumnId: string,
        overColumnId: string
    ) => ColumnDragCommitOutcome;
    onColumnDragCommit?: (outcome: ColumnDragCommitOutcome) => void;
    table: {
        getRowModel: () => { rows: Array<Row<Torrent>> };
    };
    anchorIndex: number | null;
    focusIndex: number | null;
    setRowSelection: (next: RowSelectionState) => void;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setActiveId: (id: string | null) => void;
    selectAllRows: () => void;
    executeQueueAction: (
        action: TorrentTableAction,
    ) => Promise<TorrentCommandOutcome>;
    rowVirtualizer: RowVirtualizerLike;
};

// Hook: provide DnD sensors and table interaction handlers.
// Extracted from `TorrentTable.tsx` and parameterized via a deps object.
export const useTorrentTableInteractions = (deps: TorrentTableInteractionsDeps) => {
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: COLUMN_DRAG_ACTIVATION_DISTANCE_PX,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: COLUMN_TOUCH_DRAG_DELAY_MS,
                tolerance: COLUMN_TOUCH_DRAG_TOLERANCE_PX,
            },
        }),
        useSensor(KeyboardSensor)
    );

    const rowSensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: ROW_DRAG_ACTIVATION_DISTANCE_PX,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: ROW_TOUCH_DRAG_DELAY_MS,
                tolerance: ROW_TOUCH_DRAG_TOLERANCE_PX,
            },
        }),
        useSensor(KeyboardSensor),
    );

    // Wiring: keep this hook as pure orchestration glue. Only pull
    // the small set of values needed for the column-drag handlers.
    const {
        setActiveDragHeaderId,
        commitColumnDragOrder,
        onColumnDragCommit,
    } = deps;

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragHeaderId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragHeaderId(null);
        const { active, over } = event;
        if (!active || !over) {
            onColumnDragCommit?.({
                status: "rejected",
                reason: "missing_target",
            });
            return;
        }
        if (active.id === over.id) {
            onColumnDragCommit?.({
                status: "rejected",
                reason: "same_target",
            });
            return;
        }
        const outcome = commitColumnDragOrder(
            String(active.id),
            String(over.id)
        );
        onColumnDragCommit?.(outcome);
    };

    const handleDragCancel = () => {
        setActiveDragHeaderId(null);
    };

    // Delegate row-drag and keyboard to specialized hooks. Forward the
    // full deps object so those hooks can pick what they need.
    const {
        handleRowDragStart,
        handleRowDragOver,
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
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
        handleKeyDown,
    };
};

export default useTorrentTableInteractions;

