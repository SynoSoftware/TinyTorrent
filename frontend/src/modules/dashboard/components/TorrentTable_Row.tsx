import React, { memo, useEffect, useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@heroui/react";
import { TABLE_ROW_CLASS } from "@/config/logic";

import type { TorrentTableRowProps } from "@/modules/dashboard/types/torrentTableSurfaces";
import { TableCellContent } from "@/modules/dashboard/components/TorrentTable_Shared";
import { getTableTotalWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";

// --- SUB-COMPONENT: VIRTUAL ROW ---
const TorrentTable_Row = memo(
    ({
        row,
        virtualRow,
        isSelected,
        isContext,
        isHighlighted,
        interaction,
        state,
    }: TorrentTableRowProps) => {
        const {
            onRowClick,
            onRowDoubleClick,
            onRowContextMenu,
            onDropTargetChange,
        } = interaction;
        const {
            canReorderQueue,
            dropTargetRowId,
            activeRowId,
            isAnyColumnResizing,
            columnOrder,
            isAnimationSuppressed,
            isColumnOrderChanging,
        } = state;

        void columnOrder;
        void isAnyColumnResizing;

        const suppressRowAnimation =
            isAnimationSuppressed || isColumnOrderChanging;

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
            disabled: !canReorderQueue,
            // FIX: Disable animation when the drag ends (wasDragging) to prevent
            // the row from animating "back" while the virtualizer moves it "to".
            animateLayoutChanges: (args) => {
                if (suppressRowAnimation) {
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
                height: virtualRow.size,
                width: getTableTotalWidthCss(0),
            };

            if (transform) {
                style.transform = CSS.Translate.toString(transform);
            }
            // Retain drag transition, BUT we will remove highlight transition
            if (transition && !suppressRowAnimation) {
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
            suppressRowAnimation,
        ]);

        useEffect(() => {
            if (!canReorderQueue) return;
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
            canReorderQueue,
            onDropTargetChange,
            dropTargetRowId,
            activeRowId,
        ]);

        return (
            <motion.div
                ref={setNodeRef}
                data-index={virtualRow.index}
                data-torrent-row={row.original.id}
                {...(attributes ?? {})}
                {...(listeners ?? {})}
                role="row"
                aria-selected={isSelected}
                tabIndex={-1}
                layout={!suppressRowAnimation}
                layoutId={
                    suppressRowAnimation
                        ? undefined
                        : `torrent-row-shell-${row.id}`
                }
                className={cn(
                    TABLE_ROW_CLASS.shell,
                    // Dragging overrides
                    canReorderQueue
                        ? TABLE_ROW_CLASS.dragCursorEnabled
                        : TABLE_ROW_CLASS.dragCursorDisabled,
                    isDragging &&
                        TABLE_ROW_CLASS.dragging
                )}
                style={rowStyle}
                onClick={(e) => onRowClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onRowDoubleClick(row.original)}
                onContextMenu={(e) => onRowContextMenu(e, row.original)}
            >
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <motion.div
                    layout={!suppressRowAnimation}
                    layoutId={
                        suppressRowAnimation
                            ? undefined
                            : `torrent-row-${row.id}`
                    }
                    initial={false}
                    className={cn(
                        TABLE_ROW_CLASS.content,
                        isSelected
                            ? TABLE_ROW_CLASS.selected
                            : TABLE_ROW_CLASS.hover,
                        isContext &&
                            !isSelected &&
                            TABLE_ROW_CLASS.context,
                        isHighlighted &&
                            !isSelected &&
                            TABLE_ROW_CLASS.highlighted
                    )}
                >
                    {row.getVisibleCells().map((cell) => (
                        <TableCellContent key={cell.id} cell={cell} />
                    ))}
                </motion.div>
            </motion.div>
        );
    },
);

export default TorrentTable_Row;
