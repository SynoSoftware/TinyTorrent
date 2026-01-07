import React, { useLayoutEffect, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Row } from "@tanstack/react-table";
import { useMarqueeSelection } from "./useMarqueeSelection";

// Wiring-friendly virtualization hook extracted from TorrentTable.tsx.
// Parent must provide dependencies the original inline code relied on.
export const useTorrentTableVirtualization = (deps: any) => {
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
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setHighlightedRowId,
        rowSelectionRef,
    } = deps;

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        overscan: TABLE_LAYOUT.overscan,
    });

    const measurementItems = rowVirtualizer.getVirtualItems();
    const measurementRows = measurementItems
        .map((virtualRow) => rows[virtualRow.index])
        .filter((row): row is Row<any> => Boolean(row));
    const measurementHeaders = table
        .getFlatHeaders()
        .filter(
            (header: any) =>
                !header.isPlaceholder && header.column.getIsVisible()
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
            table.getAllLeafColumns().forEach((column: any) => {
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

    const rowIds = useMemo(() => rows.map((row: any) => row.id), [rows]);

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
