import { useLayoutEffect, useEffect, useMemo } from "react";
import type { MutableRefObject, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
    Row,
    Header,
    Column,
    SortingState,
    RowSelectionState,
} from "@tanstack/react-table";
import { useMarqueeSelection } from "./useMarqueeSelection";
import type { Torrent } from "@/modules/dashboard/types/torrent";

// TODO: This hook is a wiring hub with a very large dependency surface. Reduce cognitive load:
// TODO: - Create a `TorrentTableViewModel` that owns selection/virtualization/column measurement wiring and passes only minimal callbacks/state into the view.
// TODO: - Avoid threading through both “data” and “behavior” deps separately; group them into stable objects.
// TODO: - Ensure scheduling/measurement is consistent with the app’s single scheduling authority (todo.md task 19).

// Strongly-typed deps for the virtualization hook. Avoids use of `any` and
// documents the exact surface the parent must provide.
export type UseTorrentTableVirtualizationDeps = {
    rows: Row<Torrent>[];
    parentRef: RefObject<HTMLDivElement | null>;
    rowHeight: number;
    TABLE_LAYOUT: { rowHeight: number | string; overscan: number };
    table: {
        getTotalSize: () => number;
        getFlatHeaders: () => Header<Torrent, unknown>[];
        getAllLeafColumns: () => Column<Torrent>[];
    };
    isAnyColumnResizing: boolean;
    measureColumnMinWidths: () => Record<string, number> | null;
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
    sorting: SortingState;
    measuredMinWidths: Record<string, number>;
    setColumnSizing: (
        updater: (prev: Record<string, number>) => Record<string, number>
    ) => void;
    getMeasuredColumnMinWidth: (
        columnId: string,
        fallbackWidth: number
    ) => number;
    normalizeColumnSizingState: (
        s?: Record<string, number>
    ) => Record<string, number>;
    AUTO_FIT_TOLERANCE_PX: number;
    rowsRef: MutableRefObject<Row<Torrent>[]>;
    getSelectionSnapshot: () => RowSelectionState;
    previewSelection: (s: RowSelectionState) => void;
    commitSelection: (
        s: RowSelectionState,
        focusIndex: number | null,
        focusRowId: string | null
    ) => void;
    clearSelection: () => void;
};

// Wiring-friendly virtualization hook extracted from TorrentTable.tsx.
// Parent must provide dependencies the original inline code relied on.
export const useTorrentTableVirtualization = (
    deps: UseTorrentTableVirtualizationDeps
) => {
    const {
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
        getSelectionSnapshot,
        previewSelection,
        commitSelection,
        clearSelection,
    } = deps;

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });

    // If the row height token or computed value changes, ensure the virtualizer
    // refreshes its measurements so total size and virtual items update.
    useEffect(() => {
        try {
            rowVirtualizer.measure();
        } catch {
            // silently ignore measurement failures in environments without DOM
        }
    }, [rowHeight, rowVirtualizer]);

    const measurementItems = rowVirtualizer.getVirtualItems();
    const measurementRows = measurementItems
        .map((virtualRow) => rows[virtualRow.index])
        .filter((row): row is Row<Torrent> => Boolean(row));
    const measurementHeaders = table
        .getFlatHeaders()
        .filter((header) => !header.isPlaceholder && header.column.getIsVisible());

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
    }, [rows, rowsRef]);

    // This hook owns no alternate ordering: rowIds is derived directly from the
    // provided React Table rows and must stay aligned with the parent's rowIds
    // so DnD/virtualization share a single ordering authority.
    const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
    if (import.meta.env.DEV) {
        const modelIds = rows.map((row) => row.id);
        if (
            rowIds.length !== modelIds.length ||
            !rowIds.every((id, idx) => id === modelIds[idx])
        ) {
            throw new Error(
                "Virtualization invariant violated: rowIds must match provided rows"
            );
        }
    }

    const { marqueeRect, marqueeClickBlockRef, isMarqueeDraggingRef } =
        useMarqueeSelection({
            parentRef,
            rowHeight,
            rowsRef,
            rowIds,
            getBaseSelection: getSelectionSnapshot,
            previewSelection,
            commitSelection,
            clearSelection,
        });

    return {
        rowVirtualizer,
        measurementRows,
        measurementHeaders,
        marqueeRect,
        marqueeClickBlockRef,
        isMarqueeDraggingRef,
        rowIds,
    };
};

export default useTorrentTableVirtualization;
