// All imports use '@/...' aliases. Clipboard logic and magic numbers flagged for follow-up refactor.

import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
    useSortable,
    defaultAnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    flexRender,
    type Column,
    type ColumnDef,
    type ColumnSizingInfoState,
    type Header,
    type Row,
    type RowSelectionState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import {
    Checkbox,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownSection,
    DropdownTrigger,
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
    Skeleton,
    cn,
} from "@heroui/react";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, FileUp } from "lucide-react";
import React, {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ItemElement } from "@react-types/shared";

import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
    GLASS_MENU_SURFACE,
    GLASS_MODAL_SURFACE,
    PANEL_SHADOW,
} from "@/shared/ui/layout/glass-surface";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { useContextMenuPosition } from "@/shared/hooks/ui/useContextMenuPosition";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import {
    COLUMN_DEFINITIONS,
    DEFAULT_COLUMN_ORDER,
    type ColumnId,
    type DashboardTableMeta,
} from "@/modules/dashboard/components/ColumnDefinitions";
import { useTorrentShortcuts } from "@/modules/dashboard/hooks/useTorrentShortcuts";
import { useTorrentSpeedHistory } from "@/modules/dashboard/hooks/useTorrentSpeedHistory";
import {
    TABLE_LAYOUT,
    INTERACTION_CONFIG,
    KEY_SCOPE,
    KEYMAP,
    ShortcutIntent,
    ICON_STROKE_WIDTH,
    ICON_STROKE_WIDTH_DENSE,
    UI_BASES,
    CONFIG,
    TABLE_PERSIST_DEBOUNCE_MS,
} from "@/config/logic";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.8";
const CELL_PADDING_CLASS = "pl-tight pr-panel";
const CELL_BASE_CLASSES =
    "flex items-center overflow-hidden h-full truncate whitespace-nowrap text-ellipsis box-border leading-none";

const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";
const TABLE_TOTAL_WIDTH_VAR = "--tt-table-total-w";
const MEASURE_LAYER_CLASS = "absolute pointer-events-none invisible";
const MEASURE_HEADER_SELECTOR = "[data-tt-measure-header]";
const MEASURE_CELL_SELECTOR = "[data-tt-measure-cell]";

const toCssVarSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getColumnWidthVarName = (columnId: string) =>
    `--tt-colw-${toCssVarSafeId(columnId)}`;

const getColumnWidthCss = (columnId: string, fallbackPx: number) =>
    `var(${getColumnWidthVarName(columnId)}, ${fallbackPx}px)`;

const getTableTotalWidthCss = (fallbackPx: number) =>
    `var(${TABLE_TOTAL_WIDTH_VAR}, ${fallbackPx}px)`;

// --- TYPES ---
type ContextMenuKey = TorrentTableAction;

type MarqueeRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

interface MarqueeState {
    startClientX: number;
    startClientY: number;
    startContentY: number;
    isAdditive: boolean;
}

type HeaderMenuItem = {
    column: Column<Torrent>;
    label: string;
    isPinned: boolean;
};
type HeaderMenuActionOptions = {
    keepOpen?: boolean;
};

const SHORTCUT_KEY_LABELS: Record<string, string> = {
    ctrl: "Ctrl",
    meta: "Meta",
    win: "Win",
    cmd: "Cmd",
    shift: "Shift",
    alt: "Alt",
    enter: "Enter",
    escape: "Esc",
    esc: "Esc",
    delete: "Delete",
    backspace: "Backspace",
    space: "Space",
    tab: "Tab",
};

const normalizeShortcutPart = (part: string) => {
    const normalized = part.toLowerCase();
    return SHORTCUT_KEY_LABELS[normalized] ?? part.toUpperCase();
};

const formatShortcutCombination = (combination: string) =>
    combination.split("+").map(normalizeShortcutPart).join(" + ");

const formatShortcutLabel = (value?: string | string[]) => {
    if (!value) return undefined;
    const combos = Array.isArray(value) ? value : [value];
    return combos.map(formatShortcutCombination).join(" / ");
};

const normalizeColumnSizingState = (
    sizing: Record<string, number>
): Record<string, number> => {
    const normalized: Record<string, number> = {};
    Object.entries(sizing).forEach(([id, raw]) => {
        if (!COLUMN_DEFINITIONS[id as ColumnId]) return;
        if (typeof raw === "number" && Number.isFinite(raw)) {
            normalized[id] = raw;
        }
    });
    return normalized;
};

const layoutTableConfig = CONFIG.layout.table;
const AUTO_FIT_TOLERANCE_PX = layoutTableConfig.fallbackPixelTolerancePx;

const SUPPORTS_POINTER_EVENTS =
    typeof window !== "undefined" && "PointerEvent" in window;

const createColumnSizingInfoState = (): ColumnSizingInfoState => ({
    columnSizingStart: [],
    deltaOffset: null,
    deltaPercentage: null,
    isResizingColumn: false,
    startOffset: null,
    startSize: null,
});

const readMeasuredWidth = (element: HTMLElement) => {
    const width = element.getBoundingClientRect().width;
    return Number.isFinite(width) ? Math.ceil(width) : Number.NaN;
};

const useMeasuredColumnWidths = (
    layerRef: React.RefObject<HTMLDivElement | null>,
    tolerancePx: number
) => {
    const [minWidths, setMinWidths] = useState<Record<string, number>>({});
    const minWidthsRef = useRef(minWidths);

    useEffect(() => {
        minWidthsRef.current = minWidths;
    }, [minWidths]);

    const measure = useCallback(() => {
        const layer = layerRef.current;
        if (!layer) return null;

        const headerWidths: Record<string, number> = {};
        const cellWidths: Record<string, number> = {};

        layer
            .querySelectorAll<HTMLElement>(MEASURE_HEADER_SELECTOR)
            .forEach((element) => {
                const columnId = element.dataset.ttMeasureHeader;
                if (!columnId) return;
                const width = readMeasuredWidth(element);
                if (!Number.isFinite(width)) return;
                const current = headerWidths[columnId];
                if (!Number.isFinite(current) || width > current) {
                    headerWidths[columnId] = width;
                }
            });

        layer
            .querySelectorAll<HTMLElement>(MEASURE_CELL_SELECTOR)
            .forEach((element) => {
                const columnId = element.dataset.ttMeasureCell;
                if (!columnId) return;
                const width = readMeasuredWidth(element);
                if (!Number.isFinite(width)) return;
                const current = cellWidths[columnId];
                if (!Number.isFinite(current) || width > current) {
                    cellWidths[columnId] = width;
                }
            });

        const nextMinWidths: Record<string, number> = {};
        const columnIds = new Set([
            ...Object.keys(headerWidths),
            ...Object.keys(cellWidths),
        ]);
        columnIds.forEach((columnId) => {
            const headerWidth = headerWidths[columnId];
            const cellWidth = cellWidths[columnId];
            if (Number.isFinite(headerWidth) && Number.isFinite(cellWidth)) {
                nextMinWidths[columnId] = Math.max(headerWidth, cellWidth);
                return;
            }
            if (Number.isFinite(headerWidth)) {
                nextMinWidths[columnId] = headerWidth;
                return;
            }
            if (Number.isFinite(cellWidth)) {
                nextMinWidths[columnId] = cellWidth;
            }
        });

        setMinWidths((prev) => {
            const nextIds = Object.keys(nextMinWidths);
            if (nextIds.length !== Object.keys(prev).length) {
                return nextMinWidths;
            }
            for (const id of nextIds) {
                if (!Object.prototype.hasOwnProperty.call(prev, id)) {
                    return nextMinWidths;
                }
                const prevWidth = prev[id];
                const nextWidth = nextMinWidths[id];
                if (!Number.isFinite(prevWidth)) {
                    return nextMinWidths;
                }
                if (Math.abs(nextWidth - prevWidth) > tolerancePx) {
                    return nextMinWidths;
                }
            }
            return prev;
        });

        return nextMinWidths;
    }, [layerRef, tolerancePx]);

    return { minWidths, minWidthsRef, measure };
};

const ADD_TORRENT_SHORTCUT = formatShortcutLabel(["ctrl+o", "meta+o"]);

const CONTEXT_MENU_SHORTCUTS: Partial<
    Record<ContextMenuKey, string | string[]>
> = {
    pause: KEYMAP[ShortcutIntent.TogglePause],
    resume: KEYMAP[ShortcutIntent.TogglePause],
    recheck: KEYMAP[ShortcutIntent.Recheck],
    remove: KEYMAP[ShortcutIntent.Delete],
    "remove-with-data": KEYMAP[ShortcutIntent.RemoveWithData],
    "queue-move-top": "ctrl+home",
    "queue-move-up": "ctrl+up",
    "queue-move-down": "ctrl+down",
    "queue-move-bottom": "ctrl+end",
};

const DEFAULT_MAGNET_PREFIX = CONFIG.defaults.magnet_protocol_prefix;

const getContextMenuShortcut = (action: ContextMenuKey) =>
    formatShortcutLabel(CONTEXT_MENU_SHORTCUTS[action]);

// Row height and other CSS-derived metrics are provided by `useLayoutMetrics`

interface TorrentTableProps {
    torrents: Torrent[];
    filter: string;
    searchQuery: string;
    isLoading?: boolean;
    embedded?: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
    onRequestDetailsFullscreen?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
    onActiveRowChange?: (torrent: Torrent | null) => void;
    optimisticStatuses?: OptimisticStatusMap;
    disableDetailOpen?: boolean;
    onOpenFolder?: (torrent: Torrent) => Promise<void>;
    ghostTorrents?: Torrent[];
}

