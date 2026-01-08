import React, { memo, useEffect, useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type VirtualItem } from "@tanstack/react-virtual";
import type { Row } from "@tanstack/react-table";
import { cn } from "@heroui/react";

import type { Torrent } from "@/modules/dashboard/types/torrent";
import { TableCellContent } from "./TorrentTable_Shared";

// --- SUB-COMPONENT: VIRTUAL ROW ---
const TorrentTable_Row = memo(
    ({
        row,
        virtualRow,
        isSelected,
        isContext,
        onClick,
        onDoubleClick,
        onContextMenu,
        isQueueSortActive,
        dropTargetRowId,
        activeRowId,
        isHighlighted,
        onDropTargetChange,
        isAnyColumnResizing = false,
        isTableResizing = false,
        columnOrder,
        suppressLayoutAnimations = false,
    }: {
        row: Row<Torrent>;
        virtualRow: VirtualItem;
        isSelected: boolean;
        isContext: boolean;
        onClick: (e: React.MouseEvent, rowId: string, index: number) => void;
        onDoubleClick: (torrent: Torrent) => void;
        onContextMenu: (e: React.MouseEvent, torrent: Torrent) => void;
        isQueueSortActive: boolean;
        dropTargetRowId: string | null | undefined;
        activeRowId: string | null | undefined;
        isHighlighted: boolean;
        onDropTargetChange?: (id: string | null) => void;
        isAnyColumnResizing?: boolean;
        isTableResizing?: boolean;
        columnOrder?: string[];
        suppressLayoutAnimations?: boolean;
    }) => {
        void columnOrder;
        // Inside VirtualRow component
        const {
            setNodeRef,
            attributes,
            listeners,
            transform,
            transition,
            isDragging,
            isOver,
        } = useSortable({
            id: row.id,
            disabled: !isQueueSortActive,
            // FIX: Disable animation when the drag ends (wasDragging) to prevent
            // the row from animating "back" while the virtualizer moves it "to".
            animateLayoutChanges: (args) => {
                if (isAnyColumnResizing || isTableResizing) {
                    return false;
                }
                const { wasDragging } = args;
                if (wasDragging) {
                    return false;
                }
                return defaultAnimateLayoutChanges(args);
            },
        });

        const rowStyle = useMemo<CSSProperties>(() => {
            const style: CSSProperties = {
                position: "absolute",
                top: virtualRow.start,
                left: 0,
                width: "100%",
                height: virtualRow.size,
            };
            if (transform) {
                style.transform = CSS.Translate.toString(transform);
            }
            // Retain drag transition, BUT we will remove highlight transition
            if (transition && !isAnyColumnResizing && !isTableResizing) {
                style.transition = transition;
            }
            style.opacity = isDragging ? 0 : 1;
            if (isDragging) {
                style.zIndex = 40;
                style.pointerEvents = "none";
            }
            return style;
        }, [
            virtualRow.start,
            virtualRow.size,
            transform,
            transition,
            isDragging,
            isAnyColumnResizing,
        ]);

        useEffect(() => {
            if (!isQueueSortActive || !onDropTargetChange) return;
            if (row.id === activeRowId) return;
            if (isOver) {
                onDropTargetChange(row.id);
                return;
            }
            if (dropTargetRowId === row.id) {
                onDropTargetChange(null);
            }
        }, [
            isOver,
            row.id,
            isQueueSortActive,
            onDropTargetChange,
            dropTargetRowId,
            activeRowId,
        ]);

        return (
            <div
                ref={setNodeRef}
                data-index={virtualRow.index}
                data-torrent-row={row.original.id}
                {...(attributes ?? {})}
                {...(listeners ?? {})}
                role="row"
                aria-selected={isSelected}
                tabIndex={-1}
                className={cn(
                    "absolute top-0 left-0 border-b border-default/5",
                    "box-border",
                    // Dragging overrides
                    isQueueSortActive ? "cursor-grab" : "cursor-default",
                    isDragging &&
                        "opacity-50 grayscale scale-98 z-50 cursor-grabbing"
                )}
                style={rowStyle}
                onClick={(e) => onClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onDoubleClick(row.original)}
                onContextMenu={(e) => onContextMenu(e, row.original)}
            >
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <motion.div
                    layout={
                        !isAnyColumnResizing &&
                        !suppressLayoutAnimations &&
                        !isTableResizing
                    }
                    layoutId={
                        isAnyColumnResizing ||
                        suppressLayoutAnimations ||
                        isTableResizing
                            ? undefined
                            : `torrent-row-${row.id}`
                    }
                    initial={false}
                    className={cn(
                        "relative flex items-center w-full h-full ",
                        // SELECTION STATE: Stronger contrast, no border, NO TRANSITION
                        isSelected ? "bg-primary/20" : "hover:bg-content1/10",

                        // Context Menu Highlight
                        isContext && !isSelected && "bg-content1/20",

                        // Keyboard Highlight (Focus)
                        isHighlighted && !isSelected && "bg-foreground/10"
                    )}
                >
                    {row.getVisibleCells().map((cell) => (
                        <TableCellContent key={cell.id} cell={cell} />
                    ))}
                </motion.div>
            </div>
        );
    }
);

export default TorrentTable_Row;
