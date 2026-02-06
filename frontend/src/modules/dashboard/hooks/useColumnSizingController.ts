import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Column, ColumnSizingInfoState, Table } from "@tanstack/react-table";
import { useMeasuredColumnWidths } from "@/modules/dashboard/components/TorrentTable_ColumnMeasurement";
import {
    getColumnWidthVarName,
    TABLE_TOTAL_WIDTH_VAR,
} from "@/modules/dashboard/components/TorrentTable_Shared";
import { useColumnResizing } from "@/modules/dashboard/hooks/useColumnResizing";
import {
    ANIMATION_SUPPRESSION_KEYS,
    type AnimationSuppressionKey,
} from "@/modules/dashboard/hooks/useTableAnimationGuard";

// TODO: Column sizing is complex and easy to regress. Keep a single owner:
// TODO: - Avoid re-implementing auto-fit/sizing logic in other places (headers, persistence, layout).
// TODO: - Prefer “one table view-model owns sizing” and the view renders CSS vars only (todo.md task 13).
// TODO: - Ensure any timing/measurement (ResizeObserver, effects) is consistent with the app’s scheduling authority (todo.md task 19).

const normalizeColumnSizingState = (s?: Record<string, number>) => {
    if (!s) return {};
    const out: Record<string, number> = {};
    for (const k in s) {
        const v = Number(s[k]);
        if (Number.isFinite(v)) out[k] = Math.max(1, Math.round(v));
    }
    return out;
};

type ColumnSizingInfoUpdater =
    | ColumnSizingInfoState
    | ((info: ColumnSizingInfoState) => ColumnSizingInfoState);

export type UseColumnSizingControllerDeps<TData> = {
    table: Table<TData>;
    columnSizing: Record<string, number>;
    setColumnSizing: React.Dispatch<
        React.SetStateAction<Record<string, number>>
    >;
    columnSizingInfo: ColumnSizingInfoState;
    setColumnSizingInfo: React.Dispatch<
        React.SetStateAction<ColumnSizingInfoState>
    >;
    tableContainerRef: React.RefObject<HTMLDivElement | null>;
    measureLayerRef: React.RefObject<HTMLDivElement | null>;
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
    autoFitTolerancePx: number;
    beginAnimationSuppression: (key: AnimationSuppressionKey) => void;
    endAnimationSuppression: (key: AnimationSuppressionKey) => void;
};

