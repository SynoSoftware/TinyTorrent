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
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ItemElement } from "@react-types/shared";

import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
    GLASS_MENU_SURFACE,
    GLASS_MODAL_SURFACE,
    PANEL_SHADOW,
} from "@/shared/ui/layout/glass-surface";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import type { TorrentStatus } from "@/services/rpc/entities";

import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    COLUMN_DEFINITIONS,
    DEFAULT_COLUMN_ORDER,
    type ColumnId,
    type DashboardTableMeta,
} from "@/modules/dashboard/components/ColumnDefinitions";
import { useTorrentShortcuts } from "@/modules/dashboard/hooks/useTorrentShortcuts";
import {
    TABLE_LAYOUT,
    INTERACTION_CONFIG,
    KEY_SCOPE,
    KEYMAP,
    ShortcutIntent,
    ICON_STROKE_WIDTH,
    ICON_STROKE_WIDTH_DENSE,
} from "@/config/logic";
import { CONFIG } from "@/config/logic";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.8";
const CELL_PADDING_CLASS = "pl-tight pr-panel";
const CELL_BASE_CLASSES =
    "flex items-center overflow-hidden h-full truncate box-border leading-none";
const DEFAULT_CONTEXT_MENU_MARGIN = 16;

const SPEED_HISTORY_LIMIT = 30;
const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";

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

type HeaderMenuItem =
    | {
          type: "column";
          column: Column<Torrent>;
          label: string;
      }
    | { type: "separator"; key: string };

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

const DEFAULT_MAGNET_PREFIX = CONFIG.defaults.magnet_protocol_prefix;

const getContextMenuShortcut = (action: ContextMenuKey) =>
    formatShortcutLabel(CONTEXT_MENU_SHORTCUTS[action]);

// Row height and other CSS-derived metrics are provided by `useLayoutMetrics`

export type OptimisticStatusEntry = {
    state: TorrentStatus;
    expiresAt: number;
};
export type OptimisticStatusMap = Record<string, OptimisticStatusEntry>;

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
    optimisticStatuses?: OptimisticStatusMap;
    disableDetailOpen?: boolean;
    onOpenFolder?: (torrent: Torrent) => Promise<void>;
    ghostTorrents?: Torrent[];
}

// --- HELPERS ---
const clampContextMenuPoint = (
    x: number,
    y: number,
    marginOverride?: number
) => {
    if (typeof window === "undefined") {
        return { x, y };
    }
    const margin =
        typeof marginOverride === "number"
            ? marginOverride
            : DEFAULT_CONTEXT_MENU_MARGIN;
    const maxX = Math.max(margin, window.innerWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - margin);
    return {
        x: Math.min(Math.max(x, margin), maxX),
        y: Math.min(Math.max(y, margin), maxY),
    };
};

interface VirtualElement {
    x: number;
    y: number;
    getBoundingClientRect: () => DOMRect;
}

