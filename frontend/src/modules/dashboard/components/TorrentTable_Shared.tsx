import React, { memo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
    flexRender,
    type Header,
    type Cell,
    type Row,
} from "@tanstack/react-table";
import { cn } from "@heroui/react";
import {
    ICON_STROKE_WIDTH_DENSE,
    CELL_BASE_CLASS,
    CELL_PADDING_CLASS,
} from "@/config/logic";
import type { Torrent } from "@/modules/dashboard/types/torrent";

export const toCssVarSafeId = (value: string) =>
    value.replace(/[^a-zA-Z0-9_-]/g, "-");

export const getColumnWidthVarName = (columnId: string) =>
    `--tt-colw-${toCssVarSafeId(columnId)}`;

export const getColumnWidthCss = (columnId: string, fallbackPx: number) =>
    `var(${getColumnWidthVarName(columnId)}, ${fallbackPx}px)`;

export const TABLE_TOTAL_WIDTH_VAR = "--tt-table-total-w";

export const getTableTotalWidthCss = (fallbackPx: number) =>
    `var(${TABLE_TOTAL_WIDTH_VAR}, ${fallbackPx}px)`;

export const MEASURE_HEADER_SELECTOR = "[data-tt-measure-header]";
export const MEASURE_CELL_SELECTOR = "[data-tt-measure-cell]";
export const MEASURE_LAYER_CLASS = "absolute pointer-events-none invisible";

export const TableHeaderContent = memo(
    ({
        header,
        isMeasurement = false,
    }: {
        header: Header<Torrent, unknown>;
        isMeasurement?: boolean;
    }) => {
        const { column } = header;
        const align = column.columnDef.meta?.align || "start";
        const isSelection = header.id.toString() === "selection";
        const sortState = column.getIsSorted();
        const SortArrowIcon = sortState === "desc" ? ArrowDown : ArrowUp;
        const sortArrowOpacity = sortState ? "opacity-100" : "opacity-0";
        return (
            <div
                {...(isMeasurement
                    ? { ["data-tt-measure-header"]: column.id }
                    : {})}
                className={cn(
                    CELL_BASE_CLASS,
                    "gap-tools text-scaled font-bold uppercase text-foreground/60",
                    CELL_PADDING_CLASS,
                    align === "center" && "justify-center",
                    align === "end" && "justify-end",
                    isSelection && "justify-center"
                )}
                style={{
                    letterSpacing: "var(--tt-tracking-tight)",
                    width: isMeasurement
                        ? "max-content"
                        : getColumnWidthCss(column.id, column.getSize()),
                    boxSizing: "border-box",
                }}
            >
                {flexRender(column.columnDef.header, header.getContext())}
                <SortArrowIcon
                    strokeWidth={ICON_STROKE_WIDTH_DENSE}
                    className={cn(
                        "text-primary shrink-0 toolbar-icon-size-sm",
                        sortArrowOpacity
                    )}
                />
            </div>
        );
    }
);

export const TableCellContent = memo(
    ({
        cell,
        isMeasurement = false,
    }: {
        cell: Cell<Torrent, unknown>;
        isMeasurement?: boolean;
    }) => {
        const align = cell.column.columnDef.meta?.align || "start";
        const isSelection = cell.column.id === "selection";
        return (
            <div
                {...(isMeasurement
                    ? { ["data-tt-measure-cell"]: cell.column.id }
                    : {})}
                className={cn(
                    CELL_BASE_CLASS,
                    CELL_PADDING_CLASS,
                    align === "center" && "justify-center",
                    align === "end" && "justify-end",
                    isSelection && "justify-center"
                )}
                style={{
                    width: isMeasurement
                        ? "max-content"
                        : getColumnWidthCss(
                              cell.column.id,
                              cell.column.getSize()
                          ),
                    boxSizing: "border-box",
                }}
            >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                <div
                    aria-hidden="true"
                    style={{
                        width: "var(--tt-resize-handle-w)",
                        flexShrink: 0,
                    }}
                />
            </div>
        );
    }
);

export const ColumnMeasurementLayer = memo(
    ({
        headers,
        rows,
        measureLayerRef,
    }: {
        headers: Header<Torrent, unknown>[];
        rows: Row<Torrent>[];
        measureLayerRef: React.RefObject<HTMLDivElement | null>;
    }) => {
        return (
            <div
                ref={measureLayerRef}
                aria-hidden="true"
                className={MEASURE_LAYER_CLASS}
            >
                <div className="flex">
                    {headers.map((header) => (
                        <TableHeaderContent
                            key={header.id}
                            header={header}
                            isMeasurement
                        />
                    ))}
                </div>
                {rows.map((row) => (
                    <div key={row.id} className="flex">
                        {row.getVisibleCells().map((cell) => (
                            <TableCellContent
                                key={cell.id}
                                cell={cell}
                                isMeasurement
                            />
                        ))}
                    </div>
                ))}
            </div>
        );
    }
);
