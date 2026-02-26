import { arrayMove } from "@dnd-kit/sortable";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type Column, type ColumnSizingInfoState, type Row, type RowSelectionState, type SortingState } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { KEY_SCOPE, KEYMAP, ShortcutIntent, TABLE_LAYOUT } from "@/config/logic";
import type { TorrentTableViewModel } from "@/app/viewModels/useAppViewModel";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useTorrentTableColumns } from "@/modules/dashboard/hooks/useTorrentTableColumns";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import { useTorrentTablePersistence } from "@/modules/dashboard/hooks/useTorrentTablePersistence";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import { useTorrentTableHeaderContext } from "@/modules/dashboard/hooks/useTorrentTableHeaderContext";
import { useTorrentTableInteractions, type ColumnDragCommitOutcome } from "@/modules/dashboard/hooks/useTorrentTableInteractions";
import { useDetailOpenContext } from "@/modules/dashboard/context/DetailOpenContext";
import useTableAnimationGuard, { ANIMATION_SUPPRESSION_KEYS } from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useColumnSizingController } from "@/modules/dashboard/hooks/useColumnSizingController";
import { useTorrentTableVirtualization } from "@/modules/dashboard/hooks/useTorrentTableVirtualization";
import { useQueueReorderController } from "@/modules/dashboard/hooks/useQueueReorderController";
import { useRowSelectionController } from "@/modules/dashboard/hooks/useRowSelectionController";
import { useContextMenuPosition } from "@/shared/hooks/ui/useContextMenuPosition";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { TORRENTTABLE_COLUMN_DEFS, DEFAULT_COLUMN_ORDER, type ColumnId } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { useTorrentSpeedHistory } from "@/modules/dashboard/hooks/useTorrentSpeedHistory";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { DASHBOARD_FILTERS } from "@/modules/dashboard/types/dashboardFilter";
import type {
    HeaderContextMenu,
    QueueMenuAction,
    TableContextMenu,
    TorrentTableBodyViewModel,
    TorrentTableHeaderMenuViewModel,
    TorrentTableHeadersViewModel,
    TorrentTableRowMenuViewModel,
    TorrentTableSurfaces,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import { getTableTotalWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import STATUS from "@/shared/status";
import { scheduler } from "@/app/services/scheduler";
import { usePreferences } from "@/app/context/PreferencesContext";
import { TABLE } from "@/shared/ui/layout/glass-surface";

type TableVirtualizer = Virtualizer<HTMLDivElement, Element>;

type InteractionSensors = ReturnType<typeof useTorrentTableInteractions>;

const AUTO_FIT_TOLERANCE_PX = 8;
const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-dnd";

const formatShortcutLabel = (value?: string | string[]) => (Array.isArray(value) ? value.join(" / ") : (value ?? ""));

const ADD_TORRENT_SHORTCUT = formatShortcutLabel(["ctrl+o", "meta+o"]);

const CONTEXT_MENU_SHORTCUTS: Partial<Record<string, string | string[]>> = {
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

const getContextMenuShortcut = (action: string) => formatShortcutLabel(CONTEXT_MENU_SHORTCUTS[action]);

const renderVisibleCells = (row: Row<Torrent>) =>
    row.getVisibleCells().map((cell) => {
        return React.createElement(React.Fragment, { key: cell.id }, flexRender(cell.column.columnDef.cell, cell.getContext()));
    });

export interface TorrentTableParams {
    viewModel: TorrentTableViewModel;
}

export interface TorrentTableAPI {
    refs: {
        setTableContainerRef: (node: HTMLDivElement | null) => void;
        setMeasureLayerRef: (node: HTMLDivElement | null) => void;
    };
    state: {
        activeDragHeaderId: string | null;
        isAnimationSuppressed: boolean;
        isAnyColumnResizing: boolean;
    };
    table: {
        instance: ReturnType<typeof useReactTable<Torrent>>;
        measurementRows: Row<Torrent>[];
        measurementHeaders: ReturnType<ReturnType<typeof useReactTable<Torrent>>["getFlatHeaders"]>;
    };
    interaction: {
        sensors: InteractionSensors["sensors"];
        handleDragStart: InteractionSensors["handleDragStart"];
        handleDragEnd: InteractionSensors["handleDragEnd"];
        handleDragCancel: InteractionSensors["handleDragCancel"];
        handleKeyDown: InteractionSensors["handleKeyDown"];
    };
    menus: {
        closeContextMenu: () => void;
    };
    lifecycle: {
        activateScope: () => void;
        deactivateScope: () => void;
    };
    surfaces: TorrentTableSurfaces;
}

export function useTorrentTableViewModel({ viewModel }: TorrentTableParams): TorrentTableAPI {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const { preferences } = usePreferences();
    const overlayPortalHost = useMemo(() => (typeof document !== "undefined" && document.body ? document.body : null), []);
    const renderOverlayPortal = useCallback(
        (overlay: ReactNode) => {
            if (!overlayPortalHost) return null;
            return createPortal(overlay, overlayPortalHost);
        },
        [overlayPortalHost],
    );
    const { torrents, filter, searchQuery, optimisticStatuses = {}, ghostTorrents = [], removedIds } = viewModel;

    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [pendingQueueOrder, setPendingQueueOrder] = useState<string[] | null>(null);
    const [isColumnOrderChanging, setIsColumnOrderChanging] = useState<boolean>(false);
    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(null);
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<TableContextMenu | null>(null);
    const [headerContextMenu, setHeaderContextMenu] = useState<HeaderContextMenu | null>(null);
    const [sorting, setSorting] = useState<SortingState>(() => preferences.torrentTableState?.sorting ?? []);
    const [columnOrder, setColumnOrder] = useState<string[]>(() => preferences.torrentTableState?.columnOrder ?? DEFAULT_COLUMN_ORDER);
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => preferences.torrentTableState?.columnVisibility ?? {});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() => preferences.torrentTableState?.columnSizing ?? {});
    const [columnSizingInfo, setColumnSizingInfo] = useState<ColumnSizingInfoState>({
        startOffset: null,
        startSize: null,
        deltaOffset: null,
        deltaPercentage: null,
        isResizingColumn: false,
        columnSizingStart: [],
    });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const rowSelectionRef = useRef<RowSelectionState>(rowSelection);
    const parentRef = useRef<HTMLDivElement | null>(null);
    const tableContainerRef = useRef<HTMLDivElement | null>(null);
    const measureLayerRef = useRef<HTMLDivElement | null>(null);
    const rowVirtualizerRef = useRef<TableVirtualizer | null>(null);
    const rowsRef = useRef<Row<Torrent>[]>([]);
    const selectionBridgeRef = useRef<{
        getSelectionSnapshot: () => RowSelectionState;
        previewSelection: (selection: RowSelectionState) => void;
        commitSelection: (selection: RowSelectionState, focusIndex: number | null, focusRowId: string | null) => void;
        clearSelection: () => void;
    }>({
        getSelectionSnapshot: () => ({}),
        previewSelection: () => {},
        commitSelection: () => {},
        clearSelection: () => {},
    });

    const { rowHeight, fileContextMenuMargin } = useLayoutMetrics();
    const speedHistoryRef = useTorrentSpeedHistory(torrents);
    const { copyToClipboard, buildMagnetLink } = useTorrentClipboard();
    const { isSuppressed: animationSuppressionActive, begin: beginAnimationSuppression, end: endAnimationSuppression } = useTableAnimationGuard();
    const { disableDetailOpen = false, openDetail } = useDetailOpenContext();

    const getDisplayTorrent = useCallback(
        (torrent: Torrent) => {
            const override = optimisticStatuses[torrent.id];
            return override?.state
                ? { ...torrent, state: override.state }
                : torrent;
        },
        [optimisticStatuses],
    );

    const isRemoved = useCallback((id?: string | number | null) => Boolean(id && removedIds.has(String(id))), [removedIds]);

    const pooledTorrents = useMemo(() => (ghostTorrents.length > 0 ? [...ghostTorrents, ...torrents] : torrents), [ghostTorrents, torrents]);

    const data = useMemo(() => {
        const displayTorrents = pooledTorrents.filter((torrent) => !isRemoved(torrent.id ?? torrent.hash)).map(getDisplayTorrent);

        const filteredByState =
            filter === DASHBOARD_FILTERS.ALL
                ? displayTorrents
                : displayTorrents.filter(
                      (torrent) =>
                          torrent.isGhost || torrent.state === filter || (torrent.state === STATUS.torrent.CHECKING && (filter === STATUS.torrent.DOWNLOADING || filter === STATUS.torrent.SEEDING)),
                  );

        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return filteredByState;

        return filteredByState.filter((torrent) => {
            const haystack = `${torrent.name} ${torrent.ghostLabel ?? ""}`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [filter, getDisplayTorrent, isRemoved, pooledTorrents, searchQuery]);

    const { columns, tableMeta } = useTorrentTableColumns({
        t,
        speedHistoryRef,
        optimisticStatuses,
    });

    const serverOrder = useMemo(() => data.map((torrent) => torrent.id), [data]);
    const effectiveOrder = useMemo(() => pendingQueueOrder ?? serverOrder, [pendingQueueOrder, serverOrder]);

    const tableData = useMemo(() => {
        const byId = new Map(data.map((torrent) => [torrent.id, torrent]));
        return effectiveOrder.map((id) => byId.get(id)).filter((torrent): torrent is Torrent => Boolean(torrent));
    }, [data, effectiveOrder]);

    // eslint-disable-next-line react-hooks/incompatible-library
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
        manualSorting: pendingQueueOrder !== null,
        columnResizeMode: "onChange",
        enableColumnResizing: true,
        enableSortingRemoval: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        onColumnSizingInfoChange: setColumnSizingInfo,
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
        autoResetAll: false,
    });

    const rows = table.getRowModel().rows;
    const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

    const rowsById = useMemo(() => {
        const map = new Map<string, Row<Torrent>>();
        rows.forEach((row) => {
            map.set(row.id, row);
        });
        return map;
    }, [rows]);

    const {
        measuredMinWidths,
        measureColumnMinWidths,
        getMeasuredColumnMinWidth,
        autoFitAllColumns,
        handleColumnAutoFitRequest,
        handleColumnResizeStart,
        hookActiveResizeColumnId,
        isAnyColumnResizing,
        normalizeColumnSizingState,
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

    useTorrentTablePersistence({
        initialState: {
            columnOrder: DEFAULT_COLUMN_ORDER,
            columnVisibility: {},
            columnSizing: {},
            sorting: [],
        },
        columnOrder,
        columnVisibility,
        columnSizing,
        isColumnResizing: Boolean(columnSizingInfo.isResizingColumn),
        sorting,
    });

    const { createVirtualElement } = useContextMenuPosition({
        defaultMargin: fileContextMenuMargin,
    });

    const { rowVirtualizer, measurementRows, measurementHeaders, marqueeRect, marqueeClickBlockRef, isMarqueeDraggingRef } = useTorrentTableVirtualization({
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
        getSelectionSnapshot: () => selectionBridgeRef.current.getSelectionSnapshot(),
        previewSelection: (selection) => selectionBridgeRef.current.previewSelection(selection),
        commitSelection: (selection, nextFocusIndex, focusRowId) => selectionBridgeRef.current.commitSelection(selection, nextFocusIndex, focusRowId),
        clearSelection: () => selectionBridgeRef.current.clearSelection(),
    });

    rowVirtualizerRef.current = rowVirtualizer;

    const selection = useRowSelectionController({
        table,
        rows,
        rowIds,
        rowVirtualizerRef,
        isMarqueeDraggingRef,
        marqueeClickBlockRef,
        rowSelectionRef,
        rowSelection,
        setRowSelection,
        anchorIndex,
        setAnchorIndex,
        focusIndex,
        setFocusIndex,
        highlightedRowId,
        setHighlightedRowId,
    });

    selectionBridgeRef.current = {
        getSelectionSnapshot: selection.getSelectionSnapshot,
        previewSelection: selection.previewSelection,
        commitSelection: selection.commitSelection,
        clearSelection: selection.clearSelection,
    };

    const { handleContextMenuAction } = useTorrentTableContextActions({
        contextMenu,
        copyToClipboard,
        buildMagnetLink,
        setContextMenu,
        selectedTorrents: selection.selectedTorrents,
    });

    const { activate: activateScope, deactivate: deactivateScope } = useKeyboardScope(KEY_SCOPE.Dashboard);

    const {
        canReorderQueue,
        handleRowDragStart: queueHandleRowDragStart,
        handleRowDragEnd: queueHandleRowDragEnd,
        handleRowDragCancel: queueHandleRowDragCancel,
    } = useQueueReorderController({
        sorting,
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

    const commitColumnDragOrder = useCallback(
        (activeColumnId: string, overColumnId: string): ColumnDragCommitOutcome => {
            const oldIndex = columnOrder.indexOf(activeColumnId);
            const newIndex = columnOrder.indexOf(overColumnId);
            if (oldIndex < 0 || newIndex < 0) {
                return { status: "rejected", reason: "invalid_index" };
            }
            const nextOrder = arrayMove(columnOrder, oldIndex, newIndex);
            try {
                setColumnOrder(nextOrder);
                return { status: "applied" };
            } catch {
                // Reconcile local state on commit failure to avoid table/UI drift.
                setColumnOrder(columnOrder);
                return { status: "failed", reason: "commit_failed" };
            }
        },
        [columnOrder, setColumnOrder],
    );

    const handleColumnDragCommit = useCallback(
        (outcome: ColumnDragCommitOutcome) => {
            if (outcome.status !== "failed") return;
            showFeedback(t("toolbar.feedback.failed"), "danger");
        },
        [showFeedback, t],
    );

    const interactions = useTorrentTableInteractions({
        setActiveDragHeaderId,
        commitColumnDragOrder,
        onColumnDragCommit: handleColumnDragCommit,
        table,
        canReorderQueue,
        beginAnimationSuppression,
        endAnimationSuppression,
        setActiveRowId,
        setDropTargetRowId,
        rowIds,
        rowsById,
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
            openDetail?.(torrent, "docked");
        },
        [disableDetailOpen, openDetail],
    );

    const handleContextMenu = useCallback(
        (event: React.MouseEvent, torrent: Torrent) => {
            event.preventDefault();
            if (torrent.isGhost) return;

            const virtualElement = createVirtualElement(event.clientX, event.clientY, { margin: fileContextMenuMargin });
            setContextMenu({ virtualElement, torrent });

            const row = table.getRowModel().rows.find((candidate) => candidate.original.id === torrent.id);
            if (!row) return;
            selection.ensureContextSelection(row.id, row.index, rowSelection);
        },
        [createVirtualElement, fileContextMenuMargin, rowSelection, selection, table],
    );

    const getColumnLabel = useCallback(
        (column: Column<Torrent>) => {
            const definition = TORRENTTABLE_COLUMN_DEFS[column.id as ColumnId];
            return definition?.labelKey ? t(definition.labelKey) : column.id;
        },
        [t],
    );

    const { handleHeaderContextMenu, handleHeaderContainerContextMenu, headerMenuActiveColumn, handleHeaderMenuAction, headerMenuHideLabel, isHeaderMenuHideEnabled, headerMenuItems } =
        useTorrentTableHeaderContext({
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

    const headerSortableIds = useMemo(() => table.getVisibleLeafColumns().map((column) => column.id), [table]);

    const queueMenuActions = useMemo<QueueMenuAction[]>(
        () => [
            { key: "queue-move-top", label: t("table.queue.move_top") },
            { key: "queue-move-up", label: t("table.queue.move_up") },
            { key: "queue-move-down", label: t("table.queue.move_down") },
            { key: "queue-move-bottom", label: t("table.queue.move_bottom") },
        ],
        [t],
    );

    useEffect(() => {
        const resizeTimerRef: { current: (() => void) | null } = {
            current: null,
        };
        const element = tableContainerRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => {
            if (resizeTimerRef.current !== null) {
                resizeTimerRef.current();
            }
            beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
            resizeTimerRef.current = scheduler.scheduleTimeout(() => {
                endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
                resizeTimerRef.current = null;
            }, 150);
        });

        observer.observe(element);
        return () => {
            observer.disconnect();
            if (resizeTimerRef.current !== null) {
                resizeTimerRef.current();
            }
            endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
        };
    }, [beginAnimationSuppression, endAnimationSuppression]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsColumnOrderChanging(true);
        const requestId = window.requestAnimationFrame(() => {
            setIsColumnOrderChanging(false);
        });
        return () => {
            window.cancelAnimationFrame(requestId);
        };
    }, [columnOrder]);

    useEffect(() => {
        if (!contextMenu) return;
        const exists = torrents.some((torrent) => torrent.id === contextMenu.torrent.id);
        if (!exists) {
            setContextMenu(null);
        }
    }, [contextMenu, torrents]);

    const isAnimationSuppressed = isAnyColumnResizing || animationSuppressionActive;

    const headerMenuTriggerRect = headerContextMenu ? headerContextMenu.virtualElement.getBoundingClientRect() : null;

    const handleDropTargetChange = useCallback((id: string | null) => {
        setDropTargetRowId(id);
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const closeHeaderMenu = useCallback(() => {
        setHeaderContextMenu(null);
    }, []);
    const setTableContainerRef = useCallback((node: HTMLDivElement | null) => {
        tableContainerRef.current = node;
    }, []);
    const setMeasureLayerRef = useCallback((node: HTMLDivElement | null) => {
        measureLayerRef.current = node;
    }, []);
    const refBindings = useMemo(
        () => ({
            setTableContainerRef,
            setMeasureLayerRef,
        }),
        [setMeasureLayerRef, setTableContainerRef],
    );
    useEffect(() => {
        tableContainerRef.current?.focus();
    }, []);
    const headerContainerClass = TABLE.header;
    const activeDragRow = useMemo(() => (activeRowId ? (rowsById.get(activeRowId) ?? null) : null), [activeRowId, rowsById]);
    const headersViewModel = useMemo<TorrentTableHeadersViewModel>(
        () => ({
            headerContainerClass,
            handlers: {
                handleHeaderContainerContextMenu,
                handleHeaderContextMenu,
                handleColumnAutoFitRequest,
                handleColumnResizeStart,
            },
            table: {
                headerSortableIds,
                tableApi: table,
                getTableTotalWidthCss,
            },
            state: {
                columnSizingInfo,
                hookActiveResizeColumnId,
                isAnimationSuppressed,
            },
        }),
        [
            headerContainerClass,
            handleHeaderContainerContextMenu,
            handleHeaderContextMenu,
            handleColumnAutoFitRequest,
            handleColumnResizeStart,
            headerSortableIds,
            table,
            columnSizingInfo,
            hookActiveResizeColumnId,
            isAnimationSuppressed,
        ],
    );
    const bodyViewModel = useMemo<TorrentTableBodyViewModel>(
        () => ({
            refs: {
                parentRef,
            },
            data: {
                isLoading: viewModel.isLoading,
                hasSourceTorrents: viewModel.torrents.length > 0,
                visibleRowCount: rows.length,
                tableLayout: TABLE_LAYOUT,
                rowHeight,
                marqueeRect,
            },
            labels: {
                emptyHint: t("table.empty_hint", {
                    shortcut: ADD_TORRENT_SHORTCUT,
                }),
                emptyHintSubtext: t("table.empty_hint_subtext"),
                noResults: t("table.no_results"),
                headerName: t("table.header_name"),
                headerSpeed: t("table.header_speed"),
            },
            dnd: {
                rowSensors: interactions.rowSensors,
                handleRowDragStart: interactions.handleRowDragStart,
                handleRowDragEnd: interactions.handleRowDragEnd,
                handleRowDragCancel: interactions.handleRowDragCancel,
                renderOverlayPortal,
                overlayClassName: DND_OVERLAY_CLASSES,
            },
            table: {
                rowIds,
                rowVirtualizer,
                rows,
                tableApi: table,
                renderVisibleCells,
                activeDragRow,
            },
            rowInteraction: {
                contextMenuTorrentId: contextMenu?.torrent.id ?? null,
                onRowClick: selection.handleRowClick,
                onRowDoubleClick: handleRowDoubleClick,
                onRowContextMenu: handleContextMenu,
                onDropTargetChange: handleDropTargetChange,
            },
            state: {
                canReorderQueue,
                dropTargetRowId,
                activeRowId,
                highlightedRowId,
                isAnyColumnResizing,
                columnOrder,
                isAnimationSuppressed,
                isColumnOrderChanging,
            },
        }),
        [
            parentRef,
            viewModel.isLoading,
            viewModel.torrents,
            rowHeight,
            marqueeRect,
            t,
            interactions.rowSensors,
            interactions.handleRowDragStart,
            interactions.handleRowDragEnd,
            interactions.handleRowDragCancel,
            renderOverlayPortal,
            rowIds,
            rowVirtualizer,
            rows,
            table,
            activeDragRow,
            contextMenu?.torrent.id,
            selection.handleRowClick,
            handleRowDoubleClick,
            handleContextMenu,
            handleDropTargetChange,
            canReorderQueue,
            dropTargetRowId,
            activeRowId,
            highlightedRowId,
            isAnyColumnResizing,
            columnOrder,
            isAnimationSuppressed,
            isColumnOrderChanging,
        ],
    );
    const rowMenuViewModel = useMemo<TorrentTableRowMenuViewModel>(
        () => ({
            contextMenu,
            onClose: closeContextMenu,
            handleContextMenuAction,
            queueMenuActions,
            getContextMenuShortcut,
        }),
        [contextMenu, closeContextMenu, handleContextMenuAction, queueMenuActions],
    );
    const headerMenuViewModel = useMemo<TorrentTableHeaderMenuViewModel>(
        () => ({
            headerMenuTriggerRect,
            onClose: closeHeaderMenu,
            headerMenuActiveColumn,
            headerMenuItems,
            headerMenuHideLabel,
            isHeaderMenuHideEnabled,
            autoFitAllColumns,
            handleHeaderMenuAction,
        }),
        [
            headerMenuTriggerRect,
            closeHeaderMenu,
            headerMenuActiveColumn,
            headerMenuItems,
            headerMenuHideLabel,
            isHeaderMenuHideEnabled,
            autoFitAllColumns,
            handleHeaderMenuAction,
        ],
    );

    return {
        refs: refBindings,
        state: {
            activeDragHeaderId,
            isAnimationSuppressed,
            isAnyColumnResizing,
        },
        table: {
            instance: table,
            measurementRows,
            measurementHeaders,
        },
        interaction: {
            sensors: interactions.sensors,
            handleDragStart: interactions.handleDragStart,
            handleDragEnd: interactions.handleDragEnd,
            handleDragCancel: interactions.handleDragCancel,
            handleKeyDown: interactions.handleKeyDown,
        },
        menus: {
            closeContextMenu,
        },
        lifecycle: {
            activateScope,
            deactivateScope,
        },
        surfaces: {
            renderOverlayPortal,
            headersViewModel,
            bodyViewModel,
            rowMenuViewModel,
            headerMenuViewModel,
        },
    };
}

export default useTorrentTableViewModel;
