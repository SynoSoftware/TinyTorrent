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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Checkbox,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
    Skeleton,
    cn,
} from "@heroui/react";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type Header,
    type Row,
    type RowSelectionState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, FileUp } from "lucide-react";
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import { GLASS_MENU_SURFACE } from "../../../shared/ui/layout/glass-surface";
import { useKeyboardScope } from "../../../shared/hooks/useKeyboardScope";
import type { TorrentStatus } from "../../../services/rpc/entities";

import type { Torrent } from "../types/torrent";
import {
    COLUMN_DEFINITIONS,
    DEFAULT_COLUMN_ORDER,
    type ColumnId,
    type DashboardTableMeta,
} from "./ColumnDefinitions";
import { TABLE_LAYOUT } from "../config/layout";
import { INTERACTION_CONFIG } from "../../../config/interaction";
import { useTorrentShortcuts } from "../hooks/useTorrentShortcuts";
import { KEY_SCOPE, KEYMAP, ShortcutIntent } from "../../../config/keymap";
import {
    ICON_STROKE_WIDTH,
    ICON_STROKE_WIDTH_DENSE,
} from "../../../config/iconography";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.8";
const CELL_PADDING_CLASS = "pl-2 pr-3";
const CELL_BASE_CLASSES =
    "flex items-center overflow-hidden h-full truncate box-border leading-none";
const CONTEXT_MENU_MARGIN = 16;
const SPEED_HISTORY_LIMIT = 30;

// --- TYPES ---
export type TorrentTableAction =
    | "pause"
    | "resume"
    | "recheck"
    | "remove"
    | "remove-with-data"
    | "queue-move-top"
    | "queue-move-up"
    | "queue-move-down"
    | "queue-move-bottom";

type ContextMenuKey = TorrentTableAction | "cols";

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

const getContextMenuShortcut = (action: ContextMenuKey) =>
    formatShortcutLabel(CONTEXT_MENU_SHORTCUTS[action]);

export type OptimisticStatusEntry = {
    state: TorrentStatus;
    expiresAt: number;
};
export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;

interface TorrentTableProps {
    torrents: Torrent[];
    filter: string;
    isLoading?: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    onRequestDetails?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
    optimisticStatuses?: OptimisticStatusMap;
    disableDetailOpen?: boolean;
}

// --- HELPERS ---
const clampContextMenuPoint = (x: number, y: number) => {
    if (typeof window === "undefined") {
        return { x, y };
    }
    const maxX = Math.max(
        CONTEXT_MENU_MARGIN,
        window.innerWidth - CONTEXT_MENU_MARGIN
    );
    const maxY = Math.max(
        CONTEXT_MENU_MARGIN,
        window.innerHeight - CONTEXT_MENU_MARGIN
    );
    return {
        x: Math.min(Math.max(x, CONTEXT_MENU_MARGIN), maxX),
        y: Math.min(Math.max(y, CONTEXT_MENU_MARGIN), maxY),
    };
};

const createVirtualElement = (x: number, y: number) => {
    const { x: boundedX, y: boundedY } = clampContextMenuPoint(x, y);
    return {
        getBoundingClientRect: () => ({
            width: 0,
            height: 0,
            top: boundedY,
            right: boundedX,
            bottom: boundedY,
            left: boundedX,
            x: boundedX,
            y: boundedY,
            toJSON: () => {},
        }),
    };
};

