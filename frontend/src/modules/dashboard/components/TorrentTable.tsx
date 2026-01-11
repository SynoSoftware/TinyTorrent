// All imports use '@/...' aliases. Clipboard logic and magic numbers flagged for follow-up refactor.

import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type Column,
    type ColumnSizingInfoState,
    type Row,
    type RowSelectionState,
    type SortingState,
} from "@tanstack/react-table";
import { cn } from "@heroui/react";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";

import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { Torrent } from "@/modules/dashboard/types/torrent";

import { BLOCK_SHADOW } from "@/shared/ui/layout/glass-surface";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
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
    KEY_SCOPE,
    KEYMAP,
    ShortcutIntent,
} from "@/config/logic";
import {
    TableCellContent,
    getTableTotalWidthCss,
    ColumnMeasurementLayer,
} from "./TorrentTable_Shared";
import { createColumnSizingInfoState } from "./TorrentTable_ColumnMeasurement";
import { useTorrentTableColumns } from "@/modules/dashboard/hooks/useTorrentTableColumns";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import { useTorrentTablePersistence } from "@/modules/dashboard/hooks/useTorrentTablePersistence";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import { useTorrentTableHeaderContext } from "@/modules/dashboard/hooks/useTorrentTableHeaderContext";
import { useTorrentTableInteractions } from "@/modules/dashboard/hooks/useTorrentTableInteractions";
import useTableAnimationGuard, {
    ANIMATION_SUPPRESSION_KEYS,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useColumnSizingController } from "@/modules/dashboard/hooks/useColumnSizingController";
import TorrentTable_RowMenu from "./TorrentTable_RowMenu";
import TorrentTable_HeaderMenu from "./TorrentTable_HeaderMenu";
import { useTorrentTableVirtualization } from "@/modules/dashboard/hooks/useTorrentTableVirtualization";
import TorrentTable_Body from "./TorrentTable_Body";
import {
    TorrentTable_Headers,
    ColumnHeaderPreview,
} from "./TorrentTable_Headers";
import TorrentTable_ColumnSettingsModal from "./TorrentTable_ColumnSettingsModal";
import { useQueueReorderController } from "@/modules/dashboard/hooks/useQueueReorderController";
import { useRowSelectionController } from "@/modules/dashboard/hooks/useRowSelectionController";

const assertDev = (condition: boolean, message: string) => {
    if (import.meta.env.DEV && !condition) {
        throw new Error(message);
    }
};

// Small helpers / stubs added during wiring to restore behavior
const formatShortcutLabel = (value?: string | string[]) =>
    Array.isArray(value) ? value.join(" / ") : value ?? "";

type ContextMenuKey = string;