export const useColumnSizingController = <TData,>({
    table,
    columnSizing,
    setColumnSizing,
    columnSizingInfo,
    setColumnSizingInfo,
    tableContainerRef,
    measureLayerRef,
    columnOrder,
    columnVisibility,
    autoFitTolerancePx,
    beginAnimationSuppression,
    endAnimationSuppression,
}: UseColumnSizingControllerDeps<TData>) => {
    const {
        minWidths: measuredMinWidths,
        minWidthsRef: measuredMinWidthsRef,
        measure: measureColumnMinWidths,
    } = useMeasuredColumnWidths(measureLayerRef, autoFitTolerancePx);

    const setTableCssVar = useCallback(
        (name: string, value: string) => {
            const container = tableContainerRef.current;
            if (!container) return;
            container.style.setProperty(name, value);
        },
        [tableContainerRef]
    );

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

    const getMeasuredColumnMinWidth = useCallback(
        (columnId: string, fallbackWidth: number) => {
            const measured = measuredMinWidthsRef.current[columnId];
            return Number.isFinite(measured) ? measured : fallbackWidth;
        },
        [measuredMinWidthsRef]
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
        getMeasuredColumnMinWidth,
    });

    const isAnyColumnResizing =
        Boolean(hookActiveResizeColumnId) ||
        Boolean(columnSizingInfo.isResizingColumn);

    const resetColumnResizeState = hookResetColumnResizeState;

    const autoFitColumn = useCallback(
        (
            column: Column<TData>,
            measurements?: Record<string, number> | null,
            options?: { suppress?: boolean }
        ) => {
            if (!column.getCanResize()) return false;
            const shouldSuppress = options?.suppress !== false;
            resetColumnResizeState();
            const measuredWidths = measurements ?? measureColumnMinWidths();
            const measuredWidth =
                (measuredWidths && measuredWidths[column.id]) ??
                measuredMinWidthsRef.current[column.id];
            if (!Number.isFinite(measuredWidth)) return false;
            const computedWidth = Math.ceil(measuredWidth);
            const containerWidth =
                tableContainerRef.current?.getBoundingClientRect().width ??
                table.getTotalSize();
            const maxAllowed = Math.max(80, Math.round(containerWidth));
            const finalWidth = Math.min(computedWidth, maxAllowed);
            const currentWidth = column.getSize();
            if (Math.abs(finalWidth - currentWidth) <= autoFitTolerancePx) {
                return false;
            }

            if (shouldSuppress) {
                beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.autoFit);
            }
            setColumnSizing((prev: Record<string, number>) =>
                normalizeColumnSizingState({
                    ...prev,
                    [column.id]: finalWidth,
                })
            );
            if (shouldSuppress) {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        endAnimationSuppression(
                            ANIMATION_SUPPRESSION_KEYS.autoFit
                        );
                    });
                });
            }

            return true;
        },
        [
            autoFitTolerancePx,
            beginAnimationSuppression,
            endAnimationSuppression,
            measureColumnMinWidths,
            measuredMinWidthsRef,
            resetColumnResizeState,
            setColumnSizing,
            tableContainerRef,
            table,
        ]
    );

    const autoFitAllColumns = useCallback(() => {
        beginAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.autoFitAll);
        const measuredWidths = measureColumnMinWidths();
        table.getAllLeafColumns().forEach((column) => {
            if (!column.getCanResize()) return;
            autoFitColumn(column, measuredWidths, { suppress: false });
        });
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() =>
                endAnimationSuppression(ANIMATION_SUPPRESSION_KEYS.autoFitAll)
            );
        });
    }, [
        autoFitColumn,
        beginAnimationSuppression,
        endAnimationSuppression,
        measureColumnMinWidths,
        table,
    ]);

    const handleColumnAutoFitRequest = useCallback(
        (column: Column<TData>) => {
            if (!column.getCanResize()) return;
            const didResize = autoFitColumn(column);
            if (!didResize) {
                autoFitAllColumns();
            }
        },
        [autoFitAllColumns, autoFitColumn]
    );

    const controller = useMemo(
        () => ({
            columnSizing,
            columnSizingInfo,
            setColumnSizing,
            setColumnSizingInfo,
            handleColumnSizingChange: (
                updater:
                    | Record<string, number>
                    | ((
                          prev: Record<string, number>
                      ) => Record<string, number>)
            ) => {
                setColumnSizing((prev) =>
                    normalizeColumnSizingState(
                        typeof updater === "function" ? updater(prev) : updater
                    )
                );
            },
            handleColumnSizingInfoChange: (
                info: ColumnSizingInfoUpdater
            ) => {
                setColumnSizingInfo((prev) =>
                    typeof info === "function" ? info(prev) : info
                );
            },
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
        }),
        [
            autoFitAllColumns,
            autoFitColumn,
            columnSizing,
            columnSizingInfo,
            getMeasuredColumnMinWidth,
            handleColumnAutoFitRequest,
            handleColumnResizeStart,
            hookActiveResizeColumnId,
            isAnyColumnResizing,
            measureColumnMinWidths,
            measuredMinWidths,
            measuredMinWidthsRef,
            setColumnSizing,
            setColumnSizingInfo,
        ]
    );

    // Invariant: all column sizing mutations (state + CSS vars + suppression) flow through this controller.
    return controller;
};

export default useColumnSizingController;
