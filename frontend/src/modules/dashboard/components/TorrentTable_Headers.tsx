import React from "react";
import { SortableContext } from "@dnd-kit/sortable";
import type { HeaderGroup, Table } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableHeadersViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";
import { cn } from "@heroui/react";
import {
    TableHeaderContent,
    getColumnWidthCss,
} from "@/modules/dashboard/components/TorrentTable_Shared";
import { PANEL_SHADOW } from "@/shared/ui/layout/glass-surface";
import { horizontalListSortingStrategy } from "@dnd-kit/sortable";
import TorrentTable_Header from "@/modules/dashboard/components/TorrentTable_Header";

type TorrentTableHeader = ReturnType<Table<Torrent>["getFlatHeaders"]>[number];

// Header rendering for the torrent table.
// Extracted from `TorrentTable.tsx` and made props-driven to avoid
// referencing outer-scope variables directly.

export const ColumnHeaderPreview = ({
    header,
    isAnimationSuppressed: isAnimationSuppressed = false,
}: {
    header: TorrentTableHeader;
    isAnimationSuppressed?: boolean;
}) => {
    const { column } = header;
    return (
        <div
            className={cn(
                "relative flex h-row items-center border-r border-content1/10 bg-content1/90 px-(--p-tight) transition-all",
                PANEL_SHADOW,
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

export interface TorrentTableHeadersProps {
    viewModel: TorrentTableHeadersViewModel;
}

export const TorrentTable_Headers: React.FC<TorrentTableHeadersProps> = ({
    viewModel,
}) => {
    const {
        headerContainerClass,
        handlers: {
            handleHeaderContainerContextMenu,
            handleHeaderContextMenu,
            handleColumnAutoFitRequest,
            handleColumnResizeStart,
        },
        table: { headerSortableIds, tableApi, getTableTotalWidthCss },
        state: {
            columnSizingInfo,
            hookActiveResizeColumnId,
            isAnimationSuppressed,
        },
    } = viewModel;
    return (
        <div
            className={headerContainerClass}
            onContextMenu={handleHeaderContainerContextMenu}
        >
            <SortableContext
                items={headerSortableIds}
                strategy={horizontalListSortingStrategy}
            >
                {tableApi
                    .getHeaderGroups()
                    .map((headerGroup: HeaderGroup<Torrent>) => (
                        <div
                            key={headerGroup.id}
                            className="flex w-full min-w-max"
                            style={{
                                width: getTableTotalWidthCss(
                                    tableApi.getTotalSize(),
                                ),
                            }}
                        >
                            {headerGroup.headers.map(
                                (header: TorrentTableHeader) => (
                                    <TorrentTable_Header
                                        key={header.id}
                                        header={header}
                                        isAnimationSuppressed={
                                            isAnimationSuppressed
                                        }
                                        onContextMenu={(e: React.MouseEvent) =>
                                            handleHeaderContextMenu(
                                                e,
                                                header.column.id,
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
                                ),
                            )}
                        </div>
                    ))}
            </SortableContext>
        </div>
    );
};

export default TorrentTable_Headers;