const createVirtualElement = (
    x: number,
    y: number,
    marginOverride?: number
): VirtualElement => {
    const { x: boundedX, y: boundedY } = clampContextMenuPoint(
        x,
        y,
        marginOverride
    );
    return {
        x: boundedX,
        y: boundedY,
        getBoundingClientRect: () =>
            ({
                width: 0,
                height: 0,
                top: boundedY,
                right: boundedX,
                bottom: boundedY,
                left: boundedX,
                x: boundedX,
                y: boundedY,
                toJSON: () => {},
            } as DOMRect),
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
        const isSelection = header.id.toString() === "selection";
        const { iconSize: _iconSize } = useLayoutMetrics();

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
                >
                    {flexRender(column.columnDef.header, header.getContext())}
                    {sortState === "asc" && (
                        <ArrowUp
                            size={_iconSize}
                            strokeWidth={ICON_STROKE_WIDTH_DENSE}
                            className="text-primary shrink-0"
                        />
                    )}
                    {sortState === "desc" && (
                        <ArrowDown
                            size={_iconSize}
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
                                "w-(--bw) h-indicator bg-foreground/10 transition-colors rounded-full",
                                "group-hover:bg-primary/50",
                                column.getIsResizing() &&
                                    "bg-primary w-(--tt-divider-width) h-indicator"
                            )}
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
    const { iconSize: _iconSize } = useLayoutMetrics();
    return (
        <div
            className={cn(
                "relative flex h-row items-center border-r border-content1/10 bg-content1/90 px-(--p-tight) transition-all",
                PANEL_SHADOW
            )}
            style={{ width: column.getSize(), boxSizing: "border-box" }}
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
                {sortState === "asc" && (
                    <ArrowUp
                        size={_iconSize}
                        strokeWidth={ICON_STROKE_WIDTH_DENSE}
                        className="text-primary shrink-0"
                    />
                )}
                {sortState === "desc" && (
                    <ArrowDown
                        size={_iconSize}
                        strokeWidth={ICON_STROKE_WIDTH_DENSE}
                        className="text-primary shrink-0"
                    />
                )}
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
                    width: cell.column.getSize(),
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
                        "opacity-50 grayscale scale-98 z-50 cursor-grabbing"
                )}
                style={rowStyle}
                onClick={(e) => onClick(e, row.id, virtualRow.index)}
                onDoubleClick={() => onDoubleClick(row.original)}
                onContextMenu={(e) => onContextMenu(e, row.original)}
            >
                {/* INNER DIV: Handles all visuals. Separating layout from paint prevents glitching. */}
                <motion.div
                    layout
                    layoutId={`torrent-row-${row.id}`}
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
    optimisticStatuses = {},
    disableDetailOpen = false,
    ghostTorrents,
    onOpenFolder,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const { iconSize } = useLayoutMetrics();
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

    useEffect(() => {
        setSpeedHistory((prev) => {
            const next: Record<string, number[]> = { ...prev };
            const seenIds = new Set<string>();
            // We iterate over the raw torrents to maintain history
            torrents.forEach((torrent) => {
                seenIds.add(torrent.id);
                const history = next[torrent.id] ?? [];
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
            Object.keys(next).forEach((id) => {
                if (!seenIds.has(id)) {
                    delete next[id];
                }
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
            ).filter((id: string) => allDefKeys.includes(id));

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
    const rowSelectionRef = useRef<RowSelectionState>(rowSelection);
    useEffect(() => {
        rowSelectionRef.current = rowSelection;
    }, [rowSelection]);
    const rowsRef = useRef<Row<Torrent>[]>([]);

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
    const [headerContextMenu, setHeaderContextMenu] = useState<{
        virtualElement: ReturnType<typeof createVirtualElement>;
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

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(latestStateRef.current)
            );
            saveTimeoutRef.current = null;
        }, 250);
    }, [columnOrder, columnVisibility, columnSizing, sorting]);

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
        return Object.keys(COLUMN_DEFINITIONS).map((colId) => {
            const id = colId as ColumnId;
            const def = COLUMN_DEFINITIONS[id];
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
                                size={iconSize || 12}
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
        autoResetAll: false,
    });

    const { rows } = table.getRowModel();
    const { rowHeight, fileContextMenuMargin, fileContextMenuWidth } =
        useLayoutMetrics();

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });

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
            const virtualElement = createVirtualElement(
                e.clientX,
                e.clientY,
                fileContextMenuMargin
            );
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
                fileContextMenuMargin
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
    }, [headerContextMenu, table]);

    const headerMenuItems = useMemo<HeaderMenuItem[]>(() => {
        if (!headerContextMenu) return [];
        const columns = table
            .getAllLeafColumns()
            .filter((column) => column.id !== "selection");
        const getColumnLabel = (column: Column<Torrent>) =>
            t(COLUMN_DEFINITIONS[column.id as ColumnId]?.labelKey ?? column.id);
        const createColumnItem = (column: Column<Torrent>): HeaderMenuItem => ({
            type: "column",
            column,
            label: getColumnLabel(column),
        });
        const createSeparatorItem = (key: string): HeaderMenuItem => ({
            type: "separator",
            key,
        });
        const alphabetical = [...columns].sort((a, b) =>
            getColumnLabel(a).localeCompare(getColumnLabel(b))
        );
        if (!headerMenuActiveColumn) {
            return alphabetical.map(createColumnItem);
        }
        const others = alphabetical.filter(
            (column) => column.id !== headerMenuActiveColumn.id
        );
        return [
            createColumnItem(headerMenuActiveColumn),
            createSeparatorItem(`${headerMenuActiveColumn.id}-separator`),
            ...others.map(createColumnItem),
        ];
    }, [headerContextMenu, headerMenuActiveColumn, table, t]);

    const headerContainerClass = cn(
        "flex w-full sticky top-0 z-20 border-b border-content1/20 bg-content1/10 backdrop-blur-sm "
    );
    const tableShellClass = cn(
        "relative flex-1 h-full min-h-0 flex flex-col overflow-hidden"
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
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className={tableShellClass}>
                        <div
                            className={headerContainerClass}
                            onContextMenu={handleHeaderContainerContextMenu}
                        >
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
                                                onContextMenu={(e) =>
                                                    handleHeaderContextMenu(
                                                        e,
                                                        header.column.id
                                                    )
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
                                                        width: table.getTotalSize(),
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
                                    className={cn(
                                        GLASS_MENU_SURFACE,
                                        "min-w-(--tt-menu-min-width)"
                                    )}
                                >
                                    <DropdownItem
                                        key="hide-column"
                                        color="danger"
                                        isDisabled={!headerMenuActiveColumn}
                                        className="px-panel py-(--p-tight) text-scaled font-semibold"
                                        onPress={() =>
                                            headerMenuActiveColumn?.toggleVisibility(
                                                false
                                            )
                                        }
                                    >
                                        {t("table.actions.hide_column")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="header-divider"
                                        isReadOnly
                                        className=" "
                                    >
                                        <div className="border-t border-content1/20 my-tight mx-panel" />
                                    </DropdownItem>
                                    <DropdownSection
                                        key="columns-section"
                                        title={t("table.column_picker_title")}
                                    >
                                        {
                                            headerMenuItems.map((item) => {
                                                if (item.type === "separator") {
                                                    return (
                                                        <DropdownItem
                                                            key={item.key}
                                                            isReadOnly
                                                            className=" "
                                                        >
                                                            <div className="border-t border-content1/10 my-tight" />
                                                        </DropdownItem>
                                                    );
                                                }
                                                const isVisible =
                                                    item.column.getIsVisible();
                                                return (
                                                    <DropdownItem
                                                        key={item.column.id}
                                                        className="pl-stage text-scaled"
                                                        closeOnSelect={false}
                                                        onPress={() =>
                                                            item.column.toggleVisibility(
                                                                !isVisible
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
