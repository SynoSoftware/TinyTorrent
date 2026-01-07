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
    type Cell,
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
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";
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
    TORRENTTABLE_COLUMN_DEFS,
    DEFAULT_COLUMN_ORDER,
    type ColumnId,
    type DashboardTableMeta,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
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
    HANDLE_HITAREA_CLASS,
    CELL_PADDING_CLASS,
    CELL_BASE_CLASS,
    TABLE_PERSIST_DEBOUNCE_MS,
    TABLE_HEADER_CLASS,
    HANDLE_PADDING_CLASS,
} from "@/config/logic";
import {
    TableHeaderContent,
    TableCellContent,
    getColumnWidthCss,
    MEASURE_LAYER_CLASS,
    MEASURE_HEADER_SELECTOR,
    MEASURE_CELL_SELECTOR,
    getColumnWidthVarName,
    TABLE_TOTAL_WIDTH_VAR,
    getTableTotalWidthCss,
    ColumnMeasurementLayer,
} from "./TorrentTable_Shared";
import { useMarqueeSelection } from "../hooks/useMarqueeSelection";
import { useColumnResizing } from "../hooks/useColumnResizing";
import { useTorrentTableColumns } from "@/modules/dashboard/hooks/useTorrentTableColumns";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import TorrentTable_Header from "./TorrentTable_Header";
import TorrentTable_Row from "./TorrentTable_Row";
import TorrentTable_RowMenu from "./TorrentTable_RowMenu";
import TorrentTable_HeaderMenu from "./TorrentTable_HeaderMenu";

// --- CONSTANTS ---
const STORAGE_KEY = "tiny-torrent.table-state.v2.8";

const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";

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
        if (!TORRENTTABLE_COLUMN_DEFS[id as ColumnId]) return;
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

// magnet prefix provided by config; use hook below

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
    onSetLocation?: (torrent: Torrent) => Promise<void> | void;
    ghostTorrents?: Torrent[];
}

// --- HELPERS ---

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
            <TableHeaderContent header={header} />
        </div>
    );
};

// Table header/cell presentation moved to TorrentTable.shared.tsx

const renderVisibleCells = (row: Row<Torrent>) =>
    row
        .getVisibleCells()
        .map((cell) => <TableCellContent key={cell.id} cell={cell} />);

