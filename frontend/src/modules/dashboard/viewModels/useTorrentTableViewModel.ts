import { arrayMove } from "@dnd-kit/sortable";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type Column,
    type ColumnSizingInfoState,
    type Header,
    type Row,
    type RowSelectionState,
    type SortingState,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    KEY_SCOPE,
    KEYMAP,
    ShortcutIntent,
    TABLE_LAYOUT,
} from "@/config/logic";
import type { TorrentTableViewModel } from "@/app/viewModels/useAppViewModel";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useTorrentTableColumns } from "@/modules/dashboard/hooks/useTorrentTableColumns";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import { useTorrentClipboard } from "@/modules/dashboard/hooks/useTorrentClipboard";
import { useTorrentTablePersistence } from "@/modules/dashboard/hooks/useTorrentTablePersistence";
import { useTorrentTableContextActions } from "@/modules/dashboard/hooks/useTorrentTableContextActions";
import { useTorrentTableHeaderContext } from "@/modules/dashboard/hooks/useTorrentTableHeaderContext";
import { useTorrentTableInteractions } from "@/modules/dashboard/hooks/useTorrentTableInteractions";
import useTableAnimationGuard, {
    ANIMATION_SUPPRESSION_KEYS,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";
import { useColumnSizingController } from "@/modules/dashboard/hooks/useColumnSizingController";
import { useTorrentTableVirtualization } from "@/modules/dashboard/hooks/useTorrentTableVirtualization";
import { useQueueReorderController } from "@/modules/dashboard/hooks/useQueueReorderController";
import { useRowSelectionController } from "@/modules/dashboard/hooks/useRowSelectionController";
import { useContextMenuPosition } from "@/shared/hooks/ui/useContextMenuPosition";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import {
    TORRENTTABLE_COLUMN_DEFS,
    DEFAULT_COLUMN_ORDER,
    type ColumnId,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { useTorrentSpeedHistory } from "@/modules/dashboard/hooks/useTorrentSpeedHistory";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";

type TableVirtualizer = Virtualizer<HTMLDivElement, Element>;

type QueueMenuAction = {
    key: TorrentTableAction;
    label: string;
};

type TableContextMenu = {
    virtualElement: ContextMenuVirtualElement;
    torrent: Torrent;
};

type HeaderContextMenu = {
    virtualElement: ContextMenuVirtualElement;
    columnId: string | null;
};

type HeaderMenuActionOptions = {
    keepOpen?: boolean;
};

type HeaderMenuItem = {
    column: Column<Torrent>;
    label: string;
    isPinned: boolean;
};

type InteractionSensors = ReturnType<typeof useTorrentTableInteractions>;

const AUTO_FIT_TOLERANCE_PX = 8;

const formatShortcutLabel = (value?: string | string[]) =>
    Array.isArray(value) ? value.join(" / ") : (value ?? "");

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

const getContextMenuShortcut = (action: string) =>
    formatShortcutLabel(CONTEXT_MENU_SHORTCUTS[action]);

const renderVisibleCells = (row: Row<Torrent>) =>
    row.getVisibleCells().map((cell) => {
        return React.createElement(
            React.Fragment,
            { key: cell.id },
            flexRender(cell.column.columnDef.cell, cell.getContext()),
        );
    });

export interface UseTorrentTableViewModelParams {
    viewModel: TorrentTableViewModel;
    disableDetailOpen?: boolean;
    onRequestDetails?: (torrent: Torrent) => void;
    onRequestDetailsFullscreen?: (torrent: Torrent) => void;
}

export interface UseTorrentTableViewModelResult {
    refs: {
        parentRef: React.RefObject<HTMLDivElement | null>;
        tableContainerRef: React.RefObject<HTMLDivElement | null>;
        measureLayerRef: React.RefObject<HTMLDivElement | null>;
    };
    state: {
        columnOrder: string[];
        columnSizingInfo: ColumnSizingInfoState;
        contextMenu: TableContextMenu | null;
        headerContextMenu: HeaderContextMenu | null;
        isColumnModalOpen: boolean;
        isColumnOrderChanging: boolean;
        activeDragHeaderId: string | null;
        activeRowId: string | null;
        dropTargetRowId: string | null;
        highlightedRowId: string | null;
        isAnimationSuppressed: boolean;
        isAnyColumnResizing: boolean;
        canReorderQueue: boolean;
    };
    table: {
        instance: ReturnType<typeof useReactTable<Torrent>>;
        rows: Row<Torrent>[];
        rowIds: string[];
        rowVirtualizer: TableVirtualizer;
        measurementRows: Row<Torrent>[];
        measurementHeaders: Header<Torrent, unknown>[];
        marqueeRect: {
            left: number;
            top: number;
            width: number;
            height: number;
        } | null;
        renderVisibleCells: (row: Row<Torrent>) => React.ReactNode[];
        headerSortableIds: string[];
        rowsById: Map<string, Row<Torrent>>;
    };
    column: {
        handleColumnResizeStart: (
            column: Column<Torrent>,
            clientX: number,
        ) => void;
        handleColumnAutoFitRequest: (column: Column<Torrent>) => void;
        autoFitAllColumns: () => void;
        hookActiveResizeColumnId: string | null;
    };
    selection: {
        handleRowClick: (
            event: React.MouseEvent,
            rowId: string,
            index: number,
        ) => void;
    };
    interaction: {
        sensors: InteractionSensors["sensors"];
        rowSensors: InteractionSensors["rowSensors"];
        handleDragStart: InteractionSensors["handleDragStart"];
        handleDragEnd: InteractionSensors["handleDragEnd"];
        handleDragCancel: InteractionSensors["handleDragCancel"];
        handleRowDragStart: InteractionSensors["handleRowDragStart"];
        handleRowDragEnd: InteractionSensors["handleRowDragEnd"];
        handleRowDragCancel: InteractionSensors["handleRowDragCancel"];
        handleKeyDown: InteractionSensors["handleKeyDown"];
        handleRowDoubleClick: (torrent: Torrent) => void;
        handleContextMenu: (event: React.MouseEvent, torrent: Torrent) => void;
        handleDropTargetChange: (id: string | null) => void;
    };
    menus: {
        queueMenuActions: QueueMenuAction[];
        getContextMenuShortcut: (action: string) => string;
        isClipboardSupported: boolean | undefined;
        handleContextMenuAction: (key?: string) => Promise<void>;
        closeContextMenu: () => void;
        headerMenuTriggerRect: DOMRect | null;
        headerMenuActiveColumn: Column<Torrent> | null;
        headerMenuItems: HeaderMenuItem[];
        headerMenuHideLabel: string;
        isHeaderMenuHideEnabled: boolean;
        handleHeaderMenuAction: (
            action: () => void,
            options?: HeaderMenuActionOptions,
        ) => void;
        closeHeaderMenu: () => void;
        handleHeaderContextMenu: (
            event: React.MouseEvent,
            columnId: string | null,
        ) => void;
        handleHeaderContainerContextMenu: (
            event: React.MouseEvent<HTMLDivElement>,
        ) => void;
    };
    labels: {
        addTorrentShortcut: string;
    };
    layout: {
        rowHeight: number;
    };
    lifecycle: {
        activateScope: () => void;
        deactivateScope: () => void;
        setIsColumnModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    };
}

export function useTorrentTableViewModel({
    viewModel,
    disableDetailOpen = false,
    onRequestDetails,
    onRequestDetailsFullscreen,
}: UseTorrentTableViewModelParams): UseTorrentTableViewModelResult {
    const { t } = useTranslation();
    const {
        torrents,
        filter,
        searchQuery,
        optimisticStatuses = {},
        ghostTorrents = [],
        removedIds,
    } = viewModel;

    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [pendingQueueOrder, setPendingQueueOrder] = useState<string[] | null>(
        null,
    );
    const [isColumnOrderChanging, setIsColumnOrderChanging] =
        useState<boolean>(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
    const [activeDragHeaderId, setActiveDragHeaderId] = useState<string | null>(
        null,
    );
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState<number | null>(null);
    const [highlightedRowId, setHighlightedRowId] = useState<string | null>(
        null,
    );
    const [contextMenu, setContextMenu] = useState<TableContextMenu | null>(
        null,
    );
    const [headerContextMenu, setHeaderContextMenu] =
        useState<HeaderContextMenu | null>(null);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] =
        useState<string[]>(DEFAULT_COLUMN_ORDER);
    const [columnVisibility, setColumnVisibility] = useState<
        Record<string, boolean>
    >({});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>(
        {},
    );
    const [columnSizingInfo, setColumnSizingInfo] =
        useState<ColumnSizingInfoState>({
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
        commitSelection: (
            selection: RowSelectionState,
            focusIndex: number | null,
            focusRowId: string | null,
        ) => void;
        clearSelection: () => void;
    }>({
        getSelectionSnapshot: () => ({}),
        previewSelection: () => {},
        commitSelection: () => {},
        clearSelection: () => {},
    });

    const { rowHeight, fileContextMenuMargin } = useLayoutMetrics();
    const speedHistoryRef = useTorrentSpeedHistory(torrents);
    const openTorrentFolder = useOpenTorrentFolder();
    const { canOpenFolder } = useRecoveryContext();
    const { isClipboardSupported, copyToClipboard, buildMagnetLink } =
        useTorrentClipboard();
    const {
        isSuppressed: animationSuppressionActive,
        begin: beginAnimationSuppression,
        end: endAnimationSuppression,
    } = useTableAnimationGuard();

    const getDisplayTorrent = useCallback(
        (torrent: Torrent) => {
            const override = optimisticStatuses[torrent.id];
            return override ? { ...torrent, state: override.state } : torrent;
        },
        [optimisticStatuses],
    );

    const isRemoved = useCallback(
        (id?: string | number | null) =>
            Boolean(id && removedIds.has(String(id))),
        [removedIds],
    );

    const pooledTorrents = useMemo(
        () =>
            ghostTorrents.length > 0
                ? [...ghostTorrents, ...torrents]
                : torrents,
        [ghostTorrents, torrents],
    );

    const data = useMemo(() => {
        const displayTorrents = pooledTorrents
            .filter((torrent) => !isRemoved(torrent.id ?? torrent.hash))
            .map(getDisplayTorrent);

        const filteredByState =
            filter === "all"
                ? displayTorrents
                : displayTorrents.filter(
                      (torrent) => torrent.isGhost || torrent.state === filter,
                  );

        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return filteredByState;

        return filteredByState.filter((torrent) => {
            const haystack = `${torrent.name} ${
                torrent.ghostLabel ?? ""
            }`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [filter, getDisplayTorrent, isRemoved, pooledTorrents, searchQuery]);

    const { columns, tableMeta } = useTorrentTableColumns({
        t,
        speedHistoryRef,
        optimisticStatuses,
        openFolder: canOpenFolder ? openTorrentFolder : undefined,
    });

    const serverOrder = useMemo(
        () => data.map((torrent) => torrent.id),
        [data],
    );
    const effectiveOrder = useMemo(
        () => pendingQueueOrder ?? serverOrder,
        [pendingQueueOrder, serverOrder],
    );

    const tableData = useMemo(() => {
        const byId = new Map(data.map((torrent) => [torrent.id, torrent]));
        return effectiveOrder
            .map((id) => byId.get(id))
            .filter((torrent): torrent is Torrent => Boolean(torrent));
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
        Boolean(columnSizingInfo.isResizingColumn),
        sorting,
    );

    const { createVirtualElement } = useContextMenuPosition({
        defaultMargin: fileContextMenuMargin,
    });

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
        getSelectionSnapshot: () =>
            selectionBridgeRef.current.getSelectionSnapshot(),
        previewSelection: (selection) =>
            selectionBridgeRef.current.previewSelection(selection),
        commitSelection: (selection, nextFocusIndex, focusRowId) =>
            selectionBridgeRef.current.commitSelection(
                selection,
                nextFocusIndex,
                focusRowId,
            ),
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

    const openColumnModal = useCallback((_trigger?: HTMLElement | null) => {
        setIsColumnModalOpen(true);
    }, []);

    const { handleContextMenuAction } = useTorrentTableContextActions({
        contextMenu,
        findRowElement: (id) =>
            typeof document !== "undefined"
                ? (document.querySelector(
                      `[data-torrent-row="${id}"]`,
                  ) as HTMLElement | null)
                : null,
        openColumnModal,
        copyToClipboard,
        buildMagnetLink,
        setContextMenu,
        openTorrentFolder,
        selectedTorrents: selection.selectedTorrents,
    });

    const { activate: activateScope, deactivate: deactivateScope } =
        useKeyboardScope(KEY_SCOPE.Dashboard);

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

    const interactions = useTorrentTableInteractions({
        setActiveDragHeaderId,
        setColumnOrder,
        arrayMove,
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
            onRequestDetails?.(torrent);
            onRequestDetailsFullscreen?.(torrent);
        },
        [disableDetailOpen, onRequestDetails, onRequestDetailsFullscreen],
    );

    const handleContextMenu = useCallback(
        (event: React.MouseEvent, torrent: Torrent) => {
            event.preventDefault();
            if (torrent.isGhost) return;

            const virtualElement = createVirtualElement(
                event.clientX,
                event.clientY,
                { margin: fileContextMenuMargin },
            );
            setContextMenu({ virtualElement, torrent });

            const row = table
                .getRowModel()
                .rows.find((candidate) => candidate.original.id === torrent.id);
            if (!row) return;
            selection.ensureContextSelection(row.id, row.index, rowSelection);
        },
        [
            createVirtualElement,
            fileContextMenuMargin,
            rowSelection,
            selection,
            table,
        ],
    );

    const getColumnLabel = useCallback(
        (column: Column<Torrent>) => {
            const definition = TORRENTTABLE_COLUMN_DEFS[column.id as ColumnId];
            return definition?.labelKey ? t(definition.labelKey) : column.id;
        },
        [t],
    );

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
        [columnOrder, columnVisibility, table],
    );

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
        const resizeTimerRef: { current: number | null } = { current: null };
        const element = tableContainerRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => {
            if (resizeTimerRef.current !== null) {
                window.clearTimeout(resizeTimerRef.current);
            }
            beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
            resizeTimerRef.current = window.setTimeout(() => {
                endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.panelResize);
                resizeTimerRef.current = null;
            }, 150);
        });

        observer.observe(element);
        return () => {
            observer.disconnect();
            if (resizeTimerRef.current !== null) {
                window.clearTimeout(resizeTimerRef.current);
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
        const exists = torrents.some(
            (torrent) => torrent.id === contextMenu.torrent.id,
        );
        if (!exists) {
            setContextMenu(null);
        }
    }, [contextMenu, torrents]);

    const isAnimationSuppressed =
        isAnyColumnResizing || animationSuppressionActive;

    const headerMenuTriggerRect = headerContextMenu
        ? headerContextMenu.virtualElement.getBoundingClientRect()
        : null;

    const handleDropTargetChange = useCallback((id: string | null) => {
        setDropTargetRowId(id);
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const closeHeaderMenu = useCallback(() => {
        setHeaderContextMenu(null);
    }, []);

    return {
        refs: {
            parentRef,
            tableContainerRef,
            measureLayerRef,
        },
        state: {
            columnOrder,
            columnSizingInfo,
            contextMenu,
            headerContextMenu,
            isColumnModalOpen,
            isColumnOrderChanging,
            activeDragHeaderId,
            activeRowId,
            dropTargetRowId,
            highlightedRowId,
            isAnimationSuppressed,
            isAnyColumnResizing,
            canReorderQueue,
        },
        table: {
            instance: table,
            rows,
            rowIds,
            rowVirtualizer,
            measurementRows,
            measurementHeaders,
            marqueeRect,
            renderVisibleCells,
            headerSortableIds,
            rowsById,
        },
        column: {
            handleColumnResizeStart,
            handleColumnAutoFitRequest,
            autoFitAllColumns,
            hookActiveResizeColumnId,
        },
        selection: {
            handleRowClick: selection.handleRowClick,
        },
        interaction: {
            sensors: interactions.sensors,
            rowSensors: interactions.rowSensors,
            handleDragStart: interactions.handleDragStart,
            handleDragEnd: interactions.handleDragEnd,
            handleDragCancel: interactions.handleDragCancel,
            handleRowDragStart: interactions.handleRowDragStart,
            handleRowDragEnd: interactions.handleRowDragEnd,
            handleRowDragCancel: interactions.handleRowDragCancel,
            handleKeyDown: interactions.handleKeyDown,
            handleRowDoubleClick,
            handleContextMenu,
            handleDropTargetChange,
        },
        menus: {
            queueMenuActions,
            getContextMenuShortcut,
            isClipboardSupported,
            handleContextMenuAction,
            closeContextMenu,
            headerMenuTriggerRect,
            headerMenuActiveColumn,
            headerMenuItems,
            headerMenuHideLabel,
            isHeaderMenuHideEnabled,
            handleHeaderMenuAction,
            closeHeaderMenu,
            handleHeaderContextMenu,
            handleHeaderContainerContextMenu,
        },
        labels: {
            addTorrentShortcut: ADD_TORRENT_SHORTCUT,
        },
        layout: {
            rowHeight,
        },
        lifecycle: {
            activateScope,
            deactivateScope,
            setIsColumnModalOpen,
        },
    };
}

export default useTorrentTableViewModel;
