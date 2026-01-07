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
import { useMeasuredColumnWidths } from "./TorrentTable_ColumnMeasurement";
import { useMarqueeSelection } from "../hooks/useMarqueeSelection";
import { useColumnResizing } from "../hooks/useColumnResizing";
import { useTorrentTableColumns } from "@/modules/dashboard/hooks/useTorrentTableColumns";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import { useTorrentTablePersistence } from "@/modules/dashboard/hooks/useTorrentTablePersistence";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import { useTorrentTableHeaderContext } from "@/modules/dashboard/hooks/useTorrentTableHeaderContext";
import { useTorrentTableInteractions } from "@/modules/dashboard/hooks/useTorrentTableInteractions";
import TorrentTable_Header from "./TorrentTable_Header";
import TorrentTable_Row from "./TorrentTable_Row";
import TorrentTable_RowMenu from "./TorrentTable_RowMenu";
import TorrentTable_HeaderMenu from "./TorrentTable_HeaderMenu";
import { useTorrentRowDrag } from "@/modules/dashboard/hooks/useTorrentRowDrag";
import { useTorrentTableKeyboard } from "@/modules/dashboard/hooks/useTorrentTableKeyboard";
import { useTorrentTableVirtualization } from "@/modules/dashboard/hooks/useTorrentTableVirtualization";
import TorrentTable_Body from "./TorrentTable_Body";
import TorrentTable_Headers, {
    ColumnHeaderPreview,
} from "./TorrentTable_Headers";
import TorrentTable_ColumnSettingsModal from "./TorrentTable_ColumnSettingsModal";

// Small helpers / stubs added during wiring to restore behavior
const formatShortcutLabel = (value?: string | string[]) =>
    Array.isArray(value) ? value.join(" / ") : value ?? "";

type ContextMenuKey = string;

const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";