// --- HELPERS ---
// --- SUB-COMPONENT: DRAGGABLE HEADER ---
const DraggableHeader = memo(
    ({
        header,
        isOverlay = false,
        onContextMenu,
        onAutoFitColumn,
        onResizeStart,
        isAnyColumnResizing = false,
        isResizing = false,
    }: {
        header: Header<Torrent, unknown>;
        isOverlay?: boolean;
        onContextMenu?: (e: React.MouseEvent) => void;
        onAutoFitColumn?: (column: Column<Torrent>) => void;
        onResizeStart?: (column: Column<Torrent>, clientX: number) => void;
        isAnyColumnResizing?: boolean;
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
            disabled: isAnyColumnResizing,
            animateLayoutChanges: (args) => {
                if (isAnyColumnResizing) return false;
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
                transform && !isAnyColumnResizing
                    ? CSS.Translate.toString(transform)
                    : undefined,
            transition: !isAnyColumnResizing ? transition : undefined,
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

        return (
            <div
                ref={setNodeRef}
                style={style}
                role="columnheader"
                tabIndex={-1}
                onContextMenu={onContextMenu}
                className={cn(
                    "relative flex items-center h-row border-r border-content1/10 transition-colors group select-none overflow-hidden",
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
                        CELL_BASE_CLASSES,
                        "flex-1 gap-tools",
                        "text-scaled font-bold uppercase text-foreground/60",
                        isOverlay && "text-foreground",
                        CELL_PADDING_CLASS,
                        align === "center" && "justify-center",
                        align === "end" && "justify-end",
                        isSelection && "justify-center "
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
                        className="absolute right-0 top-0 h-full w-4 cursor-col-resize touch-none select-none flex justify-center items-center z-30"
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
            </div>
        );
    }
);

const ColumnHeaderPreview = ({
    header,
}: {
    header: Header<Torrent, unknown>;
}) => {
    const { column } = header;
    const align = column.columnDef.meta?.align || "start";
    const isSelection = header.id.toString() === "selection";
    const sortState = column.getIsSorted();
    const SortArrowIcon = sortState === "desc" ? ArrowDown : ArrowUp;
    const sortArrowOpacity = sortState ? "opacity-100" : "opacity-0";
    return (
        <div
            className={cn(
                "relative flex h-row items-center border-r border-content1/10 bg-content1/90 px-(--p-tight) transition-all",
                PANEL_SHADOW
            )}
            style={{
                width: getColumnWidthCss(column.id, column.getSize()),
                boxSizing: "border-box",
            }}
        >
            <div
                className={cn(
                    CELL_BASE_CLASSES,
                    "flex-1 gap-tools text-scaled font-bold uppercase text-foreground/70",
                    CELL_PADDING_CLASS,
                    align === "center" && "justify-center",
                    align === "end" && "justify-end",
                    isSelection && "justify-center "
                )}
                style={{ letterSpacing: "var(--tt-tracking-tight)" }}
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
        </div>
    );
};

const renderVisibleCells = (row: Row<Torrent>) =>
    row.getVisibleCells().map((cell) => {
        const align = cell.column.columnDef.meta?.align || "start";
        return (
            <div
                key={cell.id}
                style={{
                    width: getColumnWidthCss(
                        cell.column.id,
                        cell.column.getSize()
                    ),
                    boxSizing: "border-box",
                }}
                className={cn(
                    CELL_BASE_CLASSES,
                    CELL_PADDING_CLASS,
                    align === "center" && "justify-center",
                    align === "end" && "justify-end"
                )}
            >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
        );
    });

const ColumnMeasurementLayer = memo(
    ({
        headers,
        rows,
        measureLayerRef,
    }: {
        headers: Header<Torrent, unknown>[];
        rows: Row<Torrent>[];
        measureLayerRef: React.RefObject<HTMLDivElement | null>;
    }) => {
        return (
            <div
                ref={measureLayerRef}
                aria-hidden="true"
                className={MEASURE_LAYER_CLASS}
            >
                <div className="flex">
                    {headers.map((header) => {
                        const { column } = header;
                        const align = column.columnDef.meta?.align || "start";
                        const isSelection =
                            header.id.toString() === "selection";
                        const sortState = column.getIsSorted();
                        const SortArrowIcon =
                            sortState === "desc" ? ArrowDown : ArrowUp;
                        const sortArrowOpacity = sortState
                            ? "opacity-100"
                            : "opacity-0";
                        return (
                            <div
                                key={header.id}
                                data-tt-measure-header={column.id}
                                className={cn(
                                    CELL_BASE_CLASSES,
                                    "gap-tools text-scaled font-bold uppercase text-foreground/60",
                                    CELL_PADDING_CLASS,
                                    align === "center" && "justify-center",
                                    align === "end" && "justify-end",
                                    isSelection && "justify-center"
                                )}
                                style={{
                                    letterSpacing: "var(--tt-tracking-tight)",
                                    width: "max-content",
                                }}
                            >
                                {flexRender(
                                    column.columnDef.header,
                                    header.getContext()
                                )}
                                <SortArrowIcon
                                    strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                    className={cn(
                                        "text-primary shrink-0 toolbar-icon-size-sm",
                                        sortArrowOpacity
                                    )}
                                />
                            </div>
                        );
                    })}
                </div>
                {rows.map((row) => (
                    <div key={row.id} className="flex">
                        {row.getVisibleCells().map((cell) => {
                            const align =
                                cell.column.columnDef.meta?.align || "start";
                            const isSelection = cell.column.id === "selection";
                            return (
                                <div
                                    key={cell.id}
                                    data-tt-measure-cell={cell.column.id}
                                    className={cn(
                                        CELL_BASE_CLASSES,
                                        CELL_PADDING_CLASS,
                                        align === "center" && "justify-center",
                                        align === "end" && "justify-end",
                                        isSelection && "justify-center"
                                    )}
                                    style={{ width: "max-content" }}
                                >
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }
);

// --- SUB-COMPONENT: VIRTUAL ROW ---
const VirtualRow = memo(
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
        columnOrder,
    }: {
        row: Row<Torrent>;
        virtualRow: VirtualItem;
        isSelected: boolean;
        isContext: boolean;
        onClick: (e: React.MouseEvent, rowId: string, index: number) => void;
        onDoubleClick: (torrent: Torrent) => void;
        onContextMenu: (e: React.MouseEvent, torrent: Torrent) => void;
        isQueueSortActive: boolean;
        dropTargetRowId: string | null;
        activeRowId: string | null;
        isHighlighted: boolean;
        onDropTargetChange?: (id: string | null) => void;
        isAnyColumnResizing?: boolean;
        columnOrder?: string[];
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
                if (isAnyColumnResizing) {
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
                top: `${virtualRow.start}px`,
                left: 0,
                width: "100%",
                height: TABLE_LAYOUT.rowHeight,
                boxSizing: "border-box",
            };
            if (transform) {
                style.transform = CSS.Translate.toString(transform);
            }
            // Retain drag transition, BUT we will remove highlight transition
            if (transition && !isAnyColumnResizing) {
                style.transition = transition;
            }
            style.opacity = isDragging ? 0 : 1;
            if (isDragging) {
                style.zIndex = 40;
                style.pointerEvents = "none";
            }
            return style;
        }, [virtualRow.start, transform, transition, isDragging]);

        const isDropTarget =
            dropTargetRowId === row.id && activeRowId !== row.id;

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
                    layout={!isAnyColumnResizing}
                    layoutId={
                        isAnyColumnResizing
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
                    {renderVisibleCells(row)}
                </motion.div>
            </div>
        );
    }
);

type QueueMenuAction = { key: TorrentTableAction; label: string };

// --- MAIN COMPONENT ---
export function TorrentTable({
    torrents,
    filter,
    searchQuery,
    isLoading = false,
    embedded = false,
    onAction,
    onRequestDetails,
    onRequestDetailsFullscreen,
    onSelectionChange,
    onActiveRowChange,
    optimisticStatuses = {},
    disableDetailOpen = false,
    ghostTorrents,
    onOpenFolder,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(
        null
    );
    const speedHistoryRef = useTorrentSpeedHistory(torrents);

    const getDisplayTorrent = useCallback(
        (torrent: Torrent) => {
            const override = optimisticStatuses[torrent.id];
            return override ? { ...torrent, state: override.state } : torrent;
        },
        [optimisticStatuses]
    );

    const pooledTorrents = useMemo(() => {
        if (!ghostTorrents?.length) return torrents;
        return [...ghostTorrents, ...torrents];
    }, [ghostTorrents, torrents]);

    // Prepare data for the table - memoized to prevent re-processing
    const data = useMemo(() => {
        const displayTorrents = pooledTorrents.map(getDisplayTorrent);
        const filteredByState =
            filter === "all"
                ? displayTorrents
                : displayTorrents.filter(
                      (t) => t.isGhost || t.state === filter
                  );
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return filteredByState;
        return filteredByState.filter((torrent) => {
            const haystack = `${torrent.name} ${
                torrent.ghostLabel ?? ""
            }`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [torrents, filter, searchQuery, getDisplayTorrent]);

    const parentRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const measureLayerRef = useRef<HTMLDivElement>(null);
    const focusReturnRef = useRef<HTMLElement | null>(null);
    const marqueeStateRef = useRef<MarqueeState | null>(null);
    const marqueeClickBlockRef = useRef(false);
    const isMarqueeDraggingRef = useRef(false);
    const marqueeBlockResetRef = useRef<ReturnType<
        typeof window.setTimeout
    > | null>(null);
    const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

    const overlayPortalHost = useMemo(
        () =>
            typeof document !== "undefined" && document.body
                ? document.body
                : null,
        []
    );
    const renderOverlayPortal = useCallback(
        (overlay: ReactNode) => {
            if (!overlayPortalHost) return null;
            return createPortal(overlay, overlayPortalHost);
        },
        [overlayPortalHost]
    );
    const setTableCssVar = useCallback((name: string, value: string) => {
        const container = tableContainerRef.current;
        if (!container) return;
        container.style.setProperty(name, value);
    }, []);
    const setColumnWidthVar = useCallback(
        (columnId: string, widthPx: number) => {
            setTableCssVar(getColumnWidthVarName(columnId), `${widthPx}px`);
        },
        [setTableCssVar]
    );
    const setTableTotalWidthVar = useCallback(
        (widthPx: number) => {
            setTableCssVar(TABLE_TOTAL_WIDTH_VAR, `${widthPx}px`);
        },
        [setTableCssVar]
    );

    const queueMenuActions = useMemo<QueueMenuAction[]>(
        () => [
            { key: "queue-move-top", label: t("table.queue.move_top") },
            { key: "queue-move-up", label: t("table.queue.move_up") },
            { key: "queue-move-down", label: t("table.queue.move_down") },
            { key: "queue-move-bottom", label: t("table.queue.move_bottom") },
        ],
        [t]
    );

    const isClipboardSupported =
        typeof navigator !== "undefined" &&
        typeof navigator.clipboard?.writeText === "function";
    const copyToClipboard = useCallback(async (value?: string) => {
        if (!value) return;
        if (
            typeof navigator === "undefined" ||
            typeof navigator.clipboard?.writeText !== "function"
        ) {
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            // ignore
        }
    }, []);
    const buildMagnetLink = useCallback(
        (torrent: Torrent) =>
            `${DEFAULT_MAGNET_PREFIX}xt=urn:btih:${torrent.hash}`,
        []
    );

    useEffect(() => {
        const container = parentRef.current;
        if (!container) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const target = event.target as Element | null;
            if (
                target?.closest("[data-torrent-row]") ||
                target?.closest('[role="row"]')
            ) {
                return;
            }
            const rect = container.getBoundingClientRect();
            const startClientX = event.clientX - rect.left;
            const startClientY = event.clientY - rect.top;
            const startContentY = startClientY + container.scrollTop;

            // mark that a marquee drag is in progress
            isMarqueeDraggingRef.current = true;

            marqueeStateRef.current = {
                startClientX,
                startClientY,
                startContentY,
                isAdditive: event.ctrlKey || event.metaKey,
            };
            setMarqueeRect({
                left: startClientX,
                top: startClientY,
                width: 0,
                height: 0,
            });
            event.preventDefault();
        };

        container.addEventListener("mousedown", handleMouseDown);
        return () => {
            container.removeEventListener("mousedown", handleMouseDown);
        };
    }, []);

    // --- STATE ---
    const getInitialState = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const defaults = {
                columnOrder: DEFAULT_COLUMN_ORDER,
                columnVisibility: {} as VisibilityState,
                columnSizing: {} as Record<string, number>,
                sorting: [] as SortingState,
            };

            if (!saved) return defaults;
            const parsed = JSON.parse(saved);
            const allDefKeys = Object.keys(COLUMN_DEFINITIONS);
            const validOrder = (
                parsed.columnOrder || DEFAULT_COLUMN_ORDER
            ).filter((id: string) => allDefKeys.includes(id));

            allDefKeys.forEach((id) => {
                if (!validOrder.includes(id)) validOrder.push(id);
            });

            return {
                columnOrder: validOrder,
                columnVisibility: parsed.columnVisibility || {},
                columnSizing: normalizeColumnSizingState(
                    parsed.columnSizing || {}
                ),
                sorting: parsed.sorting || [],
            };
        } catch {
            return {
                columnOrder: DEFAULT_COLUMN_ORDER,
                columnVisibility: {},
                columnSizing: normalizeColumnSizingState({}),
                sorting: [],
            };
        }
    };

    const [initialState] = useState(getInitialState);
    const [sorting, setSorting] = useState<SortingState>(initialState.sorting);
    const [columnOrder, setColumnOrder] = useState<string[]>(
        initialState.columnOrder
    );
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
        initialState.columnVisibility
    );
    const [columnSizing, setColumnSizing] = useState(
        normalizeColumnSizingState(initialState.columnSizing)
    );
    const [columnSizingInfo, setColumnSizingInfo] =
        useState<ColumnSizingInfoState>(createColumnSizingInfoState);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const rowSelectionRef = useRef<RowSelectionState>(rowSelection);
    useEffect(() => {
        rowSelectionRef.current = rowSelection;
    }, [rowSelection]);
    const rowsRef = useRef<Row<Torrent>[]>([]);

    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null
    );
    const [activeResizeColumnId, setActiveResizeColumnId] = useState<
        string | null
    >(null);
    const isAnyColumnResizing =
        Boolean(activeResizeColumnId) ||
        Boolean(columnSizingInfo.isResizingColumn);
    const resizeStartRef = useRef<{
        columnId: string;
        startX: number;
        startSize: number;
        startTotal: number;
    } | null>(null);
    const pendingColumnResizeRef = useRef<{
        columnId: string;
        nextSize: number;
        nextTotal: number;
    } | null>(null);
    const columnResizeRafRef = useRef<number | null>(null);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    } | null>(null);
    const [headerContextMenu, setHeaderContextMenu] = useState<{
        virtualElement: ContextMenuVirtualElement;
        columnId: string | null;
    } | null>(null);
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);

    const findRowElement = useCallback((torrentId?: string) => {
        if (!torrentId || typeof document === "undefined") return null;
        return document.querySelector<HTMLElement>(
            `[data-torrent-row="${torrentId}"]`
        );
    }, []);

    const openColumnModal = useCallback(
        (triggerElement?: HTMLElement | null) => {
            const fallback =
                triggerElement ??
                (typeof document !== "undefined"
                    ? (document.activeElement as HTMLElement | null)
                    : null) ??
                tableContainerRef.current;
            focusReturnRef.current = fallback ?? null;
            setIsColumnModalOpen(true);
        },
        [tableContainerRef]
    );

    const handleColumnModalOpenChange = useCallback(
        (isOpen: boolean) => {
            setIsColumnModalOpen(isOpen);
            if (!isOpen) {
                const target =
                    focusReturnRef.current ?? tableContainerRef.current;
                focusReturnRef.current = null;
                target?.focus();
            }
        },
        [tableContainerRef]
    );

    const handleContextMenuAction = useCallback(
        async (key?: string) => {
            if (!contextMenu) return;
            const torrent = contextMenu.torrent;
            if (!torrent) return;
            if (key === "cols") {
                const rowElement = findRowElement(torrent.id);
                openColumnModal(rowElement ?? null);
            } else if (key === "open-folder") {
                if (onOpenFolder && torrent.savePath) {
                    await onOpenFolder(torrent);
                }
            } else if (key === "copy-hash") {
                await copyToClipboard(torrent.hash);
            } else if (key === "copy-magnet") {
                await copyToClipboard(buildMagnetLink(torrent));
            } else if (key) {
                onAction?.(key as TorrentTableAction, torrent);
            }
            setContextMenu(null);
        },
        [
            buildMagnetLink,
            copyToClipboard,
            contextMenu,
            findRowElement,
            onAction,
            onOpenFolder,
            openColumnModal,
        ]
    );

    type SavedTableState = {
        columnOrder: string[];
        columnVisibility: VisibilityState;
        columnSizing: Record<string, number>;
        sorting: SortingState;
    };

    const latestStateRef = useRef<SavedTableState>({
        columnOrder: initialState.columnOrder,
        columnVisibility: initialState.columnVisibility,
        columnSizing: initialState.columnSizing,
        sorting: initialState.sorting,
    });
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        latestStateRef.current = {
            columnOrder,
            columnVisibility,
            columnSizing,
            sorting,
        };

        if (isAnyColumnResizing) {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(latestStateRef.current)
            );
            saveTimeoutRef.current = null;
        }, TABLE_PERSIST_DEBOUNCE_MS);
    }, [
        activeResizeColumnId,
        columnOrder,
        columnSizing,
        columnSizingInfo.isResizingColumn,
        columnVisibility,
        sorting,
    ]);

    useEffect(() => {
        return () => {
            if (typeof window === "undefined") {
                return;
            }
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(latestStateRef.current)
            );
        };
    }, []);

    // --- COLUMNS ---
    // Memoized columns based ONLY on translation and stable definitions.
    // Dynamic data (sparklines) is accessed via meta.
    const columns = useMemo<ColumnDef<Torrent>[]>(() => {
        // Build columns in the canonical default order so the table's
        // initial mapping between header and cell renderers remains stable.
        const cols = DEFAULT_COLUMN_ORDER.map((colId) => {
            const id = colId as ColumnId;
            const def = COLUMN_DEFINITIONS[id];
            if (!def) return null;
            const sortAccessor = def.sortAccessor;
            const accessorKey = sortAccessor ? undefined : def.rpcField;
            const accessorFn = sortAccessor
                ? (torrent: Torrent) => sortAccessor(torrent)
                : undefined;
            return {
                id,
                accessorKey,
                accessorFn,
                enableSorting: Boolean(def.sortable),
                header: () => {
                    const label = def.labelKey ? t(def.labelKey) : "";
                    const HeaderIcon = def.headerIcon;
                    return HeaderIcon ? (
                        <div
                            className="flex items-center gap-tight text-scaled font-semibold uppercase text-foreground/60"
                            style={{
                                letterSpacing: "var(--tt-tracking-ultra)",
                            }}
                        >
                            <HeaderIcon
                                strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                className="text-foreground/50 animate-pulse toolbar-icon-size-md"
                            />
                            <span>{label}</span>
                        </div>
                    ) : (
                        label
                    );
                },
                size: def.width ?? 150,
                enableResizing: true,
                meta: { align: def.align },
                cell: ({ row, table }) => {
                    return def.render({
                        torrent: row.original,
                        t,
                        isSelected: row.getIsSelected(),
                        table, // Pass table to allow access to meta
                    });
                },
            } as ColumnDef<Torrent>;
        });
        return cols.filter(Boolean) as ColumnDef<Torrent>[];
    }, [t]);

    // We pass dynamic data through meta to avoid column regeneration
    const tableMeta = useMemo<DashboardTableMeta>(
        () => ({
            speedHistoryRef,
            optimisticStatuses,
        }),
        [speedHistoryRef, optimisticStatuses]
    );

    const table = useReactTable({
        data,
        columns,
        getRowId: (torrent) => torrent.id,
        state: {
            sorting,
            columnOrder,
            columnVisibility,
            rowSelection,
            columnSizing,
            columnSizingInfo,
        },
        meta: tableMeta,
        columnResizeMode: "onChange",
        enableColumnResizing: true,
        enableSortingRemoval: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: (updater) => {
            setColumnSizing((prev) =>
                normalizeColumnSizingState(
                    typeof updater === "function" ? updater(prev) : updater
                )
            );
        },
        onColumnSizingInfoChange: setColumnSizingInfo,
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
        autoResetAll: false,
    });

    const { rows } = table.getRowModel();
    const {
        minWidths: measuredMinWidths,
        minWidthsRef: measuredMinWidthsRef,
        measure: measureColumnMinWidths,
    } = useMeasuredColumnWidths(measureLayerRef, AUTO_FIT_TOLERANCE_PX);
    const getMeasuredColumnMinWidth = useCallback(
        (columnId: string, fallbackWidth: number) => {
            const measured = measuredMinWidthsRef.current[columnId];
            return Number.isFinite(measured) ? measured : fallbackWidth;
        },
        [measuredMinWidthsRef]
    );
    useEffect(() => {
        const container = tableContainerRef.current;
        if (!container) return;
        setTableTotalWidthVar(table.getTotalSize());
        table.getAllLeafColumns().forEach((column) => {
            setColumnWidthVar(column.id, column.getSize());
        });
    }, [
        columnOrder,
        columnSizing,
        columnVisibility,
        setColumnWidthVar,
        setTableTotalWidthVar,
        table,
        tableContainerRef,
    ]);
    const getColumnLabel = useCallback(
        (column: Column<Torrent>) => {
            const definition = COLUMN_DEFINITIONS[column.id as ColumnId];
            const labelKey = definition?.labelKey;
            if (labelKey) {
                return t(labelKey);
            }
            return column.id;
        },
        [t]
    );
    const resetColumnResizeState = useCallback(() => {
        resizeStartRef.current = null;
        setActiveResizeColumnId(null);
        setColumnSizingInfo(createColumnSizingInfoState());
    }, [setActiveResizeColumnId, setColumnSizingInfo]);
    const autoFitColumn = useCallback(
        (
            column: Column<Torrent>,
            measurements?: Record<string, number> | null
        ) => {
            if (!column.getCanResize()) return false;
            resetColumnResizeState();
            const measuredWidths = measurements ?? measureColumnMinWidths();
            const measuredWidth =
                (measuredWidths && measuredWidths[column.id]) ??
                measuredMinWidthsRef.current[column.id];
            if (!Number.isFinite(measuredWidth)) return false;
            const computedWidth = Math.ceil(measuredWidth);
            const currentWidth = column.getSize();
            if (
                Math.abs(computedWidth - currentWidth) <= AUTO_FIT_TOLERANCE_PX
            ) {
                return false;
            }
            setColumnSizing((prev: Record<string, number>) =>
                normalizeColumnSizingState({
                    ...prev,
                    [column.id]: computedWidth,
                })
            );
            return true;
        },
        [
            measureColumnMinWidths,
            measuredMinWidthsRef,
            resetColumnResizeState,
            setColumnSizing,
        ]
    );
    const autoFitAllColumns = useCallback(() => {
        const measuredWidths = measureColumnMinWidths();
        table.getAllLeafColumns().forEach((column) => {
            if (!column.getCanResize()) return;
            autoFitColumn(column, measuredWidths);
        });
    }, [autoFitColumn, measureColumnMinWidths, table]);
    const handleColumnAutoFitRequest = useCallback(
        (column: Column<Torrent>) => {
            if (!column.getCanResize()) return;
            const didResize = autoFitColumn(column);
            if (!didResize) {
                autoFitAllColumns();
            }
        },
        [autoFitAllColumns, autoFitColumn]
    );
    const { rowHeight, fileContextMenuMargin } = useLayoutMetrics();
    const { clampContextMenuPosition, createVirtualElement } =
        useContextMenuPosition({
            defaultMargin: fileContextMenuMargin,
        });
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!activeResizeColumnId) return;

        const applyPendingResizeCss = () => {
            const pending = pendingColumnResizeRef.current;
            if (!pending) return;
            setColumnWidthVar(pending.columnId, pending.nextSize);
            setTableTotalWidthVar(pending.nextTotal);
        };

        const scheduleResizeCssUpdate = () => {
            if (columnResizeRafRef.current !== null) return;
            columnResizeRafRef.current = window.requestAnimationFrame(() => {
                columnResizeRafRef.current = null;
                applyPendingResizeCss();
            });
        };

        const handlePointerMove = (event: PointerEvent) => {
            const resizeState = resizeStartRef.current;
            if (!resizeState) return;
            const column = table.getColumn(resizeState.columnId);
            if (!column) return;
            const delta = event.clientX - resizeState.startX;
            const minSize = getMeasuredColumnMinWidth(
                resizeState.columnId,
                column.getSize()
            );
            const maxSize =
                typeof column.columnDef.maxSize === "number"
                    ? column.columnDef.maxSize
                    : Number.POSITIVE_INFINITY;
            const nextSize = Math.min(
                maxSize,
                Math.max(minSize, Math.round(resizeState.startSize + delta))
            );
            const nextTotal =
                resizeState.startTotal - resizeState.startSize + nextSize;
            event.preventDefault();
            pendingColumnResizeRef.current = {
                columnId: resizeState.columnId,
                nextSize,
                nextTotal,
            };
            scheduleResizeCssUpdate();
        };

        const handlePointerUp = () => {
            if (columnResizeRafRef.current !== null) {
                window.cancelAnimationFrame(columnResizeRafRef.current);
                columnResizeRafRef.current = null;
            }
            applyPendingResizeCss();

            const pending = pendingColumnResizeRef.current;
            pendingColumnResizeRef.current = null;
            if (pending) {
                setColumnSizing((prev: Record<string, number>) =>
                    normalizeColumnSizingState({
                        ...prev,
                        [pending.columnId]: pending.nextSize,
                    })
                );
            }
            resetColumnResizeState();
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            if (columnResizeRafRef.current !== null) {
                window.cancelAnimationFrame(columnResizeRafRef.current);
                columnResizeRafRef.current = null;
            }
            pendingColumnResizeRef.current = null;
        };
    }, [
        activeResizeColumnId,
        resetColumnResizeState,
        setColumnSizing,
        setColumnWidthVar,
        setTableTotalWidthVar,
        table,
    ]);
    const handleColumnResizeStart = useCallback(
        (column: Column<Torrent>, clientX: number) => {
            if (!column.getCanResize()) return;
            const startSize = column.getSize();
            const startTotal = table.getTotalSize();
            resizeStartRef.current = {
                columnId: column.id,
                startX: clientX,
                startSize,
                startTotal,
            };
            setActiveResizeColumnId(column.id);
            setColumnSizingInfo(() => ({
                columnSizingStart: [[column.id, startSize]],
                deltaOffset: 0,
                deltaPercentage: 0,
                isResizingColumn: column.id,
                startOffset: clientX,
                startSize,
            }));
        },
        [setActiveResizeColumnId, setColumnSizingInfo, table]
    );

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });
    const measurementItems = rowVirtualizer.getVirtualItems();
    const measurementRows = measurementItems
        .map((virtualRow) => rows[virtualRow.index])
        .filter((row): row is Row<Torrent> => Boolean(row));
    const measurementRowKey = measurementItems
        .map((virtualRow) => virtualRow.index)
        .join("|");
    const measurementHeaders = table
        .getFlatHeaders()
        .filter(
            (header) => !header.isPlaceholder && header.column.getIsVisible()
        );

    useLayoutEffect(() => {
        if (isAnyColumnResizing) return;
        measureColumnMinWidths();
    }, [
        columnOrder,
        columnVisibility,
        isAnyColumnResizing,
        measureColumnMinWidths,
        measurementRowKey,
        rows,
        sorting,
    ]);
    useEffect(() => {
        if (isAnyColumnResizing) return;
        if (!Object.keys(measuredMinWidths).length) return;
        setColumnSizing((prev: Record<string, number>) => {
            let didChange = false;
            const next = { ...prev };
            table.getAllLeafColumns().forEach((column) => {
                if (!column.getCanResize()) return;
                const minWidth = getMeasuredColumnMinWidth(
                    column.id,
                    column.getSize()
                );
                if (!Number.isFinite(minWidth)) return;
                const current = Number.isFinite(prev[column.id])
                    ? prev[column.id]
                    : column.getSize();
                if (!Number.isFinite(current)) return;
                if (current + AUTO_FIT_TOLERANCE_PX < minWidth) {
                    next[column.id] = minWidth;
                    didChange = true;
                }
            });
            return didChange ? normalizeColumnSizingState(next) : prev;
        });
    }, [
        getMeasuredColumnMinWidth,
        isAnyColumnResizing,
        measuredMinWidths,
        setColumnSizing,
        table,
    ]);

    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    // Throttle marquee selection updates via requestAnimationFrame to avoid
    // issuing React state updates at mousemove frequency which causes layout jank.
    const pendingSelectionRef = useRef<RowSelectionState | null>(null);
    const rafHandleRef = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const state = marqueeStateRef.current;
            const container = parentRef.current;
            if (!state || !container) return;
            const rect = container.getBoundingClientRect();
            const currentClientX = event.clientX - rect.left;
            const currentClientY = event.clientY - rect.top;
            const left = Math.min(state.startClientX, currentClientX);
            const top = Math.min(state.startClientY, currentClientY);
            setMarqueeRect({
                left,
                top,
                width: Math.abs(currentClientX - state.startClientX),
                height: Math.abs(currentClientY - state.startClientY),
            });

            // Live selection while dragging: translate viewport coords to content coords
            // using the current scrollTop so that scrolling during drag updates selection.
            try {
                const scrollTop = container.scrollTop;
                const startContentY = state.startClientY + scrollTop;
                const currentContentY = currentClientY + scrollTop;
                const minY = Math.max(
                    0,
                    Math.min(startContentY, currentContentY)
                );
                const maxY = Math.max(
                    0,
                    Math.max(startContentY, currentContentY)
                );
                const totalHeight = (rowsRef.current?.length || 0) * rowHeight;
                const topContent = Math.max(0, minY);
                const bottomContent = Math.max(0, Math.min(maxY, totalHeight));
                if (bottomContent > topContent) {
                    const firstIndex = Math.floor(topContent / rowHeight);
                    const lastIndex = Math.floor(
                        (bottomContent - 1) / rowHeight
                    );
                    const isAdditive =
                        state.isAdditive ||
                        (event as unknown as MouseEvent).shiftKey;
                    const nextSelection: RowSelectionState = isAdditive
                        ? { ...rowSelectionRef.current }
                        : {};
                    const selectionIds = rowIds.slice(
                        firstIndex,
                        lastIndex + 1
                    );
                    for (const id of selectionIds) nextSelection[id] = true;
                    // Schedule commit via rAF instead of updating every mousemove
                    pendingSelectionRef.current = nextSelection;
                    if (rafHandleRef.current === null) {
                        rafHandleRef.current = window.requestAnimationFrame(
                            () => {
                                if (pendingSelectionRef.current) {
                                    setRowSelection(
                                        pendingSelectionRef.current
                                    );
                                    pendingSelectionRef.current = null;
                                }
                                rafHandleRef.current = null;
                            }
                        );
                    }
                }
            } catch {
                // ignore selection errors during drag
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            const state = marqueeStateRef.current;
            const container = parentRef.current;
            if (!state || !container) {
                setMarqueeRect(null);
                // clear dragging flag after the click event has a chance to fire
                setTimeout(() => {
                    isMarqueeDraggingRef.current = false;
                }, 0);
                return;
            }
            const rect = container.getBoundingClientRect();
            const scrollTop =
                parentRef.current?.scrollTop ?? container.scrollTop ?? 0;
            const endClientY = event.clientY - rect.top;
            // Recalculate start relative to current scroll to avoid selection jumps
            const startContentY = state.startClientY + scrollTop;
            const endContentY = endClientY + scrollTop;

            marqueeStateRef.current = null;
            setMarqueeRect(null);

            const availableRows = rowsRef.current;
            if (!availableRows.length) {
                if (!state.isAdditive) {
                    setRowSelection({});
                    // Also clear anchors/focus if clicking empty space without modifiers
                    setAnchorIndex(null);
                    setFocusIndex(null);
                    setHighlightedRowId(null);
                }
                return;
            }

            const totalHeight = availableRows.length * rowHeight;

            // CORRECTED MATH: Calculate absolute Top and Bottom regardless of drag direction
            const minY = Math.min(state.startContentY, endContentY);
            const maxY = Math.max(state.startContentY, endContentY);

            // Clamp to content bounds
            const topContent = Math.max(0, minY);
            const bottomContent = Math.max(0, Math.min(maxY, totalHeight));

            // If the selection height is 0 (just a click), perform a clearing click logic
            if (bottomContent <= topContent) {
                if (!state.isAdditive) {
                    setRowSelection({});
                    setAnchorIndex(null);
                    setFocusIndex(null);
                    setHighlightedRowId(null);
                }
                return;
            }

            // Map Y-coordinates to Row Indices
            const firstIndex = Math.floor(topContent / rowHeight);
            const lastIndex = Math.floor((bottomContent - 1) / rowHeight); // -1 to avoid selecting next row if exactly on border

            if (firstIndex > lastIndex) return; // Should not happen with corrected math, but safety check

            // CORRECTED MODIFIER LOGIC: Include Shift for additive selection
            const isAdditive = state.isAdditive || event.shiftKey;

            const nextSelection: RowSelectionState = isAdditive
                ? { ...rowSelectionRef.current }
                : {};
            // Use rowIds slice to build selection without iterating the entire row list
            const selectionIds = rowIds.slice(firstIndex, lastIndex + 1);
            for (const id of selectionIds) {
                nextSelection[id] = true;
            }
            setRowSelection(nextSelection);

            // Update Focus/Anchor to the item under the mouse release
            const focusIndexValue = Math.max(
                0,
                Math.min(
                    availableRows.length - 1,
                    Math.floor(endContentY / rowHeight)
                )
            );

            // Only update Anchor if this wasn't an additive operation,
            // OR if it's a fresh drag. Windows behavior varies, but resetting anchor on Box Select is standard.
            setAnchorIndex(focusIndexValue);
            setFocusIndex(focusIndexValue);

            const focusRow = availableRows[focusIndexValue];
            if (focusRow) {
                setHighlightedRowId(focusRow.id);
                // Optional: Don't scroll to it on drag release, it can be jarring
                // rowVirtualizer.scrollToIndex(focusIndexValue);
            }
            marqueeClickBlockRef.current = true;
            if (marqueeBlockResetRef.current) {
                window.clearTimeout(marqueeBlockResetRef.current);
                marqueeBlockResetRef.current = null;
            }
            marqueeBlockResetRef.current = window.setTimeout(() => {
                marqueeClickBlockRef.current = false;
                marqueeBlockResetRef.current = null;
            }, 0);
            // clear marquee dragging flag after release (allow click event to be blocked)
            setTimeout(() => {
                isMarqueeDraggingRef.current = false;
            }, 0);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            if (marqueeBlockResetRef.current) {
                window.clearTimeout(marqueeBlockResetRef.current);
                marqueeBlockResetRef.current = null;
            }
            // cancel any pending rAF
            if (rafHandleRef.current !== null) {
                window.cancelAnimationFrame(rafHandleRef.current);
                rafHandleRef.current = null;
            }
        };
    }, [rowVirtualizer]);

    const selectAllRows = useCallback(() => {
        const allRows = table.getRowModel().rows;
        const nextSelection: RowSelectionState = {};
        allRows.forEach((row) => {
            if (row.original.isGhost) return;
            nextSelection[row.id] = true;
        });
        setRowSelection(nextSelection);
        if (allRows.length) {
            const bottomIndex = allRows.length - 1;
            const bottomRow = allRows[bottomIndex];
            setAnchorIndex(bottomIndex);
            setFocusIndex(bottomIndex);
            setHighlightedRowId(bottomRow?.id ?? null);
            rowVirtualizer.scrollToIndex(bottomIndex);
        }
    }, [rowVirtualizer, table]);

    const rowSelectionState = table.getState().rowSelection;
    const selectedTorrents = useMemo(
        () =>
            table
                .getSelectedRowModel()
                .rows.map((row) => row.original)
                .filter((torrent) => !torrent.isGhost),
        [table, rowSelectionState]
    );

    useEffect(() => {
        onSelectionChange?.(selectedTorrents);
    }, [onSelectionChange, selectedTorrents]);

    const {
        activate: activateDashboardScope,
        deactivate: deactivateDashboardScope,
    } = useKeyboardScope(KEY_SCOPE.Dashboard);

    useTorrentShortcuts({
        scope: KEY_SCOPE.Dashboard,
        selectedTorrents,
        selectAll: selectAllRows,
        onAction,
        onRequestDetails,
    });

    const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
    const rowsById = useMemo(() => {
        const map = new Map<string, Row<Torrent>>();
        rows.forEach((row) => {
            map.set(row.id, row);
        });
        return map;
    }, [rows]);
    const lastActiveRowIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!onActiveRowChange) return;
        if (lastActiveRowIdRef.current === highlightedRowId) return;
        lastActiveRowIdRef.current = highlightedRowId ?? null;
        const activeRow = highlightedRowId
            ? rowsById.get(highlightedRowId)
            : null;
        onActiveRowChange(activeRow?.original ?? null);
    }, [highlightedRowId, onActiveRowChange, rowsById]);

    // Check if we are sorting by queue position
    // If we are, we can enable Drag & Drop reordering
    const isQueueSort = sorting.some((s) => s.id === "queue");
    const canReorderQueue = isQueueSort && Boolean(onAction);

    useEffect(() => {
        if (!canReorderQueue) {
            setActiveRowId(null);
            setDropTargetRowId(null);
        }
    }, [canReorderQueue]);

    const handleDropTargetChange = useCallback((id: string | null) => {
        setDropTargetRowId(id);
    }, []);

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            setActiveRowId(event.active.id as string);
        },
        [canReorderQueue]
    );

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            setActiveRowId(null);
            setDropTargetRowId(null);
            if (!canReorderQueue) return;
            const { active, over } = event;
            if (!active || !over || active.id === over.id) return;
            const draggedIndex = rowIds.indexOf(active.id as string);
            const targetIndex = rowIds.indexOf(over.id as string);
            if (draggedIndex === -1 || targetIndex === -1) return;
            const draggedRow = rowsById.get(active.id as string);
            if (!draggedRow || !onAction) return;

            // Determine if ascending or descending
            const queueSort = sorting.find((s) => s.id === "queue");
            const isDesc = queueSort?.desc;

            const normalizedFrom = isDesc
                ? rows.length - 1 - draggedIndex
                : draggedIndex;
            const normalizedTo = isDesc
                ? rows.length - 1 - targetIndex
                : targetIndex;
            const delta = normalizedTo - normalizedFrom;
            if (delta === 0) return;

            const actionKey = delta > 0 ? "queue-move-down" : "queue-move-up";
            const steps = Math.abs(delta);
            for (let i = 0; i < steps; i++) {
                await onAction(actionKey, draggedRow.original);
            }
        },
        [canReorderQueue, onAction, sorting, rowIds, rowsById, rows.length]
    );

    const handleRowDragCancel = useCallback(() => {
        setActiveRowId(null);
        setDropTargetRowId(null);
    }, []);

    const activeDragRow = activeRowId
        ? rowsById.get(activeRowId) ?? null
        : null;

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const allRows = table.getRowModel().rows;
            if (!allRows.length) return;

            const clampIndex = (value: number) =>
                Math.max(0, Math.min(allRows.length - 1, value));

            const focusSingleRow = (index: number) => {
                const targetIndex = clampIndex(index);
                const targetRow = allRows[targetIndex];
                if (!targetRow) return;
                setRowSelection({ [targetRow.id]: true });
                setAnchorIndex(targetIndex);
                setFocusIndex(targetIndex);
                setHighlightedRowId(targetRow.id);
                rowVirtualizer.scrollToIndex(targetIndex);
            };

            const selectRange = (startIndex: number, endIndex: number) => {
                const normalizedStart = clampIndex(startIndex);
                const normalizedEnd = clampIndex(endIndex);
                const [from, to] =
                    normalizedStart <= normalizedEnd
                        ? [normalizedStart, normalizedEnd]
                        : [normalizedEnd, normalizedStart];
                const nextSelection: RowSelectionState = {};
                for (let i = from; i <= to; i += 1) {
                    const row = allRows[i];
                    if (row) {
                        nextSelection[row.id] = true;
                    }
                }
                setRowSelection(nextSelection);
                setFocusIndex(normalizedEnd);
                const targetRow = allRows[normalizedEnd];
                if (targetRow) {
                    setHighlightedRowId(targetRow.id);
                }
                rowVirtualizer.scrollToIndex(normalizedEnd);
            };

            const { key, shiftKey, ctrlKey, metaKey } = event;
            if ((ctrlKey || metaKey) && key.toLowerCase() === "a") {
                event.preventDefault();
                selectAllRows();
                return;
            }
            if (key === "ArrowDown" || key === "ArrowUp") {
                event.preventDefault();
                const delta = key === "ArrowDown" ? 1 : -1;
                const baseIndex =
                    focusIndex ?? (delta === 1 ? -1 : allRows.length);
                const targetIndex = baseIndex + delta;
                if (shiftKey) {
                    const anchor = anchorIndex ?? clampIndex(baseIndex);
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "Home") {
                event.preventDefault();
                const targetIndex = 0;
                if (shiftKey) {
                    const anchor = anchorIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "End") {
                event.preventDefault();
                const targetIndex = allRows.length - 1;
                if (shiftKey) {
                    const anchor = anchorIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }
        },
        [anchorIndex, focusIndex, rowVirtualizer, selectAllRows, table]
    );

    // --- SENSORS ---
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor)
    );

    const rowSensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragHeaderId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragHeaderId(null);
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            // Compute new order and update both React state and the react-table
            // instance to ensure header and cell renderers refresh immediately.
            setColumnOrder((order) => {
                const oldIndex = order.indexOf(active.id as string);
                const newIndex = order.indexOf(over.id as string);
                if (oldIndex < 0 || newIndex < 0) return order;
                const next = arrayMove(order, oldIndex, newIndex);
                try {
                    // Keep react-table's internal state in sync immediately.
                    table.setColumnOrder(next as string[]);
                } catch {}
                return next;
            });
        }
    };

    const handleDragCancel = () => {
        setActiveDragHeaderId(null);
    };

    // --- EVENTS ---
    const handleRowClick = useCallback(
        (e: React.MouseEvent, rowId: string, originalIndex: number) => {
            // Prevent row click from firing while marquee-dragging
            if (isMarqueeDraggingRef.current) return;
            const target = e.target as HTMLElement;
            if (marqueeClickBlockRef.current) {
                marqueeClickBlockRef.current = false;
                return;
            }
            const rowData = table.getRow(rowId)?.original;
            if (rowData?.isGhost) return;
            if (
                target.closest("button") ||
                target.closest("label") ||
                target.closest("[data-no-select]")
            )
                return;

            const isMultiSelect = e.ctrlKey || e.metaKey;
            const isRangeSelect = e.shiftKey;
            const rangeAnchor = anchorIndex ?? focusIndex;

            if (isRangeSelect && rangeAnchor !== null) {
                const allRows = table.getRowModel().rows;
                const actualAnchorIndex = Math.max(
                    0,
                    Math.min(allRows.length - 1, rangeAnchor)
                );
                const [start, end] =
                    actualAnchorIndex < originalIndex
                        ? [actualAnchorIndex, originalIndex]
                        : [originalIndex, actualAnchorIndex];
                const newSel: RowSelectionState = {};
                const ids = rowIds.slice(start, end + 1);
                for (const id of ids) newSel[id] = true;
                setRowSelection(newSel);
                setFocusIndex(originalIndex);
                setHighlightedRowId(rowId);
                return;
            }

            if (isMultiSelect) {
                table.getRow(rowId).toggleSelected();
            } else {
                setRowSelection({ [rowId]: true });
            }

            setAnchorIndex(originalIndex);
            setFocusIndex(originalIndex);
            setHighlightedRowId(rowId);
        },
        [anchorIndex, focusIndex, table]
    );

    const handleRowDoubleClick = useCallback(
        (torrent: Torrent) => {
            if (disableDetailOpen) return;
            onRequestDetails?.(torrent);
            onRequestDetailsFullscreen?.(torrent);
        },
        [disableDetailOpen, onRequestDetails, onRequestDetailsFullscreen]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, torrent: Torrent) => {
            e.preventDefault();
            if (torrent.isGhost) return;
            const virtualElement = createVirtualElement(e.clientX, e.clientY, {
                margin: fileContextMenuMargin,
            });
            setContextMenu({ virtualElement, torrent });

            const allRows = table.getRowModel().rows;
            const row = allRows.find((r) => r.original.id === torrent.id);
            if (!row) return;
            if (!rowSelection[row.id]) {
                setRowSelection({ [row.id]: true });
            }
            setHighlightedRowId(row.id);
            setAnchorIndex(row.index);
            setFocusIndex(row.index);
        },
        [rowSelection, table]
    );

    const handleHeaderContextMenu = useCallback(
        (event: React.MouseEvent, columnId: string | null) => {
            event.preventDefault();
            event.stopPropagation();
            const virtualElement = createVirtualElement(
                event.clientX,
                event.clientY,
                { margin: fileContextMenuMargin }
            );
            setHeaderContextMenu({ virtualElement, columnId });
        },
        [fileContextMenuMargin]
    );

    const handleHeaderContainerContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            if (target.closest("[role='columnheader']")) return;
            handleHeaderContextMenu(event, null);
        },
        [handleHeaderContextMenu]
    );

    const activeHeader = useMemo(() => {
        return table.getFlatHeaders().find((h) => h.id === activeDragHeaderId);
    }, [activeDragHeaderId, table]);

    useEffect(() => {
        tableContainerRef.current?.focus();
    }, []);

    // Cleanup context menu if torrent is removed
    useEffect(() => {
        if (!contextMenu) return;
        const exists = torrents.some((t) => t.id === contextMenu.torrent.id);
        if (!exists) {
            setContextMenu(null);
        }
    }, [contextMenu, torrents]);

    const headerMenuTriggerRect = headerContextMenu
        ? headerContextMenu.virtualElement.getBoundingClientRect()
        : null;

    const headerMenuActiveColumn = useMemo(() => {
        if (!headerContextMenu?.columnId) return null;
        return table.getColumn(headerContextMenu.columnId) ?? null;
    }, [headerContextMenu, table, columnVisibility]);
    const handleHeaderMenuAction = useCallback(
        (action: () => void, options: HeaderMenuActionOptions = {}) => {
            action();
            if (!options.keepOpen) {
                setHeaderContextMenu(null);
            }
        },
        [setHeaderContextMenu]
    );

    const headerMenuHideLabel = useMemo(() => {
        if (!headerMenuActiveColumn) {
            return t("table.actions.hide_column");
        }
        return t("table.actions.hide_column_named", {
            column: getColumnLabel(headerMenuActiveColumn),
        });
    }, [getColumnLabel, headerMenuActiveColumn, t]);
    const isHeaderMenuHideEnabled = Boolean(
        headerMenuActiveColumn?.getIsVisible()
    );

    const headerMenuItems = useMemo<HeaderMenuItem[]>(() => {
        if (!headerContextMenu) return [];
        const byId = new Map<string, Column<Torrent>>();
        table.getAllLeafColumns().forEach((column) => {
            byId.set(column.id, column);
        });

        const items: HeaderMenuItem[] = [];
        const seen = new Set<string>();
        const orderedIds =
            columnOrder.length > 0
                ? columnOrder
                : table.getAllLeafColumns().map((column) => column.id);
        orderedIds.forEach((id) => {
            if (id === "selection") return;
            const column = byId.get(id) ?? table.getColumn(id);
            if (!column) return;
            if (seen.has(column.id)) return;
            seen.add(column.id);
            items.push({
                column,
                label: getColumnLabel(column),
                isPinned:
                    !!headerMenuActiveColumn &&
                    headerMenuActiveColumn.id === column.id,
            });
        });

        // Safety: include any remaining columns not present in `columnOrder`.
        table.getAllLeafColumns().forEach((column) => {
            if (column.id === "selection") return;
            if (seen.has(column.id)) return;
            items.push({
                column,
                label: getColumnLabel(column),
                isPinned:
                    !!headerMenuActiveColumn &&
                    headerMenuActiveColumn.id === column.id,
            });
        });

        return items;
    }, [
        columnOrder,
        getColumnLabel,
        headerContextMenu,
        headerMenuActiveColumn,
        table,
    ]);

    const headerContainerClass = cn(
        "flex w-full sticky top-0 z-20 border-b border-content1/20 bg-content1/10 backdrop-blur-sm "
    );
    const tableShellClass = cn(
        "relative flex-1 h-full min-h-0 flex flex-col overflow-hidden",
        "rounded-panel border border-default/10"
    );
    const headerSortableIds = useMemo(
        () =>
            table
                .getAllLeafColumns()
                .filter((column) => column.getIsVisible())
                .map((column) => column.id),
        [columnOrder, columnVisibility, table]
    );

    return (
        <>
            <div
                ref={tableContainerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onFocus={activateDashboardScope}
                onBlur={deactivateDashboardScope}
                style={{ borderRadius: "inherit" }}
                className={cn(
                    "flex-1 min-h-0 flex flex-col h-full overflow-hidden relative select-none outline-none",
                    !embedded && "acrylic",
                    !embedded && BLOCK_SHADOW
                )}
                onClick={() => setContextMenu(null)}
            >
                <ColumnMeasurementLayer
                    headers={measurementHeaders}
                    rows={measurementRows}
                    measureLayerRef={measureLayerRef}
                />
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={isAnyColumnResizing ? [] : sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <div className={tableShellClass}>
                        <div
                            className={headerContainerClass}
                            onContextMenu={handleHeaderContainerContextMenu}
                        >
                            <SortableContext
                                items={headerSortableIds}
                                strategy={horizontalListSortingStrategy}
                            >
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <div
                                        key={headerGroup.id}
                                        className="flex w-full min-w-max"
                                        style={{
                                            width: getTableTotalWidthCss(
                                                table.getTotalSize()
                                            ),
                                        }}
                                    >
                                        {headerGroup.headers.map((header) => (
                                            <DraggableHeader
                                                key={header.id}
                                                header={header}
                                                isAnyColumnResizing={
                                                    isAnyColumnResizing
                                                }
                                                onContextMenu={(e) =>
                                                    handleHeaderContextMenu(
                                                        e,
                                                        header.column.id
                                                    )
                                                }
                                                onAutoFitColumn={
                                                    handleColumnAutoFitRequest
                                                }
                                                onResizeStart={
                                                    handleColumnResizeStart
                                                }
                                                isResizing={
                                                    columnSizingInfo.isResizingColumn ===
                                                        header.column.id ||
                                                    activeResizeColumnId ===
                                                        header.column.id
                                                }
                                            />
                                        ))}
                                    </div>
                                ))}
                            </SortableContext>
                        </div>

                        <div
                            ref={parentRef}
                            className="relative flex-1 h-full min-h-0 overflow-y-auto w-full overlay-scrollbar"
                        >
                            {isLoading && torrents.length === 0 ? (
                                <div className="w-full">
                                    {Array.from({ length: 15 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center w-full border-b border-content1/5 px-panel"
                                            style={{
                                                height: TABLE_LAYOUT.rowHeight,
                                            }}
                                        >
                                            <Skeleton className="h-indicator w-full rounded-md bg-content1/10" />
                                        </div>
                                    ))}
                                </div>
                            ) : torrents.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center gap-stage px-stage text-foreground/60">
                                    <div
                                        className="flex items-center gap-tools text-xs font-semibold uppercase text-foreground/60"
                                        style={{
                                            letterSpacing:
                                                "var(--tt-tracking-ultra)",
                                        }}
                                    >
                                        <StatusIcon
                                            Icon={FileUp}
                                            size="lg"
                                            className="text-primary"
                                        />
                                        <span>
                                            {t("table.empty_hint", {
                                                shortcut: ADD_TORRENT_SHORTCUT,
                                            })}
                                        </span>
                                    </div>
                                    <p
                                        className="text-scaled uppercase text-foreground/40"
                                        style={{
                                            letterSpacing:
                                                "var(--tt-tracking-wide)",
                                        }}
                                    >
                                        {t("table.empty_hint_subtext")}
                                    </p>
                                    <div className="w-full max-w-3xl space-y-tight">
                                        <div
                                            className="grid grid-cols-torrent gap-tools rounded-2xl border border-content1/20 bg-background/40 px-panel py-panel text-scaled uppercase text-foreground/50"
                                            style={{
                                                letterSpacing:
                                                    "var(--tt-tracking-ultra)",
                                            }}
                                        >
                                            <span className="h-indicator w-full rounded-full bg-content1/20" />
                                            <span>
                                                {t("table.header_name")}
                                            </span>
                                            <span>
                                                {t("table.header_speed")}
                                            </span>
                                        </div>
                                        {Array.from({ length: 3 }).map(
                                            (_, index) => (
                                                <div
                                                    key={index}
                                                    className="grid grid-cols-torrent gap-tools rounded-2xl bg-content1/10 px-panel py-panel"
                                                >
                                                    <span className="h-indicator w-full rounded-full bg-content1/20" />
                                                    <span className="h-indicator w-full rounded-full bg-content1/20" />
                                                    <span className="h-indicator w-full rounded-full bg-content1/20" />
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <DndContext
                                    collisionDetection={closestCenter}
                                    sensors={
                                        canReorderQueue ? rowSensors : undefined
                                    }
                                    onDragStart={handleRowDragStart}
                                    onDragEnd={handleRowDragEnd}
                                    onDragCancel={handleRowDragCancel}
                                >
                                    <SortableContext
                                        items={rowIds}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div
                                            className="relative w-full min-w-max"
                                            style={{
                                                height: `${rowVirtualizer.getTotalSize()}px`,
                                                width: getTableTotalWidthCss(
                                                    table.getTotalSize()
                                                ),
                                            }}
                                        >
                                            {rowVirtualizer
                                                .getVirtualItems()
                                                .map((virtualRow) => {
                                                    const row =
                                                        rows[virtualRow.index];
                                                    return (
                                                        <VirtualRow
                                                            key={row.id}
                                                            row={row}
                                                            virtualRow={
                                                                virtualRow
                                                            }
                                                            isSelected={row.getIsSelected()}
                                                            isContext={
                                                                contextMenu
                                                                    ?.torrent
                                                                    .id ===
                                                                row.original.id
                                                            }
                                                            onClick={
                                                                handleRowClick
                                                            }
                                                            onDoubleClick={
                                                                handleRowDoubleClick
                                                            }
                                                            onContextMenu={
                                                                handleContextMenu
                                                            }
                                                            isQueueSortActive={
                                                                canReorderQueue
                                                            }
                                                            dropTargetRowId={
                                                                dropTargetRowId
                                                            }
                                                            activeRowId={
                                                                activeRowId
                                                            }
                                                            isHighlighted={
                                                                highlightedRowId ===
                                                                    row.id &&
                                                                !row.getIsSelected()
                                                            }
                                                            onDropTargetChange={
                                                                handleDropTargetChange
                                                            }
                                                            isAnyColumnResizing={
                                                                isAnyColumnResizing
                                                            }
                                                            columnOrder={columnOrder}
                                                        />
                                                    );
                                                })}
                                        </div>
                                    </SortableContext>
                                    {renderOverlayPortal(
                                        <DragOverlay
                                            adjustScale={false}
                                            dropAnimation={null}
                                            className={DND_OVERLAY_CLASSES}
                                        >
                                            {activeDragRow ? (
                                                <div
                                                    style={{
                                                        width: getTableTotalWidthCss(
                                                            table.getTotalSize()
                                                        ),
                                                        height: TABLE_LAYOUT.rowHeight,
                                                    }}
                                                    className={cn(
                                                        "pointer-events-none border border-content1/20 bg-background/90 backdrop-blur-3xl",
                                                        PANEL_SHADOW
                                                    )}
                                                >
                                                    <div className="flex h-full w-full items-center">
                                                        {renderVisibleCells(
                                                            activeDragRow
                                                        )}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </DragOverlay>
                                    )}
                                </DndContext>
                            )}
                            {marqueeRect && (
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute rounded-(--r-sm) border border-primary/60 bg-primary/20"
                                    style={{
                                        left: marqueeRect.left,
                                        top: marqueeRect.top,
                                        width: marqueeRect.width,
                                        height: marqueeRect.height,
                                    }}
                                />
                            )}
                        </div>
                    </div>
                    {renderOverlayPortal(
                        <DragOverlay
                            adjustScale={false}
                            dropAnimation={null}
                            className={DND_OVERLAY_CLASSES}
                        >
                            {activeHeader ? (
                                <ColumnHeaderPreview header={activeHeader} />
                            ) : null}
                        </DragOverlay>
                    )}
                </DndContext>

                {contextMenu &&
                    renderOverlayPortal(
                        <AnimatePresence>
                            <Dropdown
                                isOpen
                                onClose={() => setContextMenu(null)}
                                placement="bottom-start"
                                shouldFlip
                            >
                                <DropdownTrigger>
                                    <div
                                        style={{
                                            position: "fixed",
                                            top: contextMenu.virtualElement.getBoundingClientRect()
                                                .top,
                                            left: contextMenu.virtualElement.getBoundingClientRect()
                                                .left,
                                            width: 0,
                                            height: 0,
                                        }}
                                    />
                                </DropdownTrigger>
                                <DropdownMenu
                                    variant="shadow"
                                    className={GLASS_MENU_SURFACE}
                                    onAction={(key) => {
                                        void handleContextMenuAction(
                                            key as
                                                | ContextMenuKey
                                                | "cols"
                                                | "open-folder"
                                                | "copy-magnet"
                                                | "copy-hash"
                                        );
                                    }}
                                >
                                    <DropdownItem
                                        key="pause"
                                        shortcut={getContextMenuShortcut(
                                            "pause"
                                        )}
                                    >
                                        {t("table.actions.pause")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="resume"
                                        shortcut={getContextMenuShortcut(
                                            "resume"
                                        )}
                                    >
                                        {t("table.actions.resume")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="recheck"
                                        shortcut={getContextMenuShortcut(
                                            "recheck"
                                        )}
                                    >
                                        {t("table.actions.recheck")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="queue-title"
                                        isDisabled
                                        className="border-t border-content1/20 mt-tight pt-(--p-tight) px-panel text-scaled font-bold uppercase text-foreground/50"
                                        style={{
                                            letterSpacing:
                                                "var(--tt-tracking-ultra)",
                                        }}
                                    >
                                        {t("table.queue.title")}
                                    </DropdownItem>
                                    <>
                                        {queueMenuActions.map((action) => (
                                            <DropdownItem
                                                key={action.key}
                                                className="pl-stage text-sm"
                                                shortcut={getContextMenuShortcut(
                                                    action.key as ContextMenuKey
                                                )}
                                            >
                                                {action.label}
                                            </DropdownItem>
                                        ))}
                                    </>
                                    <DropdownItem
                                        key="data-title"
                                        isDisabled
                                        className="border-t border-content1/20 mt-tight pt-(--p-tight) px-panel text-scaled font-bold uppercase text-foreground/50"
                                        style={{
                                            letterSpacing:
                                                "var(--tt-tracking-ultra)",
                                        }}
                                    >
                                        {t("table.data.title")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="open-folder"
                                        isDisabled={
                                            !onOpenFolder ||
                                            !contextMenu.torrent.savePath
                                        }
                                    >
                                        {t("table.actions.open_folder")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="copy-magnet"
                                        isDisabled={!isClipboardSupported}
                                    >
                                        {t("table.actions.copy_magnet")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="copy-hash"
                                        isDisabled={!isClipboardSupported}
                                    >
                                        {t("table.actions.copy_hash")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="remove"
                                        color="danger"
                                        shortcut={getContextMenuShortcut(
                                            "remove"
                                        )}
                                    >
                                        {t("table.actions.remove")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="remove-with-data"
                                        color="danger"
                                        shortcut={getContextMenuShortcut(
                                            "remove-with-data"
                                        )}
                                    >
                                        {t("table.actions.remove_with_data")}
                                    </DropdownItem>
                                    <DropdownItem key="cols" showDivider>
                                        {t("table.column_picker_title")}
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </AnimatePresence>
                    )}

                {headerContextMenu &&
                    headerMenuTriggerRect &&
                    renderOverlayPortal(
                        <AnimatePresence>
                            <Dropdown
                                isOpen
                                onClose={() => setHeaderContextMenu(null)}
                                placement="bottom-start"
                                shouldFlip
                                closeOnSelect={false}
                            >
                                <DropdownTrigger>
                                    <div
                                        style={{
                                            position: "fixed",
                                            top: headerMenuTriggerRect.top,
                                            left: headerMenuTriggerRect.left,
                                            width: 0,
                                            height: 0,
                                        }}
                                    />
                                </DropdownTrigger>
                                <DropdownMenu
                                    variant="shadow"
                                    classNames={{ list: "overflow-hidden" }}
                                    className={cn(
                                        GLASS_MENU_SURFACE,
                                        "min-w-(--tt-menu-min-width)",
                                        "overflow-hidden"
                                    )}
                                >
                                    <DropdownItem
                                        key="hide-column"
                                        color="danger"
                                        isDisabled={!isHeaderMenuHideEnabled}
                                        className="px-panel py-tight text-scaled font-semibold"
                                        onPress={() =>
                                            handleHeaderMenuAction(() =>
                                                headerMenuActiveColumn?.toggleVisibility(
                                                    false
                                                )
                                            )
                                        }
                                    >
                                        {headerMenuHideLabel}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="fit-all-columns"
                                        className="px-panel py-tight text-scaled font-semibold"
                                        onPress={() =>
                                            handleHeaderMenuAction(
                                                autoFitAllColumns
                                            )
                                        }
                                        showDivider
                                    >
                                        {t("table.actions.fit_all_columns")}
                                    </DropdownItem>
                                    <DropdownSection
                                        key="columns-section"
                                        title={t("table.column_picker_title")}
                                    >
                                        {
                                            headerMenuItems.map((item) => {
                                                const isVisible =
                                                    item.column.getIsVisible();
                                                return (
                                                    <DropdownItem
                                                        key={item.column.id}
                                                        className={cn(
                                                            "pl-stage text-scaled",
                                                            item.isPinned &&
                                                                "font-semibold text-foreground"
                                                        )}
                                                        closeOnSelect={false}
                                                        onPress={() =>
                                                            handleHeaderMenuAction(
                                                                () =>
                                                                    item.column.toggleVisibility(
                                                                        !isVisible
                                                                    ),
                                                                {
                                                                    keepOpen:
                                                                        true,
                                                                }
                                                            )
                                                        }
                                                        startContent={
                                                            <Checkbox
                                                                isSelected={
                                                                    isVisible
                                                                }
                                                                size="md"
                                                                disableAnimation
                                                                classNames={{
                                                                    base: "mr-tight",
                                                                }}
                                                            />
                                                        }
                                                    >
                                                        {item.label}
                                                    </DropdownItem>
                                                );
                                            }) as ItemElement<object>[]
                                        }
                                    </DropdownSection>
                                </DropdownMenu>
                            </Dropdown>
                        </AnimatePresence>
                    )}
            </div>

            <Modal
                isOpen={isColumnModalOpen}
                onOpenChange={handleColumnModalOpenChange}
                size="lg"
                backdrop="blur"
                motionProps={INTERACTION_CONFIG.modalBloom}
                classNames={{
                    base: cn(
                        GLASS_MODAL_SURFACE,
                        "flex flex-col overflow-hidden",
                        PANEL_SHADOW
                    ),
                }}
            >
                <ModalContent>
                    {() => (
                        <>
                            <ModalHeader>
                                {t("table.column_picker_title")}
                            </ModalHeader>
                            <ModalBody>
                                {table.getAllLeafColumns().map((column) => {
                                    const rawId = column.id;
                                    if (rawId === "selection") return null;
                                    const id = rawId as ColumnId;
                                    return (
                                        <div
                                            key={column.id}
                                            className="flex justify-between p-tight"
                                        >
                                            <span>
                                                {t(
                                                    COLUMN_DEFINITIONS[id]
                                                        ?.labelKey ?? id
                                                )}
                                            </span>
                                            <Checkbox
                                                isSelected={column.getIsVisible()}
                                                onValueChange={(val) =>
                                                    column.toggleVisibility(
                                                        !!val
                                                    )
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}

// Module Augmentation for strict typing of 'align'
declare module "@tanstack/react-table" {
    interface ColumnMeta<TData, TValue> {
        align?: "start" | "center" | "end";
    }
}
