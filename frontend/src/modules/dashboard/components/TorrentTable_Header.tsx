import React, { memo, type CSSProperties } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp } from "lucide-react";
import { flexRender, type Column, type Table } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { TABLE } from "@/shared/ui/layout/glass-surface";
import { getColumnWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";
import type { DashboardTableMeta } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
const { visuals } = registry;

type TorrentTableHeader = ReturnType<Table<Torrent>["getFlatHeaders"]>[number];

const SUPPORTS_POINTER_EVENTS =
    typeof window !== "undefined" && "PointerEvent" in window;

// Keep header rendering presentational:
// - Drag/sort/resize behaviors are still orchestrated by shared hooks; keep exposing only stable handlers/state so the view-model remains the single owner (todo.md task 13).
// - Avoid capability inference or engine calls in header components; rely on the same view-model/command surface that drives the body.
// - Centralize any pointer-event special cases higher up so both header and body share consistent interaction policies.

// --- SUB-COMPONENT: DRAGGABLE HEADER ---
const TorrentTable_Header = memo(
    ({
        header,
        isOverlay = false,
        onContextMenu,
        onAutoFitColumn,
        onResizeStart,
        isAnimationSuppressed: isAnimationSuppressed = false,
        isResizing = false,
    }: {
        header: TorrentTableHeader;
        isOverlay?: boolean;
        onContextMenu?: (e: React.MouseEvent) => void;
        onAutoFitColumn?: (column: Column<Torrent>) => void;
        onResizeStart?: (column: Column<Torrent>, clientX: number) => void;
        isAnimationSuppressed?: boolean;
        isResizing?: boolean;
    }) => {
        const { column } = header;
        const canResize =
            header.column.id !== "selection" &&
            (column.getCanResize?.() ?? true);
        const {
            setNodeRef,
            attributes,
            listeners,
            setActivatorNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({
            id: header.column.id,
            disabled: isAnimationSuppressed,
            animateLayoutChanges: (args) => {
                if (isAnimationSuppressed) return false;
                const { wasDragging } = args;
                if (wasDragging) return false;
                return defaultAnimateLayoutChanges(args);
            },
        });
        const handleAutoFit = (event: React.MouseEvent) => {
            event.stopPropagation();
            if (column.getCanResize()) {
                onAutoFitColumn?.(column);
            }
        };
        const startManualResize = (clientX?: number) => {
            if (clientX == null) return;
            onResizeStart?.(column, clientX);
        };
        const handlePointerDown = (event: React.PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            startManualResize(event.clientX);
        };
        const handleMouseDown = (event: React.MouseEvent) => {
            if (SUPPORTS_POINTER_EVENTS) {
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            startManualResize(event.clientX);
        };
        const handleTouchStart = (event: React.TouchEvent) => {
            if (SUPPORTS_POINTER_EVENTS) {
                event.stopPropagation();
                return;
            }
            const touch = event.touches[0];
            if (!touch) return;
            event.preventDefault();
            event.stopPropagation();
            startManualResize(touch.clientX);
        };

        const isColumnResizing =
            isResizing || column.getIsResizing?.() === true;

        const style: CSSProperties = {
            transform:
                transform && !isAnimationSuppressed
                    ? CSS.Translate.toString(transform)
                    : undefined,
            transition: !isAnimationSuppressed ? transition : undefined,
            width: getColumnWidthCss(column.id, column.getSize()),
            zIndex: isDragging || isOverlay ? 50 : 0,
            boxSizing: "border-box",
        };

        const sortState = column.getIsSorted();
        const canSort = column.getCanSort();
        const align = column.columnDef.meta?.align || "start";
        const isSelection = header.id.toString() === "selection";
        const SortArrowIcon = sortState === "desc" ? ArrowDown : ArrowUp;
        const sortArrowOpacity = sortState ? "opacity-100" : "opacity-0";
        const handleSortToggle = () => {
            if (!canSort) return;
            const meta = header.getContext().table.options.meta as
                | DashboardTableMeta
                | undefined;
            if (meta?.handleHeaderSortToggle) {
                meta.handleHeaderSortToggle(column.id);
                return;
            }
            column.toggleSorting();
        };
        const handleSortPointerUp = (event: React.PointerEvent) => {
            if (event.pointerType === "mouse" && event.button !== 0) {
                return;
            }
            if (isDragging) {
                return;
            }
            handleSortToggle();
        };
        return (
            <div
                ref={setNodeRef}
                style={style}
                role="columnheader"
                tabIndex={-1}
                onContextMenu={onContextMenu}
                className={TABLE.columnHeader.builder.cellClass({
                    canSort,
                    isOverlay,
                    isDragging,
                })}
            >
                <div
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    className={TABLE.columnHeader.builder.activatorClass({
                        isOverlay,
                        align,
                        isSelection,
                    })}
                    style={TABLE.columnHeader.activatorTrackingStyle}
                    onPointerUp={canSort ? handleSortPointerUp : undefined}
                >
                    {flexRender(column.columnDef.header, header.getContext())}
                    <SortArrowIcon
                        strokeWidth={visuals.icon.strokeWidthDense}
                        className={TABLE.columnHeader.builder.sortIconClass(
                            sortArrowOpacity === "opacity-100",
                        )}
                    />
                </div>

                {!isOverlay && canResize && (
                    <div
                        onPointerDown={handlePointerDown}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={handleAutoFit}
                        className={TABLE.columnHeader.resizeHandle}
                    >
                        <div
                            className={TABLE.columnHeader.builder.resizeBarClass(
                                isColumnResizing,
                            )}
                            style={TABLE.columnHeader.resizeBarStyle}
                        />
                    </div>
                )}
            </div>
        );
    },
    (prev, next) =>
        prev.isOverlay === next.isOverlay &&
        prev.isAnimationSuppressed === next.isAnimationSuppressed &&
        prev.isResizing === next.isResizing &&
        prev.header.id === next.header.id &&
        prev.header.column.getSize() === next.header.column.getSize() &&
        prev.header.column.getIsSorted() === next.header.column.getIsSorted() &&
        prev.onContextMenu === next.onContextMenu &&
        prev.onAutoFitColumn === next.onAutoFitColumn &&
        prev.onResizeStart === next.onResizeStart,
);

export default TorrentTable_Header;