const normalizeColumnSizingState = (s?: Record<string, number>) => {
    if (!s) return {};
    const out: Record<string, number> = {};
    for (const k in s) {
        const v = Number(s[k]);
        if (Number.isFinite(v)) out[k] = Math.max(1, Math.round(v));
    }
    return out;
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

// ColumnHeaderPreview extracted to TorrentTable_Headers.tsx

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
    // Wiring state required by the extracted hooks/components
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [suppressLayoutAnimations, setSuppressLayoutAnimations] =
        useState<boolean>(false);
    const [pendingQueueOrder, setPendingQueueOrder] = useState<string[] | null>(
        null
    );
    const [isColumnOrderChanging, setIsColumnOrderChanging] =
        useState<boolean>(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null
    );
    const [contextMenu, setContextMenu] = useState<any>(null);
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);

    const [sorting, setSorting] = useState<any>([]);
    const [columnOrder, setColumnOrder] =
        useState<string[]>(DEFAULT_COLUMN_ORDER);
    const [columnVisibility, setColumnVisibility] = useState<any>({});
    const [rowSelection, setRowSelection] = useState<any>({});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>(
        {}
    );
    const [columnSizingInfo, setColumnSizingInfo] = useState<any>({
        isResizingColumn: false,
    });
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
    const AUTO_FIT_TOLERANCE_PX = 8;

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

    const { handleContextMenuAction } = useTorrentTableContextActions({
        contextMenu,
        findRowElement: (id: string) =>
            typeof document !== "undefined"
                ? (document.querySelector(
                      `[data-torrent-row="${id}"]`
                  ) as HTMLElement | null)
                : null,
        openColumnModal: (triggerElement?: HTMLElement | null) => {
            // store return focus target and open the modal
            focusReturnRef.current = triggerElement ?? null;
            setIsColumnModalOpen(true);
        },
        onOpenFolder,
        onSetLocation,
        copyToClipboard,
        buildMagnetLink,
        onAction,
        setContextMenu,
    });

    // Marquee `mousedown` and drag listeners moved to `useMarqueeSelection`.

    // Persistence: logic extracted to `useTorrentTablePersistence`.

    // --- COLUMNS ---
    // Columns and table meta are provided by a dedicated hook to keep
    // configuration separate from layout and events.
    const { columns, tableMeta } = useTorrentTableColumns({
        t,
        speedHistoryRef,
        optimisticStatuses,
    });

    const table = useReactTable({
        data: data,
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
    const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
    const rowsRef = useRef<Row<Torrent>[]>([]);
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);
    const rowSelectionRef = useRef<any>(rowSelection);
    useEffect(() => {
        rowSelectionRef.current = rowSelection;
    }, [rowSelection]);
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
    // Persistence: wire persistence hook to keep table layout in localStorage
    useTorrentTablePersistence(
        {
            columnOrder: DEFAULT_COLUMN_ORDER,
            columnVisibility: {},
            columnSizing: {},
            sorting: [],
        },
        columnOrder,
        columnVisibility,
        columnSizing,
        columnSizingInfo,
        sorting
    );
    const { clampContextMenuPosition, createVirtualElement } =
        useContextMenuPosition({
            defaultMargin: fileContextMenuMargin,
        });

    // Virtualization: extracted to a wiring-friendly hook
    const {
        rowVirtualizer,
        measurementRows,
        measurementHeaders,
        marqueeRect,
        marqueeClickBlockRef,
        isMarqueeDraggingRef,
        rowIds: virtualizationRowIds,
    } = useTorrentTableVirtualization({
        rows,
        parentRef,
        rowHeight,
        TABLE_LAYOUT,
        table,
        isAnyColumnResizing,
        measureColumnMinWidths,
        columnOrder,
        columnVisibility,
        sorting,
        measuredMinWidths,
        setColumnSizing,
        getMeasuredColumnMinWidth,
        normalizeColumnSizingState,
        AUTO_FIT_TOLERANCE_PX,
        rowsRef,
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setHighlightedRowId,
        rowSelectionRef,
    });

    const tableData = data;

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
    const isQueueSort = sorting.some((s: any) => s.id === "queue");
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

    const activeDragRow = activeRowId
        ? rowsById.get(activeRowId) ?? null
        : null;

    const {
        sensors,
        rowSensors,
        handleDragStart,
        handleDragEnd,
        handleDragCancel,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
        handleKeyDown,
    } = useTorrentTableInteractions({
        setActiveDragHeaderId,
        setColumnOrder,
        arrayMove,
        table,
        canReorderQueue,
        setSuppressLayoutAnimations,
        setActiveRowId,
        setDropTargetRowId,
        rowIds,
        rowsById,
        onAction,
        sorting,
        rows,
        setPendingQueueOrder,
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setHighlightedRowId,
        rowVirtualizer,
        selectAllRows,
        anchorIndex,
        focusIndex,
    });

    // extracted to TorrentTable_Interactions.tsx
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

    // header context/menu logic extracted to TorrentTable_HeaderContext.tsx

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

    // header context/menu computation extracted to TorrentTable_HeaderContext.tsx

    const headerContainerClass = cn(
        "flex w-full sticky top-0 z-20 border-b border-content1/20 bg-content1/10 backdrop-blur-sm "
    );
    const tableShellClass = cn(
        "relative flex-1 h-full min-h-0 flex flex-col overflow-hidden",
        "rounded-panel border border-default/10"
    );
    const [headerContextMenu, setHeaderContextMenu] = useState<{
        virtualElement: any;
        columnId: string | null;
    } | null>(null);

    const headerMenuTriggerRect = headerContextMenu
        ? headerContextMenu.virtualElement.getBoundingClientRect()
        : null;

    const {
        handleHeaderContextMenu,
        handleHeaderContainerContextMenu,
        headerMenuActiveColumn,
        handleHeaderMenuAction,
        headerMenuHideLabel,
        isHeaderMenuHideEnabled,
        headerMenuItems,
    } = useTorrentTableHeaderContext({
        createVirtualElement,
        fileContextMenuMargin,
        table,
        columnOrder,
        getColumnLabel,
        t,
        setHeaderContextMenu,
        headerContextMenu,
        columnVisibility,
    });
    const headerSortableIds = useMemo(
        () =>
            table
                .getAllLeafColumns()
                .filter((column) => column.getIsVisible())
                .map((column) => column.id),
        [columnOrder, columnVisibility, table]
    );

    // sensors/handlers are provided by `useTorrentTableInteractions`

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
                        <TorrentTable_Headers
                            headerContainerClass={headerContainerClass}
                            handleHeaderContainerContextMenu={
                                handleHeaderContainerContextMenu as any
                            }
                            headerSortableIds={headerSortableIds}
                            table={table}
                            getTableTotalWidthCss={getTableTotalWidthCss}
                            handleHeaderContextMenu={handleHeaderContextMenu}
                            handleColumnAutoFitRequest={
                                handleColumnAutoFitRequest
                            }
                            handleColumnResizeStart={
                                handleColumnResizeStart as any
                            }
                            columnSizingInfo={columnSizingInfo}
                            hookActiveResizeColumnId={hookActiveResizeColumnId}
                            isAnyColumnResizing={isAnyColumnResizing}
                        />

                        <TorrentTable_Body
                            parentRef={parentRef}
                            isLoading={isLoading}
                            torrents={torrents}
                            TABLE_LAYOUT={TABLE_LAYOUT}
                            t={t}
                            ADD_TORRENT_SHORTCUT={ADD_TORRENT_SHORTCUT}
                            rowSensors={rowSensors}
                            handleRowDragStart={handleRowDragStart}
                            handleRowDragEnd={handleRowDragEnd}
                            handleRowDragCancel={handleRowDragCancel}
                            rowIds={rowIds}
                            rowVirtualizer={rowVirtualizer}
                            rows={rows}
                            table={table}
                            renderVisibleCells={renderVisibleCells}
                            activeDragRow={activeDragRow}
                            renderOverlayPortal={renderOverlayPortal}
                            DND_OVERLAY_CLASSES={DND_OVERLAY_CLASSES}
                            contextMenu={contextMenu}
                            handleRowClick={handleRowClick}
                            handleRowDoubleClick={handleRowDoubleClick}
                            handleContextMenu={handleContextMenu}
                            canReorderQueue={canReorderQueue}
                            dropTargetRowId={dropTargetRowId}
                            activeRowId={activeRowId}
                            highlightedRowId={highlightedRowId}
                            handleDropTargetChange={handleDropTargetChange}
                            isAnyColumnResizing={isAnyColumnResizing}
                            columnOrder={columnOrder}
                            suppressLayoutAnimations={suppressLayoutAnimations}
                            isColumnOrderChanging={isColumnOrderChanging}
                            marqueeRect={marqueeRect}
                        />
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

                {renderOverlayPortal(
                    <TorrentTable_RowMenu
                        contextMenu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        handleContextMenuAction={handleContextMenuAction}
                        queueMenuActions={queueMenuActions}
                        getContextMenuShortcut={getContextMenuShortcut}
                        t={t}
                        onOpenFolder={onOpenFolder}
                        onSetLocation={onSetLocation as any}
                        isClipboardSupported={isClipboardSupported}
                        getEmphasisClassForAction={getEmphasisClassForAction}
                    />
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

            <TorrentTable_ColumnSettingsModal
                isOpen={isColumnModalOpen}
                onOpenChange={setIsColumnModalOpen}
                table={table}
            />
        </>
    );
}

// Module Augmentation for strict typing of 'align'
declare module "@tanstack/react-table" {
    interface ColumnMeta<TData, TValue> {
        align?: "start" | "center" | "end";
    }
}
