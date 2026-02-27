/* eslint-disable react-refresh/only-export-components */
import React, { memo } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
    flexRender, type Row, type Table, } from "@tanstack/react-table";
import { cn } from "@heroui/react";
import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
const { layout, visuals } = registry;

type TorrentTableHeader = ReturnType<Table<Torrent>["getFlatHeaders"]>[number];
type TorrentTableCell = ReturnType<Row<Torrent>["getVisibleCells"]>[number];

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
export const MEASURE_LAYER_CLASS = visuals.table.cellClass.measureLayer;

export const TableHeaderContent = memo(
    ({
        header,
        isMeasurement = false,
        useBaseClass = true,
        layoutEnabled = true,
        showSortIcon = true,
    }: {
        header: TorrentTableHeader;
        isMeasurement?: boolean;
        useBaseClass?: boolean;
        layoutEnabled?: boolean;
        showSortIcon?: boolean;
    }) => {
        const { column } = header;
        const align = column.columnDef.meta?.align || "start";
        const isSelection = header.id.toString() === "selection";
        const sortState = column.getIsSorted();
        const SortArrowIcon = sortState === "desc" ? ArrowDown : ArrowUp;
        const sortArrowOpacity = sortState ? "opacity-100" : "opacity-0";
        return (
            <motion.div
                {...(isMeasurement
                    ? { ["data-tt-measure-header"]: column.id }
                    : {})}
                layout={
                    isMeasurement ? false : layoutEnabled ? "position" : false
                }
                className={cn(
                    useBaseClass && visuals.table.cellBaseClass,
                    visuals.table.cellClass.headerLabel,
                    visuals.table.cellPaddingClass,
                    align === "center" && visuals.table.cellClass.alignCenter,
                    align === "end" && visuals.table.cellClass.alignEnd,
                    isSelection && visuals.table.cellClass.alignCenter
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
                {useBaseClass && showSortIcon && (
                    <SortArrowIcon
                        strokeWidth={visuals.icon.strokeWidthDense}
                        className={cn(
                            visuals.table.cellClass.sortIcon,
                            sortArrowOpacity
                        )}
                    />
                )}
            </motion.div>
        );
    }
);

export const TableCellContent = memo(
    ({
        cell,
        isMeasurement = false,
    }: {
        cell: TorrentTableCell;
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
                    visuals.table.cellBaseClass,
                    visuals.table.cellPaddingClass,
                    align === "center" && visuals.table.cellClass.alignCenter,
                    align === "end" && visuals.table.cellClass.alignEnd,
                    isSelection && visuals.table.cellClass.alignCenter
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
        headers: TorrentTableHeader[];
        rows: Row<Torrent>[];
        measureLayerRef: React.Ref<HTMLDivElement>;
    }) => {
        return (
            <div
                ref={measureLayerRef}
                aria-hidden="true"
                className={MEASURE_LAYER_CLASS}
            >
                <div className={visuals.table.cellClass.measureRow}>
                    {headers.map((header) => (
                        <TableHeaderContent
                            key={header.id}
                            header={header}
                            isMeasurement
                        />
                    ))}
                </div>
                {rows.map((row) => (
                    <div key={row.id} className={visuals.table.cellClass.measureRow}>
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