// --- SUB-COMPONENT: DRAGGABLE HEADER ---
const DraggableHeader = memo(
    ({
        header,
        isOverlay = false,
        onContextMenu,
    }: {
        header: Header<Torrent, unknown>;
        isOverlay?: boolean;
        onContextMenu?: (e: React.MouseEvent) => void;
    }) => {
        const { column } = header;
        const {
            setNodeRef,
            attributes,
            listeners,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: header.column.id });

        const style: CSSProperties = {
            transform: CSS.Translate.toString(transform),
            transition,
            width: column.getSize(),
            zIndex: isDragging || isOverlay ? 50 : 0,
            boxSizing: "border-box",
        };

        const sortState = column.getIsSorted();
        const canSort = column.getCanSort();
        const align = column.columnDef.meta?.align || "start";
        const isSelection = header.id === "selection";

        return (
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                role="columnheader"
                tabIndex={-1}
                onClick={canSort ? column.getToggleSortingHandler() : undefined}
                onContextMenu={onContextMenu}
                className={cn(
                    "relative flex items-center h-10 border-r border-content1/10 transition-colors group select-none overflow-hidden",
                    "box-border",
                    "border-l-2 border-l-transparent",
                    canSort
                        ? "cursor-pointer hover:bg-content1/10"
                        : "cursor-default",
                    isOverlay
                        ? "bg-content1/90 shadow-xl cursor-grabbing"
                        : "bg-transparent",
                    isDragging && !isOverlay ? "opacity-30" : "opacity-100"
                )}
            >
                <div
                    className={cn(
                        CELL_BASE_CLASSES,
                        "flex-1 gap-2",
                        "text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/60",
                        isOverlay && "text-foreground",
                        CELL_PADDING_CLASS,
                        align === "center" && "justify-center",
                        align === "end" && "justify-end",
                        isSelection && "justify-center px-0"
                    )}
                >
                    {flexRender(column.columnDef.header, header.getContext())}
                    {sortState === "asc" && (
                        <ArrowUp
                            size={12}
                            strokeWidth={ICON_STROKE_WIDTH_DENSE}
                            className="text-primary shrink-0"
                        />
                    )}
                    {sortState === "desc" && (
                        <ArrowDown
                            size={12}
                            strokeWidth={ICON_STROKE_WIDTH_DENSE}
                            className="text-primary shrink-0"
                        />
                    )}
                </div>

                {!isOverlay && header.column.getCanResize() && (
                    <div
                        onMouseDown={(e) => {
                            header.getResizeHandler()(e);
                            e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                            header.getResizeHandler()(e);
                            e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 h-full w-4 cursor-col-resize touch-none select-none flex justify-center items-center z-30"
                    >
                        <div
                            className={cn(
                                "w-[1px] h-4 bg-foreground/10 transition-colors rounded-full",
                                "group-hover:bg-primary/50",
                                column.getIsResizing() &&
                                    "bg-primary w-[2px] h-6"
                            )}
                        />
                    </div>
                )}
            </div>
        );
    }
);

const renderVisibleCells = (row: Row<Torrent>) =>
    row.getVisibleCells().map((cell) => {
        const align = cell.column.columnDef.meta?.align || "start";
        const isSelectionColumn = cell.column.id === "selection";
        return (
            <div
                key={cell.id}
                style={{
                    width: cell.column.getSize(),
                    boxSizing: "border-box",
                }}
                data-selection-cell={isSelectionColumn ? "true" : undefined}
                className={cn(
                    CELL_BASE_CLASSES,
                    CELL_PADDING_CLASS,
                    align === "center" && "justify-center",
                    align === "end" && "justify-end",
                    isSelectionColumn && "justify-center px-0"
                )}
            >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
        );
    });

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
    }) => {
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
        });

        const rowStyle = useMemo<CSSProperties>(() => {
            const style: CSSProperties = {
                position: "absolute",
                top: `${virtualRow.start}px`,
                left: 0,
                width: "100%",
                height: `${TABLE_LAYOUT.rowHeight}px`,
                boxSizing: "border-box",
            };
            if (transform) {
                style.transform = CSS.Translate.toString(transform);
            }
            // Retain drag transition, BUT we will remove highlight transition
            if (transition) {
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
                    "absolute top-0 left-0 border-b border-content1/5",
                    "box-border",
                    // Dragging overrides
                    isQueueSortActive ? "cursor-grab" : "cursor-default",
                    isDragging &&
                        "opacity-50 grayscale scale-[0.98] z-50 cursor-grabbing"
                )}
                style={rowStyle}
                onClick={(e) => onClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onDoubleClick(row.original)}
                onContextMenu={(e) => onContextMenu(e, row.original)}
            >
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <div
                    className={cn(
                        "relative flex items-center w-full h-full px-0",
                        // SELECTION STATE: Stronger contrast, no border, NO TRANSITION
                        isSelected ? "bg-primary/20" : "hover:bg-content1/10",

                        // Context Menu Highlight
                        isContext && !isSelected && "bg-content1/20",

                        // Keyboard Highlight (Focus)
                        isHighlighted && !isSelected && "bg-foreground/10"
                    )}
                >
                    {renderVisibleCells(row)}
                    {isDropTarget && (
                        <div className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--heroui-primary),0.8)] z-50" />
                    )}
                </div>
            </div>
        );
    }
);

type QueueMenuAction = { key: TorrentTableAction; label: string };