const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";

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
    handleBulkAction?: (action: TorrentTableAction) => Promise<void>;
    onRequestDetails?: (torrent: Torrent) => void;
    onRequestDetailsFullscreen?: (torrent: Torrent) => void;
    onSelectionChange?: (selection: Torrent[]) => void;
    onActiveRowChange?: (torrent: Torrent | null) => void;
    optimisticStatuses?: OptimisticStatusMap;
    disableDetailOpen?: boolean;
    onOpenFolder?: (torrent: Torrent) => Promise<void>;
    onSetLocation?: (torrent: Torrent) => Promise<void> | void;
    onRedownload?: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void> | void;
    ghostTorrents?: Torrent[];
    serverClass?: ServerClass;
    onRetry?: (torrent: Torrent) => Promise<void> | void;
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
    handleBulkAction,
    onRequestDetails,
    onRequestDetailsFullscreen,
    onSelectionChange,
    onActiveRowChange,
    optimisticStatuses = {},
    disableDetailOpen = false,
    ghostTorrents,
    serverClass,
    onOpenFolder,
    onSetLocation,
    onRedownload,
}: TorrentTableProps) {
    const { t } = useTranslation();
    // Wiring state required by the extracted hooks/components
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [pendingQueueOrder, setPendingQueueOrder] = useState<string[] | null>(
        null
    );
    const {
        isSuppressed: animationSuppressionActive,
        begin: beginAnimationSuppression,
        end: endAnimationSuppression,
    } = useTableAnimationGuard();
    const [isColumnOrderChanging, setIsColumnOrderChanging] =
        useState<boolean>(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null
    );
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(
        null
    );
    type TableContextMenu = {
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    };
    const [contextMenu, setContextMenu] = useState<TableContextMenu | null>(
        null
    );

    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] =
        useState<string[]>(DEFAULT_COLUMN_ORDER);
    const [columnVisibility, setColumnVisibility] = useState<
        Record<string, boolean>
    >({});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>(
        {}
    );
    const [columnSizingInfo, setColumnSizingInfo] =
        useState<ColumnSizingInfoState>(createColumnSizingInfoState());
    const handleColumnSizingChangeRef = useRef<
        | ((
              updater:
                  | Record<string, number>
                  | ((prev: Record<string, number>) => Record<string, number>)
          ) => void)
        | null
    >(null);
    const handleColumnSizingInfoChangeRef = useRef<
        | ((
              info:
                  | ColumnSizingInfoState
                  | ((info: ColumnSizingInfoState) => ColumnSizingInfoState)
          ) => void)
        | null
    >(null);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const rowSelectionRef = useRef<RowSelectionState>(rowSelection);
    const rowVirtualizerRef = useRef<any>(null);
    const selectionBridgeRef = useRef<{
        getSelectionSnapshot: () => RowSelectionState;
        previewSelection: (s: RowSelectionState) => void;
        commitSelection: (
            s: RowSelectionState,
            focusIndex: number | null,
            focusRowId: string | null
        ) => void;
        clearSelection: () => void;
    }>({
        getSelectionSnapshot: () => ({}),
        previewSelection: () => {},
        commitSelection: () => {},
        clearSelection: () => {},
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

    // Marquee selection is handled by the virtualization hook below.

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
        onRedownload,
        copyToClipboard,
        buildMagnetLink,
        onAction,
        setContextMenu,
    });

    // Marquee `mousedown` and drag listeners moved to the virtualization hook.

    // Persistence: logic extracted to `useTorrentTablePersistence`.

    // --- COLUMNS ---
    // Columns and table meta are provided by a dedicated hook to keep
    // configuration separate from layout and events.
    const { columns, tableMeta } = useTorrentTableColumns({
        t,
        speedHistoryRef,
        optimisticStatuses,
        onDownloadMissing: onRedownload,
        onChangeLocation: onSetLocation,
        onOpenFolder,
    });

    const serverOrder = useMemo(() => data.map((d) => d.id), [data]);
    const effectiveOrder = useMemo(
        () => pendingQueueOrder ?? serverOrder,
        [pendingQueueOrder, serverOrder]
    );

    // Rebuild table data in the exact order of `effectiveOrder` so React Table
    // receives a newly constructed array with the canonical ordering. Do not
    // sort the array in-place — mapping by id ensures a fresh array and stable
    // index identities.
    const tableData = useMemo(() => {
        if (!effectiveOrder) return data;
        const byId = new Map(data.map((t) => [t.id, t]));
        return effectiveOrder
            .map((id) => byId.get(id))
            .filter(Boolean) as typeof data;
    }, [data, effectiveOrder]);

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
        manualSorting: !!pendingQueueOrder,
        columnResizeMode: "onChange",
        enableColumnResizing: true,
        enableSortingRemoval: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: (updater) =>
            handleColumnSizingChangeRef.current?.(updater),
        onColumnSizingInfoChange: (info) =>
            handleColumnSizingInfoChangeRef.current?.(info),
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
        autoResetAll: false,
    });

    const { rows } = table.getRowModel();

    const rowsRef = useRef<Row<Torrent>[]>([]);
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);
    // Single ordering authority: rowIds always mirrors the current React Table
    // row model order. Do not derive rowIds from server order, pending order, or
    // any cached list, or DnD/virtualization will diverge.
    const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
    if (import.meta.env.DEV) {
        const modelIds = rows.map((row) => row.id);
        assertDev(
            rowIds.length === modelIds.length &&
                rowIds.every((id, idx) => id === modelIds[idx]),
            "TorrentTable invariant violated: rowIds must match React Table row order"
        );
    }
    const bridgeGetSelectionSnapshot = useCallback(
        () => selectionBridgeRef.current.getSelectionSnapshot(),
        []
    );
    const bridgePreviewSelection = useCallback(
        (s: RowSelectionState) =>
            selectionBridgeRef.current.previewSelection(s),
        []
    );
    const bridgeCommitSelection = useCallback(
        (
            s: RowSelectionState,
            focusIndex: number | null,
            focusRowId: string | null
        ) =>
            selectionBridgeRef.current.commitSelection(
                s,
                focusIndex,
                focusRowId
            ),
        []
    );
    const bridgeClearSelection = useCallback(
        () => selectionBridgeRef.current.clearSelection(),
        []
    );

    const {
        measuredMinWidths,
        measuredMinWidthsRef,
        measureColumnMinWidths,
        getMeasuredColumnMinWidth,
        autoFitColumn,
        autoFitAllColumns,
        handleColumnAutoFitRequest,
        handleColumnResizeStart,
        hookActiveResizeColumnId,
        isAnyColumnResizing,
        normalizeColumnSizingState,
        handleColumnSizingChange,
        handleColumnSizingInfoChange,
    } = useColumnSizingController({
        table,
        columnSizing,
        setColumnSizing,
        columnSizingInfo,
        setColumnSizingInfo,
        tableContainerRef,
        measureLayerRef,
        columnOrder,
        columnVisibility,
        autoFitTolerancePx: AUTO_FIT_TOLERANCE_PX,
        beginAnimationSuppression,
        endAnimationSuppression,
    });
    handleColumnSizingChangeRef.current = handleColumnSizingChange;
    handleColumnSizingInfoChangeRef.current = handleColumnSizingInfoChange;
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
    const isAnimationSuppressed =
        isAnyColumnResizing || animationSuppressionActive;
    const { rowHeight, fileContextMenuMargin } = useLayoutMetrics();

    // Temporarily suppress layout animations while the table container is being
    // resized by the surrounding panels (react-resizable-panels). We detect
    // container size changes with a ResizeObserver, set the global
    // layout suppression flag during active resize, and debounce
    // turning it off so animations remain disabled while the user is
    // actively dragging a handle.
    const resizeTimerRef = useRef<number | null>(null);

    useEffect(() => {
        const el = tableContainerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => {
            // Cancel any pending clear
            if (resizeTimerRef.current !== null) {
                window.clearTimeout(resizeTimerRef.current);
            }
            // Signal suppression while resizing
            beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
            resizeTimerRef.current = window.setTimeout(() => {
                endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
                resizeTimerRef.current = null;
            }, 150);
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            if (resizeTimerRef.current !== null) {
                window.clearTimeout(resizeTimerRef.current);
                resizeTimerRef.current = null;
            }
            endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
        };
    }, [beginAnimationSuppression, endAnimationSuppression]);

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
        getSelectionSnapshot: bridgeGetSelectionSnapshot,
        previewSelection: bridgePreviewSelection,
        commitSelection: bridgeCommitSelection,
        clearSelection: bridgeClearSelection,
    });
    rowVirtualizerRef.current = rowVirtualizer;

    const selection = useRowSelectionController({
        table,
        rows,
        rowIds,
        isMarqueeDraggingRef,
        marqueeClickBlockRef,
        rowSelection,
        setRowSelection,
        rowSelectionRef,
        anchorIndex,
        setAnchorIndex,
        focusIndex,
        setFocusIndex,
        highlightedRowId,
        setHighlightedRowId,
        rowVirtualizerRef,
        onSelectionChange,
        onActiveRowChange,
    });
    selectionBridgeRef.current = {
        getSelectionSnapshot: selection.getSelectionSnapshot,
        previewSelection: selection.previewSelection,
        commitSelection: selection.commitSelection,
        clearSelection: selection.clearSelection,
    };

    const {
        activate: activateDashboardScope,
        deactivate: deactivateDashboardScope,
    } = useKeyboardScope(KEY_SCOPE.Dashboard);

    useTorrentShortcuts({
        scope: KEY_SCOPE.Dashboard,
        selectedTorrents: selection.selectedTorrents,
        selectAll: selection.selectAllRows,
        onAction,
        onBulkAction: handleBulkAction,
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

    const {
        canReorderQueue,
        handleRowDragStart: queueHandleRowDragStart,
        handleRowDragEnd: queueHandleRowDragEnd,
        handleRowDragCancel: queueHandleRowDragCancel,
    } = useQueueReorderController({
        sorting,
        onAction,
        pendingQueueOrder,
        setPendingQueueOrder,
        rowIds,
        rowsById,
        rowsLength: rows.length,
        beginAnimationSuppression,
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
    });

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
        beginAnimationSuppression: beginAnimationSuppression,
        endAnimationSuppression: endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
        rowIds,
        rowsById,
        onAction,
        sorting,
        rows,
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setHighlightedRowId,
        rowVirtualizer,
        selectAllRows: selection.selectAllRows,
        anchorIndex: selection.anchorIndex,
        focusIndex: selection.focusIndex,
        handleRowDragStart: queueHandleRowDragStart,
        handleRowDragEnd: queueHandleRowDragEnd,
        handleRowDragCancel: queueHandleRowDragCancel,
    });

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
            selection.ensureContextSelection(row.id, row.index, rowSelection);
        },
        [rowSelection, selection, table]
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
        virtualElement: ContextMenuVirtualElement;
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
                data-tt-column-resizing={
                    isAnyColumnResizing ? "true" : undefined
                }
                data-tt-layout-suppressed={
                    isAnimationSuppressed ? "true" : undefined
                }
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
                                handleHeaderContainerContextMenu
                            }
                            headerSortableIds={headerSortableIds}
                            table={table}
                            getTableTotalWidthCss={getTableTotalWidthCss}
                            handleHeaderContextMenu={handleHeaderContextMenu}
                            handleColumnAutoFitRequest={
                                handleColumnAutoFitRequest
                            }
                            handleColumnResizeStart={handleColumnResizeStart}
                            columnSizingInfo={columnSizingInfo}
                            hookActiveResizeColumnId={hookActiveResizeColumnId}
                            isAnimationSuppressed={isAnimationSuppressed}
                        />

                        <TorrentTable_Body
                            parentRef={parentRef}
                            isLoading={isLoading}
                            torrents={torrents}
                            TABLE_LAYOUT={TABLE_LAYOUT}
                            rowHeight={rowHeight}
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
                            handleRowClick={selection.handleRowClick}
                            handleRowDoubleClick={handleRowDoubleClick}
                            handleContextMenu={handleContextMenu}
                            canReorderQueue={canReorderQueue}
                            dropTargetRowId={dropTargetRowId}
                            activeRowId={activeRowId}
                            highlightedRowId={highlightedRowId}
                            handleDropTargetChange={handleDropTargetChange}
                            isAnyColumnResizing={isAnyColumnResizing}
                            columnOrder={columnOrder}
                            isAnimationSuppressed={isAnimationSuppressed}
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
                                <ColumnHeaderPreview
                                    header={activeHeader}
                                    isAnimationSuppressed={
                                        isAnimationSuppressed
                                    }
                                />
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
                        onSetLocation={onSetLocation}
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
