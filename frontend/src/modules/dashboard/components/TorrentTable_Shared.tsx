/* eslint-disable react-refresh/only-export-components */
import React, { memo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
    flexRender, type Row, type Table, } from "@tanstack/react-table";
import { cn } from "@heroui/react";
import { registry } from "@/config/logic";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { DashboardTableMeta } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
const { visuals } = registry;

type TorrentTableHeader = ReturnType<Table<Torrent>["getFlatHeaders"]>[number];
type TorrentTableCell = ReturnType<Row<Torrent>["getVisibleCells"]>[number];

const getOptimisticSignature = (cell: TorrentTableCell) => {
    const meta = cell.getContext().table.options.meta as
        | DashboardTableMeta
        | undefined;
    const optimistic = meta?.optimisticStatuses[cell.row.id];
    return `${optimistic?.state ?? ""}|${optimistic?.operation ?? ""}`;
};

const areSimpleCellInputsEqual = (
    columnId: string,
    previous: Torrent,
    next: Torrent,
) => {
    switch (columnId) {
        case "name":
            return (
                previous.name === next.name &&
                previous.errorString === next.errorString &&
                previous.state === next.state
            );
        case "queue":
            return previous.queuePosition === next.queuePosition;
        case "peers":
            return (
                previous.peerSummary.connected === next.peerSummary.connected &&
                previous.peerSummary.getting === next.peerSummary.getting &&
                previous.peerSummary.sending === next.peerSummary.sending &&
                previous.peerSummary.seeds === next.peerSummary.seeds
            );
        case "size":
            return previous.totalSize === next.totalSize;
        case "ratio":
            return (
                previous.ratio === next.ratio &&
                previous.uploaded === next.uploaded &&
                previous.downloaded === next.downloaded
            );
        case "added":
            return previous.added === next.added;
        case "eta":
            return (
                previous.eta === next.eta &&
                previous.state === next.state &&
                previous.error === next.error &&
                previous.errorString === next.errorString
            );
        case "progress":
            return (
                previous.progress === next.progress &&
                previous.verificationProgress === next.verificationProgress &&
                previous.totalSize === next.totalSize &&
                previous.sizeWhenDone === next.sizeWhenDone &&
                previous.metadataPercentComplete === next.metadataPercentComplete &&
                previous.isFinished === next.isFinished &&
                previous.state === next.state
            );
        default:
            return false;
    }
};

const areCellRenderInputsEqual = (
    previousCell: TorrentTableCell,
    nextCell: TorrentTableCell,
) => {
    const columnId = nextCell.column.id;
    const previousTorrent = previousCell.row.original;
    const nextTorrent = nextCell.row.original;

    if (
        columnId === "status" ||
        columnId === "health" ||
        columnId === "speed"
    ) {
        return (
            previousTorrent === nextTorrent &&
            getOptimisticSignature(previousCell) ===
                getOptimisticSignature(nextCell)
        );
    }

    return areSimpleCellInputsEqual(columnId, previousTorrent, nextTorrent);
};

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
        void layoutEnabled;
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
            </div>
        );
    },
    (prev, next) =>
        prev.isMeasurement === next.isMeasurement &&
        prev.useBaseClass === next.useBaseClass &&
        prev.layoutEnabled === next.layoutEnabled &&
        prev.showSortIcon === next.showSortIcon &&
        prev.header.id === next.header.id &&
        prev.header.column.getSize() === next.header.column.getSize() &&
        prev.header.column.getIsSorted() === next.header.column.getIsSorted()
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
    },
    (prev, next) =>
        prev.isMeasurement === next.isMeasurement &&
        prev.cell.id === next.cell.id &&
        prev.cell.column.id === next.cell.column.id &&
        prev.cell.column.getSize() === next.cell.column.getSize() &&
        prev.cell.row.id === next.cell.row.id &&
        areCellRenderInputsEqual(prev.cell, next.cell)
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


