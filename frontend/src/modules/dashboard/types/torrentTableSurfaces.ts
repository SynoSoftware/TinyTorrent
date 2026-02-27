import type {
    DndContextProps,
    DragEndEvent,
    DragStartEvent,
} from "@dnd-kit/core";
import type {
    Column,
    ColumnSizingInfoState,
    Row,
    Table,
} from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type { MouseEvent, ReactNode, RefObject } from "react";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";

export type QueueMenuAction = {
    key: TorrentTableAction;
    label: string;
};

export const rowMenuKey = {
    copyHash: "copy-hash",
    copyMagnet: "copy-magnet",
    openFolder: "open-folder",
    setDownloadLocation: "set-download-location",
} as const;

type RowMenuPrimitiveKey = (typeof rowMenuKey)[keyof typeof rowMenuKey];
const rowMenuShortcutKeys = [rowMenuKey.copyHash, rowMenuKey.copyMagnet] as const;
type RowMenuShortcutKey = (typeof rowMenuShortcutKeys)[number];

export type ContextMenuKey = TorrentTableAction | RowMenuShortcutKey;

export type RowContextMenuKey = TorrentTableAction | RowMenuPrimitiveKey;

export type HeaderMenuActionOptions = {
    keepOpen?: boolean;
};

export type HeaderMenuItem = {
    column: Column<Torrent>;
    label: string;
    isPinned: boolean;
};

export type TableContextMenu = {
    virtualElement: ContextMenuVirtualElement;
    torrent: Torrent;
};

export type HeaderContextMenu = {
    virtualElement: ContextMenuVirtualElement;
    columnId: string | null;
};

export type TableVirtualizer = Virtualizer<HTMLDivElement, Element>;

export interface TorrentTableRowInteractionViewModel {
    contextMenuTorrentId?: string | null;
    onRowClick: (
        event: MouseEvent,
        rowId: string,
        index: number,
    ) => void;
    onRowDoubleClick: (row: Torrent) => void;
    onRowContextMenu: (event: MouseEvent, row: Torrent) => void;
    onDropTargetChange: (id: string | null) => void;
}

export interface TorrentTableRowStateViewModel {
    canReorderQueue: boolean;
    dropTargetRowId?: string | null;
    activeRowId?: string | null;
    highlightedRowId?: string | null;
    isAnyColumnResizing: boolean;
    columnOrder: string[];
    isAnimationSuppressed: boolean;
    isColumnOrderChanging: boolean;
}

export interface TorrentTableRowProps {
    row: Row<Torrent>;
    virtualRow: VirtualItem;
    isSelected: boolean;
    isContext: boolean;
    isHighlighted: boolean;
    interaction: TorrentTableRowInteractionViewModel;
    state: TorrentTableRowStateViewModel;
}

export interface TorrentTableHeadersViewModel {
    headerContainerClass: string;
    handlers: {
        handleHeaderContainerContextMenu: (
            event: MouseEvent<HTMLDivElement>,
        ) => void;
        handleHeaderContextMenu: (event: MouseEvent, id: string | null) => void;
        handleColumnAutoFitRequest: (column: Column<Torrent>) => void;
        handleColumnResizeStart: (
            column: Column<Torrent>,
            clientX: number,
        ) => void;
    };
    table: {
        headerSortableIds: string[];
        tableApi: Table<Torrent>;
        getTableTotalWidthCss: (size: number) => string;
    };
    state: {
        columnSizingInfo: ColumnSizingInfoState;
        hookActiveResizeColumnId: string | null;
        isAnimationSuppressed?: boolean;
    };
}

export interface TorrentTableBodyViewModel {
    refs: {
        parentRef: RefObject<HTMLDivElement | null>;
    };
    data: {
        isLoading: boolean;
        hasSourceTorrents: boolean;
        visibleRowCount: number;
        tableLayout: { rowHeight: number | string; overscan: number };
        rowHeight: number;
        marqueeRect?: {
            left: number;
            top: number;
            width: number;
            height: number;
        } | null;
    };
    labels: {
        emptyHint: string;
        emptyHintSubtext: string;
        noResults: string;
        headerName: string;
        headerSpeed: string;
    };
    dnd: {
        rowSensors: NonNullable<DndContextProps["sensors"]>;
        handleRowDragStart: (e: DragStartEvent) => void;
        handleRowDragEnd: (e: DragEndEvent) => void;
        handleRowDragCancel: () => void;
        renderOverlayPortal: (node: ReactNode) => ReactNode;
        overlayClassName: string;
    };
    table: {
        rowIds: string[];
        rowVirtualizer: TableVirtualizer;
        rows: Row<Torrent>[];
        tableApi: { getTotalSize: () => number };
        renderVisibleCells: (row: Row<Torrent>) => ReactNode;
        activeDragRow?: Row<Torrent> | null;
    };
    rowInteraction: TorrentTableRowInteractionViewModel;
    state: TorrentTableRowStateViewModel;
}

export interface TorrentTableRowMenuViewModel {
    contextMenu: TableContextMenu | null;
    onClose: () => void;
    handleContextMenuAction: (
        key: RowContextMenuKey,
    ) => Promise<TorrentCommandOutcome>;
    queueMenuActions: QueueMenuAction[];
    getContextMenuShortcut: (key: ContextMenuKey) => string;
}

export interface TorrentTableHeaderMenuViewModel {
    headerMenuTriggerRect: DOMRect | null;
    onClose: () => void;
    headerMenuActiveColumn: Column<Torrent> | null;
    headerMenuItems: HeaderMenuItem[];
    headerMenuHideLabel: string;
    isHeaderMenuHideEnabled: boolean;
    autoFitAllColumns: () => void;
    handleHeaderMenuAction: (
        action: () => void,
        options?: HeaderMenuActionOptions,
    ) => void;
}

export interface TorrentTableSurfaces {
    renderOverlayPortal: (overlay: ReactNode) => ReactNode;
    headersViewModel: TorrentTableHeadersViewModel;
    bodyViewModel: TorrentTableBodyViewModel;
    rowMenuViewModel: TorrentTableRowMenuViewModel;
    headerMenuViewModel: TorrentTableHeaderMenuViewModel;
}


