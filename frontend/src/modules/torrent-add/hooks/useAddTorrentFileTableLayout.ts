import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { FileRow } from "@/modules/torrent-add/services/fileSelection";

export type AddTorrentResizableFileColumn = "size" | "priority";

type UseAddTorrentFileTableLayoutParams = {
    enabled: boolean;
    rows: readonly FileRow[];
};

type UseAddTorrentFileTableLayoutResult = {
    tableLayoutRef: RefObject<HTMLDivElement | null>;
    handleColumnResizeStart: (
        column: AddTorrentResizableFileColumn,
        clientX: number
    ) => void;
    handleColumnAutoFit: (column: AddTorrentResizableFileColumn) => void;
    isColumnResizing: (column: AddTorrentResizableFileColumn) => boolean;
};

const RESIZABLE_COLUMNS: readonly AddTorrentResizableFileColumn[] = [
    "size",
    "priority",
];

const COLUMN_WIDTH_VAR: Record<AddTorrentResizableFileColumn, string> = {
    size: "--tt-add-file-col-size-w",
    priority: "--tt-add-file-col-priority-w",
};

const COLUMN_MIN_WIDTH_VAR: Record<AddTorrentResizableFileColumn, string> = {
    size: "--tt-add-file-col-size-min-w",
    priority: "--tt-add-file-col-priority-min-w",
};

const COLUMN_MEASURE_SELECTOR: Record<AddTorrentResizableFileColumn, string> = {
    size: "[data-tt-add-col-size='true']",
    priority: "[data-tt-add-col-priority='true']",
};

type ResizeStartState = {
    column: AddTorrentResizableFileColumn;
    startX: number;
    startWidth: number;
    minWidth: number;
};

const isFiniteNumber = (value: number | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value);

