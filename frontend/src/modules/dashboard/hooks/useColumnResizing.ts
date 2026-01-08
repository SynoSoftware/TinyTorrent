import { useEffect, useRef, useCallback, useState } from "react";
import type { Column, Table } from "@tanstack/react-table";

export function useColumnResizing<TData>({
    table,
    setColumnSizing,
    setColumnSizingInfo,
    setColumnWidthVar,
    setTableTotalWidthVar,
    getMeasuredColumnMinWidth,
}: {
    table: Table<TData>;
    setColumnSizing: (
        updater:
            | Record<string, number>
            | ((prev: Record<string, number>) => Record<string, number>)
    ) => void;
    setColumnSizingInfo: (info: any) => void;
    setColumnWidthVar: (columnId: string, widthPx: number) => void;
    setTableTotalWidthVar: (widthPx: number) => void;
    getMeasuredColumnMinWidth: (columnId: string, fallbackWidth: number) => number;
}) {
    const resizeStartRef = useRef<{
        columnId: string;
        startX: number;
        startSize: number;
        startTotal: number;
    } | null>(null);
    const pendingColumnResizeRef = useRef<{
        columnId: string;
        nextSize: number;
        nextTotal: number;
    } | null>(null);
    const columnResizeRafRef = useRef<number | null>(null);

    const [activeResizeColumnId, setActiveResizeColumnId] = useState<
        string | null
    >(null);

    const applyPendingResizeCss = useCallback(() => {
        const pending = pendingColumnResizeRef.current;
        if (!pending) return;
        setColumnWidthVar(pending.columnId, pending.nextSize);
        setTableTotalWidthVar(pending.nextTotal);
    }, [setColumnWidthVar, setTableTotalWidthVar]);

    const scheduleResizeCssUpdate = useCallback(() => {
        if (columnResizeRafRef.current !== null) return;
        columnResizeRafRef.current = window.requestAnimationFrame(() => {
            columnResizeRafRef.current = null;
            applyPendingResizeCss();
        });
    }, [applyPendingResizeCss]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!activeResizeColumnId) return;

        const handlePointerMove = (event: PointerEvent) => {
            const resizeState = resizeStartRef.current;
            if (!resizeState) return;
            const column = table.getColumn(resizeState.columnId);
            if (!column) return;
            const delta = event.clientX - resizeState.startX;
            const minSize = getMeasuredColumnMinWidth(
                resizeState.columnId,
                column.getSize()
            );
            const maxSize =
                typeof column.columnDef.maxSize === "number"
                    ? column.columnDef.maxSize
                    : Number.POSITIVE_INFINITY;
            const nextSize = Math.min(
                maxSize,
                Math.max(minSize, Math.round(resizeState.startSize + delta))
            );
            const nextTotal =
                resizeState.startTotal - resizeState.startSize + nextSize;
            event.preventDefault();
            pendingColumnResizeRef.current = {
                columnId: resizeState.columnId,
                nextSize,
                nextTotal,
            };
            scheduleResizeCssUpdate();
        };

        const handlePointerUp = () => {
            if (columnResizeRafRef.current !== null) {
                window.cancelAnimationFrame(columnResizeRafRef.current);
                columnResizeRafRef.current = null;
            }
            applyPendingResizeCss();

            const pending = pendingColumnResizeRef.current;
            pendingColumnResizeRef.current = null;
            if (pending) {
                setColumnSizing((prev: Record<string, number>) => ({
                    ...prev,
                    [pending.columnId]: pending.nextSize,
                }));
            }
            // reset internal state
            resizeStartRef.current = null;
            setActiveResizeColumnId(null);
            setColumnSizingInfo(() => ({
                columnSizingStart: [],
                deltaOffset: null,
                deltaPercentage: null,
                isResizingColumn: false,
                startOffset: null,
                startSize: null,
            }));
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            if (columnResizeRafRef.current !== null) {
                window.cancelAnimationFrame(columnResizeRafRef.current);
                columnResizeRafRef.current = null;
            }
            pendingColumnResizeRef.current = null;
        };
    }, [
        activeResizeColumnId,
        applyPendingResizeCss,
        getMeasuredColumnMinWidth,
        scheduleResizeCssUpdate,
        setColumnSizingInfo,
        setColumnSizing,
        table,
    ]);

    const handleColumnResizeStart = useCallback(
        (column: Column<TData>, clientX: number) => {
            if (!column.getCanResize()) return;
            const startSize = column.getSize();
            const startTotal = table.getTotalSize();
            resizeStartRef.current = {
                columnId: column.id,
                startX: clientX,
                startSize,
                startTotal,
            };
            setActiveResizeColumnId(column.id);
            setColumnSizingInfo(() => ({
                columnSizingStart: [[column.id, startSize]],
                deltaOffset: 0,
                deltaPercentage: 0,
                isResizingColumn: column.id,
                startOffset: clientX,
                startSize,
            }));
        },
        [setColumnSizingInfo, table]
    );

    const resetColumnResizeState = useCallback(() => {
        resizeStartRef.current = null;
        pendingColumnResizeRef.current = null;
        if (columnResizeRafRef.current !== null) {
            window.cancelAnimationFrame(columnResizeRafRef.current);
            columnResizeRafRef.current = null;
        }
        setActiveResizeColumnId(null);
        setColumnSizingInfo(() => ({
            columnSizingStart: [],
            deltaOffset: null,
            deltaPercentage: null,
            isResizingColumn: false,
            startOffset: null,
            startSize: null,
        }));
    }, [setColumnSizingInfo]);

    return {
        activeResizeColumnId,
        handleColumnResizeStart,
        resetColumnResizeState,
    };
}
