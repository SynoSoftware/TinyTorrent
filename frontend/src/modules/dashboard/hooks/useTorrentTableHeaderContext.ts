import { useCallback, useMemo } from "react";

// Hook: header context/menu helpers for the torrent table.
// Extracted from `TorrentTable.tsx`; accepts parameters to avoid outer-scope
// dependencies and keep header logic focused.
export const useTorrentTableHeaderContext = (params: any) => {
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
        [createVirtualElement, fileContextMenuMargin, setHeaderContextMenu]
    );

    const handleHeaderContainerContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            if (target.closest("[role='columnheader']")) return;
            handleHeaderContextMenu(event, null);
        },
        [handleHeaderContextMenu]
    );

    const headerMenuActiveColumn = useMemo(() => {
        if (!params.headerContextMenu?.columnId) return null;
        return table.getColumn(params.headerContextMenu.columnId) ?? null;
    }, [params.headerContextMenu, table, params.columnVisibility]);

    const handleHeaderMenuAction = useCallback(
        (action: () => void, options: any = {}) => {
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
        const byId = new Map();
        table.getAllLeafColumns().forEach((column: any) => {
            byId.set(column.id, column);
        });

        const items: any[] = [];
        const seen = new Set<string>();
        const orderedIds =
            columnOrder.length > 0
                ? columnOrder
                : table.getAllLeafColumns().map((c: any) => c.id);
        orderedIds.forEach((id: string) => {
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

        table.getAllLeafColumns().forEach((column: any) => {
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