const readCssVarPx = (
    root: HTMLElement,
    variableName: string
): number | undefined => {
    const raw = window.getComputedStyle(root).getPropertyValue(variableName).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const writeCssVarPx = (
    root: HTMLElement,
    variableName: string,
    valuePx: number
) => {
    root.style.setProperty(variableName, `${Math.round(valuePx)}px`);
};

export const useAddTorrentFileTableLayout = ({
    enabled,
    rows,
}: UseAddTorrentFileTableLayoutParams): UseAddTorrentFileTableLayoutResult => {
    const tableLayoutRef = useRef<HTMLDivElement | null>(null);

    const [activeResizeColumn, setActiveResizeColumn] =
        useState<AddTorrentResizableFileColumn | null>(null);
    const [manualWidths, setManualWidths] = useState<
        Partial<Record<AddTorrentResizableFileColumn, number>>
    >({});
    const [measuredMinWidths, setMeasuredMinWidths] = useState<
        Partial<Record<AddTorrentResizableFileColumn, number>>
    >({});

    const baseWidthsRef = useRef<
        Partial<Record<AddTorrentResizableFileColumn, number>>
    >({});
    const baseMinWidthsRef = useRef<
        Partial<Record<AddTorrentResizableFileColumn, number>>
    >({});
    const resizeStartRef = useRef<ResizeStartState | null>(null);
    const pendingResizeRef = useRef<{
        column: AddTorrentResizableFileColumn;
        width: number;
    } | null>(null);
    const resizeRafRef = useRef<number | null>(null);

    const ensureBaseColumnVars = useCallback(() => {
        const root = tableLayoutRef.current;
        if (!root) return;

        RESIZABLE_COLUMNS.forEach((column) => {
            const widthVarName = COLUMN_WIDTH_VAR[column];
            const minVarName = COLUMN_MIN_WIDTH_VAR[column];

            if (!isFiniteNumber(baseWidthsRef.current[column])) {
                const widthPx = readCssVarPx(root, widthVarName);
                if (isFiniteNumber(widthPx)) {
                    baseWidthsRef.current[column] = widthPx;
                }
            }

            if (!isFiniteNumber(baseMinWidthsRef.current[column])) {
                const minWidthPx = readCssVarPx(root, minVarName);
                if (isFiniteNumber(minWidthPx)) {
                    baseMinWidthsRef.current[column] = minWidthPx;
                }
            }
        });
    }, []);

    const resolveColumnWidth = useCallback(
        (column: AddTorrentResizableFileColumn): number | undefined => {
            const measuredMin = measuredMinWidths[column];
            const manualWidth = manualWidths[column];
            const baseWidth = baseWidthsRef.current[column];
            const baseMin = baseMinWidthsRef.current[column];
            const minWidth = isFiniteNumber(measuredMin)
                ? measuredMin
                : baseMin;
            const preferredWidth = isFiniteNumber(manualWidth)
                ? manualWidth
                : baseWidth;

            if (!isFiniteNumber(preferredWidth)) return minWidth;
            return isFiniteNumber(minWidth)
                ? Math.max(preferredWidth, minWidth)
                : preferredWidth;
        },
        [manualWidths, measuredMinWidths]
    );

    const applyColumnVars = useCallback(() => {
        const root = tableLayoutRef.current;
        if (!root) return;
        ensureBaseColumnVars();

        RESIZABLE_COLUMNS.forEach((column) => {
            const measuredMin = measuredMinWidths[column];
            if (isFiniteNumber(measuredMin)) {
                writeCssVarPx(root, COLUMN_MIN_WIDTH_VAR[column], measuredMin);
            }

            const resolvedWidth = resolveColumnWidth(column);
            if (isFiniteNumber(resolvedWidth)) {
                writeCssVarPx(root, COLUMN_WIDTH_VAR[column], resolvedWidth);
            }
        });
    }, [ensureBaseColumnVars, measuredMinWidths, resolveColumnWidth]);

    const clearInlineColumnVars = useCallback(() => {
        const root = tableLayoutRef.current;
        if (!root) return;

        RESIZABLE_COLUMNS.forEach((column) => {
            root.style.removeProperty(COLUMN_WIDTH_VAR[column]);
            root.style.removeProperty(COLUMN_MIN_WIDTH_VAR[column]);
        });
    }, []);

    const measureColumns = useCallback(() => {
        const root = tableLayoutRef.current;
        if (!root) return;

        ensureBaseColumnVars();

        const nextMeasured: Partial<Record<AddTorrentResizableFileColumn, number>> =
            {};

        RESIZABLE_COLUMNS.forEach((column) => {
            let maxMeasuredWidth: number | undefined;

            root.querySelectorAll<HTMLElement>(COLUMN_MEASURE_SELECTOR[column]).forEach(
                (element) => {
                    const measuredWidth = Math.ceil(
                        element.getBoundingClientRect().width
                    );
                    if (!Number.isFinite(measuredWidth)) return;
                    if (
                        !isFiniteNumber(maxMeasuredWidth) ||
                        measuredWidth > maxMeasuredWidth
                    ) {
                        maxMeasuredWidth = measuredWidth;
                    }
                }
            );

            const baseMin = baseMinWidthsRef.current[column];
            if (isFiniteNumber(maxMeasuredWidth) && isFiniteNumber(baseMin)) {
                nextMeasured[column] = Math.max(maxMeasuredWidth, baseMin);
                return;
            }
            if (isFiniteNumber(maxMeasuredWidth)) {
                nextMeasured[column] = maxMeasuredWidth;
                return;
            }
            if (isFiniteNumber(baseMin)) {
                nextMeasured[column] = baseMin;
            }
        });

        setMeasuredMinWidths((prev) => {
            const hasChange = RESIZABLE_COLUMNS.some(
                (column) => prev[column] !== nextMeasured[column]
            );
            return hasChange ? nextMeasured : prev;
        });
    }, [ensureBaseColumnVars]);

    const flushPendingResize = useCallback(() => {
        const pending = pendingResizeRef.current;
        const root = tableLayoutRef.current;
        if (!pending || !root) return;
        writeCssVarPx(root, COLUMN_WIDTH_VAR[pending.column], pending.width);
    }, []);

    const scheduleResizeFlush = useCallback(() => {
        if (resizeRafRef.current !== null) return;
        resizeRafRef.current = window.requestAnimationFrame(() => {
            resizeRafRef.current = null;
            flushPendingResize();
        });
    }, [flushPendingResize]);

    useEffect(() => {
        if (!enabled) {
            if (resizeRafRef.current !== null) {
                window.cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }
            resizeStartRef.current = null;
            pendingResizeRef.current = null;
            setActiveResizeColumn((prev) => (prev === null ? prev : null));
            setManualWidths((prev) =>
                Object.keys(prev).length === 0 ? prev : {}
            );
            setMeasuredMinWidths((prev) =>
                Object.keys(prev).length === 0 ? prev : {}
            );
            clearInlineColumnVars();
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            measureColumns();
            applyColumnVars();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [
        applyColumnVars,
        clearInlineColumnVars,
        enabled,
        measureColumns,
        rows.length,
    ]);

    useEffect(() => {
        if (!enabled) return;
        applyColumnVars();
    }, [applyColumnVars, enabled]);

    useEffect(() => {
        if (!enabled || !activeResizeColumn) return;

        const handlePointerMove = (event: PointerEvent) => {
            const resizeState = resizeStartRef.current;
            if (!resizeState) return;
            const delta = event.clientX - resizeState.startX;
            const nextWidth = Math.max(
                resizeState.startWidth + delta,
                resizeState.minWidth
            );
            pendingResizeRef.current = {
                column: resizeState.column,
                width: nextWidth,
            };
            scheduleResizeFlush();
            event.preventDefault();
        };

        const handlePointerUp = () => {
            if (resizeRafRef.current !== null) {
                window.cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }
            flushPendingResize();

            const pending = pendingResizeRef.current;
            pendingResizeRef.current = null;
            resizeStartRef.current = null;
            setActiveResizeColumn(null);
            if (!pending) return;

            setManualWidths((prev) => ({
                ...prev,
                [pending.column]: pending.width,
            }));
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            if (resizeRafRef.current !== null) {
                window.cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }
            pendingResizeRef.current = null;
        };
    }, [activeResizeColumn, enabled, flushPendingResize, scheduleResizeFlush]);

    const handleColumnResizeStart = useCallback(
        (column: AddTorrentResizableFileColumn, clientX: number) => {
            if (!enabled) return;
            ensureBaseColumnVars();

            const measuredMin = measuredMinWidths[column];
            const baseMin = baseMinWidthsRef.current[column];
            const baseWidth = baseWidthsRef.current[column];
            const manualWidth = manualWidths[column];
            const minWidth = isFiniteNumber(measuredMin)
                ? measuredMin
                : baseMin;
            const startWidth = isFiniteNumber(manualWidth)
                ? manualWidth
                : baseWidth;

            if (!isFiniteNumber(startWidth)) return;

            resizeStartRef.current = {
                column,
                startX: clientX,
                startWidth,
                minWidth: isFiniteNumber(minWidth) ? minWidth : startWidth,
            };
            setActiveResizeColumn(column);
        },
        [enabled, ensureBaseColumnVars, manualWidths, measuredMinWidths]
    );

    const handleColumnAutoFit = useCallback(
        (column: AddTorrentResizableFileColumn) => {
            setManualWidths((prev) => {
                if (!isFiniteNumber(prev[column])) return prev;
                const next = { ...prev };
                delete next[column];
                return next;
            });

            const root = tableLayoutRef.current;
            if (!root) return;
            ensureBaseColumnVars();

            const measuredMin = measuredMinWidths[column];
            const baseWidth = baseWidthsRef.current[column];
            const baseMin = baseMinWidthsRef.current[column];
            const minWidth = isFiniteNumber(measuredMin)
                ? measuredMin
                : baseMin;
            const fallbackWidth = isFiniteNumber(baseWidth) ? baseWidth : minWidth;
            if (!isFiniteNumber(fallbackWidth)) return;

            const resolvedWidth = isFiniteNumber(minWidth)
                ? Math.max(fallbackWidth, minWidth)
                : fallbackWidth;

            writeCssVarPx(root, COLUMN_WIDTH_VAR[column], resolvedWidth);
        },
        [ensureBaseColumnVars, measuredMinWidths]
    );

    const isColumnResizing = useCallback(
        (column: AddTorrentResizableFileColumn) => activeResizeColumn === column,
        [activeResizeColumn]
    );

    return {
        tableLayoutRef,
        handleColumnResizeStart,
        handleColumnAutoFit,
        isColumnResizing,
    };
};

export default useAddTorrentFileTableLayout;
