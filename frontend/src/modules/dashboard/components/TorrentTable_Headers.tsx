import React from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp } from "lucide-react";
import type {
    Header,
    Table,
    Column,
    HeaderGroup,
    ColumnSizingInfoState,
} from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
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
    isAnimationSuppressed: isAnimationSuppressed = false,
}: {
    header: Header<Torrent, unknown>;
    isAnimationSuppressed?: boolean;
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
                layoutEnabled={!isAnimationSuppressed}
            />
        </div>
    );
};

interface Props {
    headerContainerClass: string;
    handleHeaderContainerContextMenu: (
        e: React.MouseEvent<HTMLDivElement>
    ) => void;
    headerSortableIds: string[];
    table: Table<Torrent>;
    getTableTotalWidthCss: (n: number) => string;
    handleHeaderContextMenu: (e: React.MouseEvent, id: string | null) => void;
    handleColumnAutoFitRequest: (c: Column<Torrent>) => void;
    handleColumnResizeStart: (c: Column<Torrent>, clientX: number) => void;
    columnSizingInfo: ColumnSizingInfoState;
    hookActiveResizeColumnId: string | null;
    isAnimationSuppressed?: boolean;
}

export const TorrentTable_Headers: React.FC<
    Props & { isAnimationSuppressed?: boolean }
> = ({
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
    isAnimationSuppressed: isAnimationSuppressed,
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
                {table
                    .getHeaderGroups()
                    .map((headerGroup: HeaderGroup<Torrent>) => (
                        <div
                            key={headerGroup.id}
                            className="flex w-full min-w-max"
                            style={{
                                width: getTableTotalWidthCss(
                                    table.getTotalSize()
                                ),
                            }}
                        >
                            {headerGroup.headers.map(
                                (header: Header<Torrent, unknown>) => (
                                    <TorrentTable_Header
                                        key={header.id}
                                        header={header}
                                        isAnimationSuppressed={
                                            isAnimationSuppressed
                                        }
                                        onContextMenu={(e: React.MouseEvent) =>
                                            handleHeaderContextMenu(
                                                e,
                                                header.column.id
                                            )
                                        }
                                        onAutoFitColumn={
                                            handleColumnAutoFitRequest
                                        }
                                        onResizeStart={handleColumnResizeStart}
                                        isResizing={
                                            columnSizingInfo.isResizingColumn ===
                                                header.column.id ||
                                            hookActiveResizeColumnId ===
                                                header.column.id
                                        }
                                    />
                                )
                            )}
                        </div>
                    ))}
            </SortableContext>
        </div>
    );
};

export default TorrentTable_Headers;
