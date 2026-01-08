import React, { memo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@heroui/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { flexRender, type Column, type Header } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    ICON_STROKE_WIDTH_DENSE,
    HANDLE_HITAREA_CLASS,
    CELL_BASE_CLASS,
    CELL_PADDING_CLASS,
} from "@/config/logic";
import { PANEL_SHADOW } from "@/shared/ui/layout/glass-surface";
import { getColumnWidthCss } from "./TorrentTable_Shared";

const SUPPORTS_POINTER_EVENTS =
    typeof window !== "undefined" && "PointerEvent" in window;

// --- SUB-COMPONENT: DRAGGABLE HEADER ---
const TorrentTable_Header = memo(
    ({
        header,
        isOverlay = false,
        onContextMenu,
        onAutoFitColumn,
        onResizeStart,
        isAnyColumnResizing = false,
        isTableResizing = false,
        suppressLayoutAnimations = false,
        isResizing = false,
    }: {
        header: Header<Torrent, unknown>;
        isOverlay?: boolean;
        onContextMenu?: (e: React.MouseEvent) => void;
        onAutoFitColumn?: (column: Column<Torrent>) => void;
        onResizeStart?: (column: Column<Torrent>, clientX: number) => void;
        isAnyColumnResizing?: boolean;
        isTableResizing?: boolean;
        suppressLayoutAnimations?: boolean;
        isResizing?: boolean;
    }) => {
        const { column } = header;
        const canResize =
            header.column.id !== "selection" &&
            (typeof column.getCanResize === "function"
                ? column.getCanResize()
                : true);
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
            disabled:
                isAnyColumnResizing ||
                isTableResizing ||
                suppressLayoutAnimations,
            animateLayoutChanges: (args) => {
                if (
                    isAnyColumnResizing ||
                    isTableResizing ||
                    suppressLayoutAnimations
                )
                    return false;
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
            if (clientX === undefined || clientX === null) return;
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
            isResizing ||
            (typeof column.getIsResizing === "function"
                ? column.getIsResizing()
                : false);

        const style: CSSProperties = {
            transform:
                transform &&
                !isAnyColumnResizing &&
                !isTableResizing &&
                !suppressLayoutAnimations
                    ? CSS.Translate.toString(transform)
                    : undefined,
            transition:
                !isAnyColumnResizing &&
                !isTableResizing &&
                !suppressLayoutAnimations
                    ? transition
                    : undefined,
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
        const shouldAnimateLayout =
            !isAnyColumnResizing &&
            !isTableResizing &&
            !suppressLayoutAnimations &&
            !isDragging &&
            !isOverlay;

        return (
            <motion.div
                ref={setNodeRef}
                layout={shouldAnimateLayout ? "position" : false}
                layoutId={`column-header-${header.id}`}
                initial={false}
                style={style}
                role="columnheader"
                tabIndex={-1}
                onContextMenu={onContextMenu}
                className={cn(
                    "relative flex items-center h-row border-r border-content1/10 transition-colors group select-none overflow-visible",
                    "box-border",
                    "border-l-2 border-l-transparent",
                    canSort
                        ? "cursor-pointer hover:bg-content1/10"
                        : "cursor-default",
                    isOverlay
                        ? "bg-content1/90 cursor-grabbing"
                        : "bg-transparent",
                    isOverlay && PANEL_SHADOW,
                    isDragging && !isOverlay ? "opacity-30" : "opacity-100"
                )}
            >
                <div
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    className={cn(
                        CELL_BASE_CLASS,
                        "flex-1 gap-tools",
                        "text-scaled font-bold uppercase text-foreground/60",
                        isOverlay && "text-foreground",
                        CELL_PADDING_CLASS,
                        align === "center" && "justify-center",
                        align === "end" && "justify-end",
                        isSelection && "justify-center"
                    )}
                    style={{ letterSpacing: "var(--tt-tracking-tight)" }}
                    onClick={
                        canSort ? column.getToggleSortingHandler() : undefined
                    }
                >
                    {flexRender(column.columnDef.header, header.getContext())}
                    <SortArrowIcon
                        strokeWidth={ICON_STROKE_WIDTH_DENSE}
                        className={cn(
                            "text-primary shrink-0 toolbar-icon-size-sm",
                            sortArrowOpacity
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
                        className={cn(
                            "absolute right-0 top-0 h-full cursor-col-resize touch-none select-none flex items-center justify-end z-30",
                            HANDLE_HITAREA_CLASS
                        )}
                    >
                        <div
                            className={cn(
                                "bg-foreground/10 transition-colors rounded-full h-resize-h",
                                "group-hover:bg-primary/50",
                                isColumnResizing && "bg-primary h-resize-h"
                            )}
                            style={{ width: "var(--tt-divider-width)" }}
                        />
                    </div>
                )}
            </motion.div>
        );
    }
);

export default TorrentTable_Header;
