import { useCallback, useMemo } from "react";
import type { MouseEvent } from "react";
import type { TFunction } from "i18next";
import type { Column, Table } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";

type HeaderContextMenuState = {
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

type UseTorrentTableHeaderContextParams = {
    createVirtualElement: (
        x: number,
        y: number,
        options?: { margin?: number }
    ) => ContextMenuVirtualElement;
    fileContextMenuMargin: number;
    table: Table<Torrent>;
    columnOrder: string[];
    getColumnLabel: (column: Column<Torrent>) => string;
    t: TFunction;
    setHeaderContextMenu: (
        value: HeaderContextMenuState | null
    ) => void;
    headerContextMenu: HeaderContextMenuState | null;
    columnVisibility: Record<string, boolean>;
};

// Hook: header context/menu helpers for the torrent table.
// Extracted from `TorrentTable.tsx`; accepts parameters to avoid outer-scope
// dependencies and keep header logic focused.
export const useTorrentTableHeaderContext = (
    params: UseTorrentTableHeaderContextParams
) => {
    const {
        createVirtualElement,
        fileContextMenuMargin,
        table,
        columnOrder,
        getColumnLabel,
        t,
        setHeaderContextMenu,
    } = params;

    const handleHeaderContextMenu = useCallback(
        (event: MouseEvent, columnId: string | null) => {
            event.preventDefault();
            event.stopPropagation();
            const virtualElement = createVirtualElement(
                event.clientX,
                event.clientY,
                { margin: fileContextMenuMargin }
            );
            setHeaderContextMenu({ virtualElement, columnId });
        },
        [createVirtualElement, fileContextMenuMargin, setHeaderContextMenu]
    );

    const handleHeaderContainerContextMenu = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            if (target.closest("[role='columnheader']")) return;
            handleHeaderContextMenu(event, null);
        },
        [handleHeaderContextMenu]
    );

    const headerMenuActiveColumn = useMemo(() => {
        if (!params.headerContextMenu?.columnId) return null;
        return table.getColumn(params.headerContextMenu.columnId) ?? null;
    }, [params.headerContextMenu, table]);

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

    const headerMenuItems = useMemo(() => {
        if (!params.headerContextMenu) return [];
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
        params.headerContextMenu,
        headerMenuActiveColumn,
        table,
    ]);

    return {
        handleHeaderContextMenu,
        handleHeaderContainerContextMenu,
        headerMenuActiveColumn,
        handleHeaderMenuAction,
        headerMenuHideLabel,
        isHeaderMenuHideEnabled,
        headerMenuItems,
    };
};

export default useTorrentTableHeaderContext;