// --- MAIN COMPONENT ---
export function TorrentTable({
    torrents,
    filter,
    isLoading = false,
    onAction,
    onRequestDetails,
    onSelectionChange,
    optimisticStatuses = {},
    disableDetailOpen = false,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(
        null
    );
    const [speedHistory, setSpeedHistory] = useState<Record<string, number[]>>(
        {}
    );

    const getDisplayTorrent = useCallback(
        (torrent: Torrent) => {
            const override = optimisticStatuses[torrent.id];
            return override ? { ...torrent, state: override.state } : torrent;
        },
        [optimisticStatuses]
    );

    // Prepare data for the table - memoized to prevent re-processing
    const data = useMemo(() => {
        // Map original torrents to display versions (handling optimistic updates)
        const displayTorrents = torrents.map(getDisplayTorrent);
        if (filter === "all") return displayTorrents;
        return displayTorrents.filter((t) => t.state === filter);
    }, [torrents, filter, getDisplayTorrent]);

    const parentRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const focusReturnRef = useRef<HTMLElement | null>(null);
    const queueMenuActions = useMemo<QueueMenuAction[]>(
        () => [
            { key: "queue-move-top", label: t("table.queue.move_top") },
            { key: "queue-move-up", label: t("table.queue.move_up") },
            { key: "queue-move-down", label: t("table.queue.move_down") },
            { key: "queue-move-bottom", label: t("table.queue.move_bottom") },
        ],
        [t]
    );

    useEffect(() => {
        setSpeedHistory((prev) => {
            const next: Record<string, number[]> = {};
            // We iterate over the raw torrents to maintain history
            torrents.forEach((torrent) => {
                const history = prev[torrent.id] ?? [];
                const currentSpeed =
                    torrent.state === "downloading"
                        ? torrent.speed.down
                        : torrent.state === "seeding"
                        ? torrent.speed.up
                        : 0;
                // Avoid updates if speed hasn't changed to save renders?
                // No, sparklines need the time progression.
                const updated = [...history, currentSpeed].slice(
                    -SPEED_HISTORY_LIMIT
                );
                next[torrent.id] = updated;
            });
            return next;
        });
    }, [torrents]);

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
            ).filter(
                (id: string) => id === "selection" || allDefKeys.includes(id)
            );

            allDefKeys.forEach((id) => {
                if (!validOrder.includes(id)) validOrder.push(id);
            });

            return {
                columnOrder: validOrder,
                columnVisibility: parsed.columnVisibility || {},
                columnSizing: parsed.columnSizing || {},
                sorting: parsed.sorting || [],
            };
        } catch {
            return {
                columnOrder: DEFAULT_COLUMN_ORDER,
                columnVisibility: {},
                columnSizing: {},
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
    const [columnSizing, setColumnSizing] = useState(initialState.columnSizing);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null
    );
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        virtualElement: ReturnType<typeof createVirtualElement>;
        torrent: Torrent;
    } | null>(null);
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
        null
    );

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

    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                columnOrder,
                columnVisibility,
                columnSizing,
                sorting,
            })
        );
    }, [columnOrder, columnVisibility, columnSizing, sorting]);

    // --- COLUMNS ---
    // Memoized columns based ONLY on translation and stable definitions.
    // Dynamic data (sparklines) is accessed via meta.
    const columns = useMemo<ColumnDef<Torrent>[]>(() => {
        return Object.keys(COLUMN_DEFINITIONS).map((colId) => {
            const id = colId as ColumnId;
            const def = COLUMN_DEFINITIONS[id];

            if (id === "selection") {
                return {
                    id: "selection",
                    size: 40,
                    enableResizing: false,
                    enableSorting: false,
                    header: ({ table }) => (
                        <div className="flex justify-center items-center h-full w-full">
                            <Checkbox
                                size="sm"
                                isSelected={table.getIsAllPageRowsSelected()}
                                isIndeterminate={table.getIsSomePageRowsSelected()}
                                onValueChange={(val) =>
                                    table.toggleAllPageRowsSelected(!!val)
                                }
                                classNames={{ wrapper: "m-0" }}
                            />
                        </div>
                    ),
                    cell: ({ row }) => (
                        <Checkbox
                            size="sm"
                            isSelected={row.getIsSelected()}
                            onValueChange={(val) => row.toggleSelected(!!val)}
                            classNames={{ wrapper: "m-0" }}
                        />
                    ),
                } as ColumnDef<Torrent>;
            }
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
                        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-foreground/60">
                            <HeaderIcon
                                size={12}
                                strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                className="text-foreground/50 animate-pulse"
                            />
                            <span>{label}</span>
                        </div>
                    ) : (
                        label
                    );
                },
                size: def.width ?? 150,
                minSize: def.minSize ?? 80,
                meta: { align: def.align },
                cell: ({ row, table }) => {
                    return def.render({
                        torrent: row.original,
                        t,
                        isSelected: row.getIsSelected(),
                        toggleSelection: row.getToggleSelectedHandler(),
                        table, // Pass table to allow access to meta
                    });
                },
            } as ColumnDef<Torrent>;
        });
    }, [t]);

    // We pass dynamic data through meta to avoid column regeneration
    const tableMeta = useMemo<DashboardTableMeta>(
        () => ({
            speedHistory,
            optimisticStatuses,
        }),
        [speedHistory, optimisticStatuses]
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
        },
        meta: tableMeta,
        columnResizeMode: "onChange",
        enableSortingRemoval: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
        // CRITICAL FIX: Prevent selection clearing on poll
        autoResetRowSelection: false,
    });

    const { rows } = table.getRowModel();
    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => TABLE_LAYOUT.rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });

    const totalVirtualHeight = rowVirtualizer.getTotalSize();
    const markerHeightPercent =
        totalVirtualHeight > 0
            ? (TABLE_LAYOUT.rowHeight / totalVirtualHeight) * 100
            : 0;
    const heatmapMarkers = useMemo(
        () =>
            rows
                .map((row, index) => {
                    // Use optimistic status if present
                    const displayState = row.original.state;
                    const color =
                        displayState === "error" || row.original.error
                            ? "bg-danger/70"
                            : displayState === "seeding" ||
                              row.original.isFinished
                            ? "bg-success/70"
                            : null;
                    if (!color || totalVirtualHeight === 0) {
                        return null;
                    }
                    const topPercent =
                        (index * TABLE_LAYOUT.rowHeight) / totalVirtualHeight;
                    return {
                        key: row.id,
                        color,
                        topPercent: Math.min(
                            Math.max(topPercent * 100, 0),
                            100
                        ),
                    };
                })
                .filter(Boolean) as {
                key: string;
                color: string;
                topPercent: number;
            }[],
        [rows, totalVirtualHeight]
    );

    const selectAllRows = useCallback(() => {
        const allRows = table.getRowModel().rows;
        const nextSelection: RowSelectionState = {};
        allRows.forEach((row) => {
            nextSelection[row.id] = true;
        });
        setRowSelection(nextSelection);
        if (allRows.length) {
            const bottomIndex = allRows.length - 1;
            setLastSelectedIndex(bottomIndex);
            rowVirtualizer.scrollToIndex(bottomIndex);
        }
    }, [rowVirtualizer, table]);

    const selectedTorrents = useMemo(
        () => table.getSelectedRowModel().rows.map((row) => row.original),
        [table]
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
                setLastSelectedIndex(targetIndex);
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
                setLastSelectedIndex(normalizedEnd);
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
                    lastSelectedIndex ?? (delta === 1 ? -1 : allRows.length);
                const targetIndex = baseIndex + delta;
                if (shiftKey) {
                    const anchor = lastSelectedIndex ?? clampIndex(baseIndex);
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
                    const anchor = lastSelectedIndex ?? targetIndex;
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
                    const anchor = lastSelectedIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }
        },
        [lastSelectedIndex, rowVirtualizer, selectAllRows, table]
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
            setColumnOrder((order) => {
                const oldIndex = order.indexOf(active.id as string);
                const newIndex = order.indexOf(over.id as string);
                return arrayMove(order, oldIndex, newIndex);
            });
        }
    };

    // --- EVENTS ---
    const handleRowClick = useCallback(
        (e: React.MouseEvent, rowId: string, originalIndex: number) => {
            const target = e.target as HTMLElement;
            if (
                target.closest("button") ||
                target.closest("label") ||
                target.closest("[data-no-select]")
            )
                return;

            const selectionTarget = target.closest(
                "[data-selection-cell='true']"
            );
            const isMultiSelect = e.ctrlKey || e.metaKey;
            const isRangeSelect = e.shiftKey;

            if (selectionTarget || isMultiSelect) {
                table.getRow(rowId).toggleSelected();
                setLastSelectedIndex(originalIndex);
                setHighlightedRowId(rowId);
                return;
            }

            if (isRangeSelect && lastSelectedIndex !== null) {
                const allRows = table.getRowModel().rows;
                const actualLastIndex = Math.max(
                    0,
                    Math.min(allRows.length - 1, lastSelectedIndex)
                );
                const [start, end] =
                    actualLastIndex < originalIndex
                        ? [actualLastIndex, originalIndex]
                        : [originalIndex, actualLastIndex];
                const newSel: RowSelectionState = {};
                for (let i = start; i <= end; i++) {
                    const currentRow = allRows[i];
                    if (currentRow) newSel[currentRow.id] = true;
                }
                setRowSelection(newSel);
                setLastSelectedIndex(originalIndex);
                setHighlightedRowId(rowId);
                return;
            }

            setHighlightedRowId(rowId);
            setLastSelectedIndex(originalIndex);
        },
        [lastSelectedIndex, table]
    );

    const handleRowDoubleClick = useCallback(
        (torrent: Torrent) => {
            if (disableDetailOpen) return;
            onRequestDetails?.(torrent);
        },
        [disableDetailOpen, onRequestDetails]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, torrent: Torrent) => {
            e.preventDefault();
            const virtualElement = createVirtualElement(e.clientX, e.clientY);
            setContextMenu({ virtualElement, torrent });

            const allRows = table.getRowModel().rows;
            const row = allRows.find((r) => r.original.id === torrent.id);
            if (row && !rowSelection[row.id]) {
                setRowSelection({ [row.id]: true });
            }
        },
        [rowSelection, table]
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

    return (
        <>
            <div
                ref={tableContainerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onFocus={activateDashboardScope}
                onBlur={deactivateDashboardScope}
                className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-background/20 relative select-none outline-none"
                onClick={() => setContextMenu(null)}
            >
                {heatmapMarkers.length > 0 && (
                    <div className="pointer-events-none absolute top-0 right-1 h-full w-1 z-20">
                        {heatmapMarkers.map((marker) => (
                            <div
                                key={marker.key}
                                className={cn(
                                    "absolute right-0 w-full rounded-full shadow-[0_0_12px_rgba(0,0,0,0.3)]",
                                    marker.color
                                )}
                                style={{
                                    top: `${marker.topPercent}%`,
                                    height: `${markerHeightPercent}%`,
                                }}
                            />
                        ))}
                    </div>
                )}
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex w-full sticky top-0 z-30 border-b border-content1/20 shadow-sm bg-background/40 backdrop-blur-md">
                        <SortableContext
                            items={columnOrder}
                            strategy={horizontalListSortingStrategy}
                        >
                            {table.getHeaderGroups().map((headerGroup) => (
                                <div
                                    key={headerGroup.id}
                                    className="flex w-full min-w-max"
                                >
                                    {headerGroup.headers.map((header) => (
                                        <DraggableHeader
                                            key={header.id}
                                            header={header}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                openColumnModal(
                                                    e.currentTarget as HTMLElement
                                                );
                                            }}
                                        />
                                    ))}
                                </div>
                            ))}
                        </SortableContext>
                    </div>

                    <DragOverlay adjustScale={false} dropAnimation={null}>
                        {activeHeader ? (
                            <DraggableHeader header={activeHeader} isOverlay />
                        ) : null}
                    </DragOverlay>

                    <div
                        ref={parentRef}
                        className="flex-1 min-h-0 overflow-y-auto w-full overlay-scrollbar"
                    >
                        {isLoading && torrents.length === 0 ? (
                            <div className="w-full">
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center w-full border-b border-content1/5 px-4"
                                        style={{
                                            height: TABLE_LAYOUT.rowHeight,
                                        }}
                                    >
                                        <Skeleton className="h-4 w-full rounded-md bg-content1/10" />
                                    </div>
                                ))}
                            </div>
                        ) : torrents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-6 px-6 text-foreground/60">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.4em] text-foreground/60">
                                    <FileUp
                                        size={20}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-primary"
                                    />
                                    <span>
                                        {t("table.empty_hint", {
                                            shortcut: ADD_TORRENT_SHORTCUT,
                                        })}
                                    </span>
                                </div>
                                <p className="text-[10px] uppercase tracking-[0.25em] text-foreground/40">
                                    {t("table.empty_hint_subtext")}
                                </p>
                                <div className="w-full max-w-3xl space-y-2">
                                    <div className="grid grid-cols-[48px_minmax(0,1fr)_120px] gap-3 rounded-2xl border border-content1/20 bg-background/40 px-3 py-2 text-[10px] uppercase tracking-[0.4em] text-foreground/50">
                                        <span className="h-3 w-full rounded-full bg-content1/20" />
                                        <span>{t("table.header_name")}</span>
                                        <span>{t("table.header_speed")}</span>
                                    </div>
                                    {Array.from({ length: 3 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className="grid grid-cols-[48px_minmax(0,1fr)_120px] gap-3 rounded-2xl bg-content1/10 px-3 py-2"
                                            >
                                                <span className="h-3 w-full rounded-full bg-content1/20" />
                                                <span className="h-3 w-full rounded-full bg-content1/20" />
                                                <span className="h-3 w-full rounded-full bg-content1/20" />
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
                                            width: table.getTotalSize(),
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
                                                        virtualRow={virtualRow}
                                                        isSelected={row.getIsSelected()}
                                                        isContext={
                                                            contextMenu?.torrent
                                                                .id ===
                                                            row.original.id
                                                        }
                                                        onClick={handleRowClick}
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
                                                    />
                                                );
                                            })}
                                    </div>
                                </SortableContext>
                                <DragOverlay
                                    adjustScale={false}
                                    dropAnimation={null}
                                >
                                    {activeDragRow ? (
                                        <div
                                            style={{
                                                width: table.getTotalSize(),
                                                height: TABLE_LAYOUT.rowHeight,
                                            }}
                                            className="pointer-events-none border border-content1/20 bg-background/90 shadow-2xl backdrop-blur-3xl"
                                        >
                                            <div className="flex h-full w-full items-center">
                                                {renderVisibleCells(
                                                    activeDragRow
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
                        )}
                    </div>
                </DndContext>

                <AnimatePresence>
                    {contextMenu && (
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
                                variant="flat"
                                className={GLASS_MENU_SURFACE}
                                onAction={(key) => {
                                    const menuKey = key as
                                        | ContextMenuKey
                                        | undefined;
                                    if (menuKey === "cols") {
                                        const rowElement = findRowElement(
                                            contextMenu?.torrent.id
                                        );
                                        openColumnModal(rowElement ?? null);
                                    } else if (menuKey) {
                                        onAction?.(
                                            menuKey,
                                            contextMenu.torrent
                                        );
                                    }
                                    setContextMenu(null);
                                }}
                            >
                                <DropdownItem
                                    key="pause"
                                    shortcut={getContextMenuShortcut("pause")}
                                >
                                    {t("table.actions.pause")}
                                </DropdownItem>
                                <DropdownItem
                                    key="resume"
                                    shortcut={getContextMenuShortcut("resume")}
                                >
                                    {t("table.actions.resume")}
                                </DropdownItem>
                                <DropdownItem
                                    key="recheck"
                                    shortcut={getContextMenuShortcut("recheck")}
                                >
                                    {t("table.actions.recheck")}
                                </DropdownItem>
                                <DropdownItem
                                    key="remove"
                                    color="danger"
                                    shortcut={getContextMenuShortcut("remove")}
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
                                <DropdownItem
                                    key="queue-title"
                                    isDisabled
                                    className="border-t border-content1/20 mt-2 pt-2 px-4 text-[10px] font-bold uppercase tracking-[0.4em] text-foreground/50"
                                >
                                    {t("table.queue.title")}
                                </DropdownItem>
                                <>
                                    {queueMenuActions.map((action) => (
                                        <DropdownItem
                                            key={action.key}
                                            className="pl-10 text-sm"
                                            shortcut={getContextMenuShortcut(
                                                action.key as ContextMenuKey
                                            )}
                                        >
                                            {action.label}
                                        </DropdownItem>
                                    ))}
                                </>
                                <DropdownItem key="cols" showDivider>
                                    {t("table.column_picker_title")}
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    )}
                </AnimatePresence>
            </div>

            <Modal
                isOpen={isColumnModalOpen}
                onOpenChange={handleColumnModalOpenChange}
                size="lg"
                backdrop="blur"
                motionProps={{
                    initial: { opacity: 0, scale: 0.98, y: 10 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    exit: { opacity: 0, scale: 0.98, y: 10 },
                    transition: INTERACTION_CONFIG.modalBloom.transition,
                }}
                classNames={{
                    base: "glass-panel bg-content1/80 backdrop-blur-2xl border border-content1/20 shadow-2xl rounded-2xl flex flex-col overflow-hidden",
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
                                    const id = column.id as ColumnId;
                                    if (id === "selection") return null;
                                    return (
                                        <div
                                            key={column.id}
                                            className="flex justify-between p-2"
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
