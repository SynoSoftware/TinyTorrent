import React from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@heroui/react";
import { TableHeaderContent, getColumnWidthCss } from "./TorrentTable_Shared";
import { PANEL_SHADOW } from "@/shared/ui/layout/glass-surface";
import { horizontalListSortingStrategy } from "@dnd-kit/sortable";
import TorrentTable_Header from "./TorrentTable_Header";

// Header rendering for the torrent table.
// Extracted from `TorrentTable.tsx` and made props-driven to avoid
// referencing outer-scope variables directly.

export const ColumnHeaderPreview = ({
    header,
    isAnyColumnResizing = false,
}: {
    header: any;
    isAnyColumnResizing?: boolean;
}) => {
    const { column } = header;
    const align = column.columnDef.meta?.align || "start";
    const isSelection = header.id.toString() === "selection";
    const sortState = column.getIsSorted();
    const SortArrowIcon = sortState === "desc" ? ArrowDown : ArrowUp;
    const sortArrowOpacity = sortState ? "opacity-100" : "opacity-0";
    return (
        <div
            className={cn(
                "relative flex h-row items-center border-r border-content1/10 bg-content1/90 px-(--p-tight) transition-all",
                PANEL_SHADOW
            )}
            style={{
                width: getColumnWidthCss(column.id, column.getSize()),
                boxSizing: "border-box",
            }}
        >
            <TableHeaderContent
                header={header}
                useBaseClass={true}
                isMeasurement={false}
                layoutEnabled={!isAnyColumnResizing}
            />
        </div>
    );
};

interface Props {
    headerContainerClass: string;
    handleHeaderContainerContextMenu: (e: React.MouseEvent) => void;
    headerSortableIds: string[];
    table: any;
    getTableTotalWidthCss: (n: number) => string;
    handleHeaderContextMenu: (e: React.MouseEvent, id: string | null) => void;
    handleColumnAutoFitRequest: (c: any) => void;
    handleColumnResizeStart: (c: any) => void;
    columnSizingInfo: any;
    hookActiveResizeColumnId: any;
    isAnyColumnResizing: boolean;
}

export const TorrentTable_Headers: React.FC<Props> = ({
    headerContainerClass,
    handleHeaderContainerContextMenu,
    headerSortableIds,
    table,
    getTableTotalWidthCss,
    handleHeaderContextMenu,
    handleColumnAutoFitRequest,
    handleColumnResizeStart,
    columnSizingInfo,
    hookActiveResizeColumnId,
    isAnyColumnResizing,
}) => {
    return (
        <div
            className={headerContainerClass}
            onContextMenu={handleHeaderContainerContextMenu}
        >
            <SortableContext
                items={headerSortableIds}
                strategy={horizontalListSortingStrategy}
            >
                {table.getHeaderGroups().map((headerGroup: any) => (
                    <div
                        key={headerGroup.id}
                        className="flex w-full min-w-max"
                        style={{
                            width: getTableTotalWidthCss(table.getTotalSize()),
                        }}
                    >
                        {headerGroup.headers.map((header: any) => (
                            <TorrentTable_Header
                                key={header.id}
                                header={header}
                                isAnyColumnResizing={isAnyColumnResizing}
                                onContextMenu={(e: React.MouseEvent) =>
                                    handleHeaderContextMenu(e, header.column.id)
                                }
                                onAutoFitColumn={handleColumnAutoFitRequest}
                                onResizeStart={handleColumnResizeStart}
                                isResizing={
                                    columnSizingInfo.isResizingColumn ===
                                        header.column.id ||
                                    hookActiveResizeColumnId ===
                                        header.column.id
                                }
                            />
                        ))}
                    </div>
                ))}
            </SortableContext>
        </div>
    );
};

export default TorrentTable_Headers;