// ColumnMeasurementLayer moved to TorrentTable_Shared.tsx

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
    onSetLocation,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(
        null
    );
    const speedHistoryRef = useTorrentSpeedHistory(torrents);

    const getDisplayTorrent = useCallback(
        (torrent: Torrent) => {
            const override = optimisticStatuses?.[torrent.id];
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
    }, [pooledTorrents, filter, searchQuery, getDisplayTorrent]);

    const parentRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const measureLayerRef = useRef<HTMLDivElement>(null);
    const focusReturnRef = useRef<HTMLElement | null>(null);

    // Marquee selection is handled by `useMarqueeSelection` below.

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

    const { isClipboardSupported, copyToClipboard, buildMagnetLink } =
        useTorrentClipboard();

    // Marquee `mousedown` and drag listeners moved to `useMarqueeSelection`.

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
            const allDefKeys = Object.keys(TORRENTTABLE_COLUMN_DEFS);
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
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [pendingQueueOrder, setPendingQueueOrder] = useState<string[] | null>(
        null
    );
    const tableData = useMemo(() => {
        if (!pendingQueueOrder) return data;
        const orderMap = new Map<string, number>();
        pendingQueueOrder.forEach((id, index) => orderMap.set(id, index));
        return [...data].sort((a, b) => {
            const firstIndex = orderMap.get(a.id);
            const secondIndex = orderMap.get(b.id);
            if (firstIndex === undefined && secondIndex === undefined) return 0;
            if (firstIndex === undefined) return 1;
            if (secondIndex === undefined) return -1;
            return firstIndex - secondIndex;
        });
    }, [data, pendingQueueOrder]);
    const [suppressLayoutAnimations, setSuppressLayoutAnimations] =
        useState<boolean>(false);
    const [isColumnOrderChanging, setIsColumnOrderChanging] = useState(false);
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
            } else if (key === "set-download-path") {
                if (onSetLocation) {
                    await onSetLocation(torrent);
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
            onSetLocation,
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

        if (columnSizingInfo.isResizingColumn) {
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
    // Columns and table meta are provided by a dedicated hook to keep
    // configuration separate from layout and events.
    const { columns, tableMeta } = useTorrentTableColumns({
        t,
        speedHistoryRef,
        optimisticStatuses,
    });

    const table = useReactTable({
        data: tableData,
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
            const definition = TORRENTTABLE_COLUMN_DEFS[column.id as ColumnId];
            const labelKey = definition?.labelKey;
            if (labelKey) {
                return t(labelKey);
            }
            return column.id;
        },
        [t]
    );
    const {
        activeResizeColumnId: hookActiveResizeColumnId,
        handleColumnResizeStart,
        resetColumnResizeState: hookResetColumnResizeState,
    } = useColumnResizing({
        table,
        setColumnSizing,
        setColumnSizingInfo,
        setColumnWidthVar,
        setTableTotalWidthVar,
    });

    const isAnyColumnResizing =
        Boolean(hookActiveResizeColumnId) ||
        Boolean(columnSizingInfo.isResizingColumn);

    const resetColumnResizeState = hookResetColumnResizeState;
    // `resetColumnResizeState` provided by `useColumnResizing` hook below.
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
            // Clamp computed width to the table/container width to avoid
            // expanding a single column past the visible area.
            const containerWidth =
                tableContainerRef.current?.getBoundingClientRect().width ??
                table.getTotalSize();
            const maxAllowed = Math.max(80, Math.round(containerWidth));
            const finalWidth = Math.min(computedWidth, maxAllowed);
            const currentWidth = column.getSize();
            if (Math.abs(finalWidth - currentWidth) <= AUTO_FIT_TOLERANCE_PX) {
                return false;
            }
            setColumnSizing((prev: Record<string, number>) =>
                normalizeColumnSizingState({
                    ...prev,
                    [column.id]: finalWidth,
                })
            );
            return true;
        },
        [
            measureColumnMinWidths,
            measuredMinWidthsRef,
            resetColumnResizeState,
            setColumnSizing,
            tableContainerRef,
            table,
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

    // Memoized list of row ids used by selection logic. Placed here so
    // the marquee mouse handlers (which are registered below) can capture
    // the up-to-date mapping of rows -> ids.
    const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

    const { marqueeRect, marqueeClickBlockRef, isMarqueeDraggingRef } =
        useMarqueeSelection({
            parentRef,
            rowHeight,
            rowsRef,
            rowIds,
            setRowSelection,
            setAnchorIndex,
            setFocusIndex,
            setHighlightedRowId,
            rowSelectionRef,
        });

    // Marquee move/up handling moved to `useMarqueeSelection`.

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

    // `rowIds` is declared earlier (above) so it can be captured by marquee handlers.
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
            setSuppressLayoutAnimations(false);
            setPendingQueueOrder(null);
        }
    }, [canReorderQueue]);

    useEffect(() => {
        if (!pendingQueueOrder) return;
        if (data.length !== pendingQueueOrder.length) return;
        for (let i = 0; i < data.length; i += 1) {
            if (data[i].id !== pendingQueueOrder[i]) {
                return;
            }
        }
        setPendingQueueOrder(null);
    }, [data, pendingQueueOrder]);

    useEffect(() => {
        if (pendingQueueOrder) return;
        if (!suppressLayoutAnimations) return;
        setSuppressLayoutAnimations(false);
    }, [pendingQueueOrder, suppressLayoutAnimations]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsColumnOrderChanging(true);
        const raf = window.requestAnimationFrame(() => {
            setIsColumnOrderChanging(false);
        });
        return () => {
            window.cancelAnimationFrame(raf);
        };
    }, [columnOrder]);

    const handleDropTargetChange = useCallback((id: string | null) => {
        setDropTargetRowId(id);
    }, []);

    const handleRowDragStart = useCallback(
        (event: DragStartEvent) => {
            if (!canReorderQueue) return;
            // Suppress layout animations while dragging to avoid
            // conflicting transforms between the virtualizer and
            // framer-motion's layout engine.
            setSuppressLayoutAnimations(true);
            setActiveRowId(event.active.id as string);
        },
        [canReorderQueue]
    );

    const handleRowDragEnd = useCallback(
        async (event: DragEndEvent) => {
            // Keep layout animations suppressed until the reorder
            // work (and any async queue RPCs) complete and the
            // virtualizer has settled positions.
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

            const nextOrder = arrayMove(rowIds, draggedIndex, targetIndex);
            setPendingQueueOrder(nextOrder);

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
        setPendingQueueOrder(null);
        setSuppressLayoutAnimations(false);
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
                    sensors={sensors}
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
                                            <TorrentTable_Header
                                                key={header.id}
                                                header={header}
                                                isAnyColumnResizing={
                                                    isAnyColumnResizing
                                                }
                                                onContextMenu={(
                                                    e: React.MouseEvent
                                                ) =>
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
                                                    hookActiveResizeColumnId ===
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
                                    {Array.from({ length: 10 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center w-full border-b border-content1/5 px-panel"
                                            style={{
                                                height: TABLE_LAYOUT.rowHeight,
                                            }}
                                        >
                                            <div className="w-full h-indicator">
                                                <Skeleton className="h-full w-full rounded-md bg-content1/10" />
                                            </div>
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
                                            className={TABLE_HEADER_CLASS}
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
                                    sensors={rowSensors}
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
                                                        <TorrentTable_Row
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
                                                            columnOrder={
                                                                columnOrder
                                                            }
                                                            suppressLayoutAnimations={
                                                                suppressLayoutAnimations ||
                                                                isColumnOrderChanging
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
                                        className={cn(
                                            contextMenu.torrent.errorEnvelope
                                                ?.primaryAction === "openFolder"
                                                ? getEmphasisClassForAction(
                                                      contextMenu.torrent
                                                          .errorEnvelope
                                                          ?.primaryAction
                                                  )
                                                : ""
                                        )}
                                    >
                                        {t("table.actions.open_folder")}
                                    </DropdownItem>
                                    <DropdownItem
                                        key="set-download-path"
                                        isDisabled={!onSetLocation}
                                        className={cn(
                                            contextMenu.torrent.errorEnvelope
                                                ?.primaryAction ===
                                                "setLocation"
                                                ? getEmphasisClassForAction(
                                                      contextMenu.torrent
                                                          .errorEnvelope
                                                          ?.primaryAction
                                                  )
                                                : ""
                                        )}
                                    >
                                        {t("table.actions.set_download_path")}
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
                        <TorrentTable_HeaderMenu
                            headerMenuTriggerRect={headerMenuTriggerRect}
                            onClose={() => setHeaderContextMenu(null)}
                            headerMenuActiveColumn={headerMenuActiveColumn}
                            headerMenuItems={headerMenuItems}
                            headerMenuHideLabel={headerMenuHideLabel}
                            isHeaderMenuHideEnabled={isHeaderMenuHideEnabled}
                            autoFitAllColumns={autoFitAllColumns}
                            handleHeaderMenuAction={handleHeaderMenuAction}
                        />
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
                                                    TORRENTTABLE_COLUMN_DEFS[id]
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
