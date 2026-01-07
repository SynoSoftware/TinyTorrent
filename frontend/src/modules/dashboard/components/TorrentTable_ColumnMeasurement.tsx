import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnSizingInfoState } from "@tanstack/react-table";
import {
    MEASURE_HEADER_SELECTOR,
    MEASURE_CELL_SELECTOR,
} from "./TorrentTable_Shared";

const readMeasuredWidth = (element: HTMLElement) => {
    const width = element.getBoundingClientRect().width;
    return Number.isFinite(width) ? Math.ceil(width) : Number.NaN;
};

const createColumnSizingInfoState = (): ColumnSizingInfoState => ({
    columnSizingStart: [],
    deltaOffset: null,
    deltaPercentage: null,
    isResizingColumn: false,
    startOffset: null,
    startSize: null,
});

export const useMeasuredColumnWidths = (
    layerRef: React.RefObject<HTMLDivElement | null>,
    tolerancePx: number
) => {
    const [minWidths, setMinWidths] = useState<Record<string, number>>({});
    const minWidthsRef = useRef(minWidths);

    useEffect(() => {
        minWidthsRef.current = minWidths;
    }, [minWidths]);

    const measure = useCallback(() => {
        const layer = layerRef.current;
        if (!layer) return null;

        const headerWidths: Record<string, number> = {};
        const cellWidths: Record<string, number> = {};

        layer
            .querySelectorAll<HTMLElement>(MEASURE_HEADER_SELECTOR)
            .forEach((element) => {
                const columnId = element.dataset.ttMeasureHeader;
                if (!columnId) return;
                const width = readMeasuredWidth(element);
                if (!Number.isFinite(width)) return;
                const current = headerWidths[columnId];
                if (!Number.isFinite(current) || width > current) {
                    headerWidths[columnId] = width;
                }
            });

        layer
            .querySelectorAll<HTMLElement>(MEASURE_CELL_SELECTOR)
            .forEach((element) => {
                const columnId = element.dataset.ttMeasureCell;
                if (!columnId) return;
                const width = readMeasuredWidth(element);
                if (!Number.isFinite(width)) return;
                const current = cellWidths[columnId];
                if (!Number.isFinite(current) || width > current) {
                    cellWidths[columnId] = width;
                }
            });

        const nextMinWidths: Record<string, number> = {};
        const columnIds = new Set([
            ...Object.keys(headerWidths),
            ...Object.keys(cellWidths),
        ]);
        columnIds.forEach((columnId) => {
            const headerWidth = headerWidths[columnId];
            const cellWidth = cellWidths[columnId];
            if (Number.isFinite(headerWidth) && Number.isFinite(cellWidth)) {
                nextMinWidths[columnId] = Math.max(headerWidth, cellWidth);
                return;
            }
            if (Number.isFinite(headerWidth)) {
                nextMinWidths[columnId] = headerWidth;
                return;
            }
            if (Number.isFinite(cellWidth)) {
                nextMinWidths[columnId] = cellWidth;
            }
        });

        setMinWidths((prev) => {
            const nextIds = Object.keys(nextMinWidths);
            if (nextIds.length !== Object.keys(prev).length) {
                return nextMinWidths;
            }
            for (const id of nextIds) {
                if (!Object.prototype.hasOwnProperty.call(prev, id)) {
                    return nextMinWidths;
                }
                const prevWidth = prev[id];
                const nextWidth = nextMinWidths[id];
                if (!Number.isFinite(prevWidth)) {
                    return nextMinWidths;
                }
                if (Math.abs(nextWidth - prevWidth) > tolerancePx) {
                    return nextMinWidths;
                }
            }
            return prev;
        });

        return nextMinWidths;
    }, [layerRef, tolerancePx]);

    return { minWidths, minWidthsRef, measure };
};

export { createColumnSizingInfoState };
