import React, { memo, useEffect, useMemo, type CSSProperties } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@heroui/react";
import { registry } from "@/config/logic";

import type { TorrentTableRowProps } from "@/modules/dashboard/types/torrentTableSurfaces";
import { TableCellContent } from "@/modules/dashboard/components/TorrentTable_Shared";
import { getTableTotalWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";
const { visuals } = registry;

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
            setActivatorNodeRef,
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
            <div
                ref={setNodeRef}
                data-index={virtualRow.index}
                data-torrent-row={row.original.id}
                role="row"
                aria-selected={isSelected}
                tabIndex={-1}
                className={cn(
                    visuals.table.rowClass.shell,
                    visuals.table.rowClass.dragCursorDisabled,
                    isDragging &&
                        visuals.table.rowClass.dragging
                )}
                style={rowStyle}
                onClick={(e) => onRowClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onRowDoubleClick(row.original)}
                onContextMenu={(e) => onRowContextMenu(e, row.original)}
            >
                {canReorderQueue ? (
                    <button
                        ref={setActivatorNodeRef}
                        type="button"
                        aria-label="Reorder torrent"
                        className={visuals.table.rowClass.dragCursorEnabled}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            zIndex: 10,
                            width: 18,
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            color: "inherit",
                            opacity: 0.55,
                        }}
                        onClick={(event) => event.stopPropagation()}
                        {...(attributes ?? {})}
                        {...(listeners ?? {})}
                    >
                        <GripVertical
                            aria-hidden="true"
                            size={14}
                            strokeWidth={visuals.icon.strokeWidthDense}
                        />
                    </button>
                ) : null}
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <div
                    className={cn(
                        visuals.table.rowClass.content,
                        isSelected
                            ? visuals.table.rowClass.selected
                            : visuals.table.rowClass.hover,
                        isContext &&
                            !isSelected &&
                            visuals.table.rowClass.context,
                        isHighlighted &&
                            !isSelected &&
                            visuals.table.rowClass.highlighted
                    )}
                >
                    {row.getVisibleCells().map((cell) => (
                        <TableCellContent key={cell.id} cell={cell} />
                    ))}
                </div>
            </div>
        );
    },
    (prev, next) =>
        prev.row.id === next.row.id &&
        prev.row.original === next.row.original &&
        prev.virtualRow.index === next.virtualRow.index &&
        prev.virtualRow.start === next.virtualRow.start &&
        prev.virtualRow.size === next.virtualRow.size &&
        prev.isSelected === next.isSelected &&
        prev.isContext === next.isContext &&
        prev.isHighlighted === next.isHighlighted &&
        prev.state.canReorderQueue === next.state.canReorderQueue &&
        prev.state.dropTargetRowId === next.state.dropTargetRowId &&
        prev.state.activeRowId === next.state.activeRowId &&
        prev.state.isAnyColumnResizing === next.state.isAnyColumnResizing &&
        prev.state.isAnimationSuppressed === next.state.isAnimationSuppressed &&
        prev.state.isColumnOrderChanging === next.state.isColumnOrderChanging &&
        prev.interaction.onRowClick === next.interaction.onRowClick &&
        prev.interaction.onRowDoubleClick === next.interaction.onRowDoubleClick &&
        prev.interaction.onRowContextMenu === next.interaction.onRowContextMenu &&
        prev.interaction.onDropTargetChange === next.interaction.onDropTargetChange,
);

export default TorrentTable_Row;

