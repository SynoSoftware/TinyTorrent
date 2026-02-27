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
import { useTorrentTableKeyboard } from "@/modules/dashboard/hooks/useTorrentTableKeyboard";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { AnimationSuppressionKey } from "@/modules/dashboard/hooks/useTableAnimationGuard";

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

