import React, { memo, useMemo, type CSSProperties } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
        interaction,
        state,
    }: TorrentTableRowProps) => {
        const {
            onRowPointerDown,
            onRowClick,
            onRowDoubleClick,
            onRowContextMenu,
        } = interaction;
        const {
            canReorderQueue,
            activeRowId,
            activeDragRowIds,
            isAnyColumnResizing,
            columnOrder,
            isAnimationSuppressed,
            isColumnOrderChanging,
        } = state;

        void columnOrder;
        void isAnyColumnResizing;

        const suppressRowAnimation =
            isAnimationSuppressed || isColumnOrderChanging;
        const isDraggedPacketRow =
            canReorderQueue &&
            activeDragRowIds.includes(row.id) &&
            activeRowId !== null;

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
            style.opacity = isDragging || isDraggedPacketRow ? 0 : 1;
            if (isDragging || isDraggedPacketRow) {
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
            isDraggedPacketRow,
            suppressRowAnimation,
        ]);

        return (
            <div
                ref={setNodeRef}
                data-index={virtualRow.index}
                data-torrent-row={row.original.id}
                {...(canReorderQueue ? attributes : {})}
                {...(canReorderQueue ? listeners : {})}
                role="row"
                aria-selected={isSelected}
                tabIndex={-1}
                className={cn(
                    visuals.table.rowClass.shell,
                    canReorderQueue
                        ? visuals.table.rowClass.dragCursorEnabled
                        : visuals.table.rowClass.dragCursorDisabled,
                    isDragging &&
                        visuals.table.rowClass.dragging
                )}
                style={rowStyle}
                onPointerDown={
                    canReorderQueue
                        ? undefined
                        : (e) => onRowPointerDown(e, row.id, virtualRow.index)
                }
                onClick={(e) =>
                    onRowClick(e, row.id, virtualRow.index, {
                        suppressPlainClick: !canReorderQueue,
                    })
                }
                onDoubleClick={() => onRowDoubleClick(row.original)}
                onContextMenu={(e) => onRowContextMenu(e, row.original)}
            >
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <div
                    className={cn(
                        visuals.table.rowClass.content,
                        isSelected
                            ? visuals.table.rowClass.selected
                            : visuals.table.rowClass.hover,
                        isContext &&
                            !isSelected &&
                            visuals.table.rowClass.context
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
        prev.state.canReorderQueue === next.state.canReorderQueue &&
        prev.state.activeRowId === next.state.activeRowId &&
        prev.state.activeDragRowIds === next.state.activeDragRowIds &&
        prev.state.isAnyColumnResizing === next.state.isAnyColumnResizing &&
        prev.state.isAnimationSuppressed === next.state.isAnimationSuppressed &&
        prev.state.isColumnOrderChanging === next.state.isColumnOrderChanging &&
        prev.interaction.onRowPointerDown === next.interaction.onRowPointerDown &&
        prev.interaction.onRowClick === next.interaction.onRowClick &&
        prev.interaction.onRowDoubleClick === next.interaction.onRowDoubleClick &&
        prev.interaction.onRowContextMenu === next.interaction.onRowContextMenu,
);

export default TorrentTable_Row;

