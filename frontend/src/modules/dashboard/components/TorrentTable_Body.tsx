import React from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { TorrentTableBodyViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Skeleton } from "@heroui/react";
import TorrentTable_Row from "@/modules/dashboard/components/TorrentTable_Row";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import {
    TABLE_VIEW_CLASS,
} from "@/shared/ui/layout/glass-surface";
import {
    getTableTotalWidthCss,
    TableCellContent,
} from "@/modules/dashboard/components/TorrentTable_Shared";

export interface TorrentTableBodyProps {
    viewModel: TorrentTableBodyViewModel;
}

export const TorrentTable_Body: React.FC<TorrentTableBodyProps> = (props) => {
    const { viewModel } = props;
    const { parentRef } = viewModel.refs;
    const {
        isLoading,
        hasSourceTorrents,
        visibleRowCount,
        tableLayout,
        rowHeight,
        marqueeRect,
    } = viewModel.data;
    const { emptyHint, emptyHintSubtext, noResults, headerName, headerSpeed } =
        viewModel.labels;
    const {
        rowSensors,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
        renderOverlayPortal,
        overlayClassName,
    } = viewModel.dnd;
    const { rowIds, rowVirtualizer, rows, tableApi, activeDragRow } =
        viewModel.table;
    const { contextMenuTorrentId } = viewModel.rowInteraction;
    const { highlightedRowId } = viewModel.state;
    const showSkeleton = isLoading && !hasSourceTorrents;
    const showEmptyState = !isLoading && !hasSourceTorrents;
    const showNoResultsState =
        !isLoading && hasSourceTorrents && visibleRowCount === 0;

    return (
        <div
            ref={parentRef}
            className={TABLE_VIEW_CLASS.bodyScroll}
            style={TABLE_VIEW_CLASS.bodyScrollStyle}
        >
            {showSkeleton ? (
                <div className={TABLE_VIEW_CLASS.loadingRoot}>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={i}
                            className={TABLE_VIEW_CLASS.loadingRow}
                            style={{
                                height: tableLayout.rowHeight,
                            }}
                        >
                            <div className={TABLE_VIEW_CLASS.loadingSkeletonWrap}>
                                <Skeleton className={TABLE_VIEW_CLASS.loadingSkeleton} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : showEmptyState ? (
                <div className={TABLE_VIEW_CLASS.emptyRoot}>
                    <div
                        className={TABLE_VIEW_CLASS.emptyHintRow}
                        style={TABLE_VIEW_CLASS.emptyHintTrackingStyle}
                    >
                        <StatusIcon
                            Icon={FileUp}
                            size="lg"
                            className={TABLE_VIEW_CLASS.emptyIcon}
                        />
                        <span>{emptyHint}</span>
                    </div>
                    <p
                        className={TABLE_VIEW_CLASS.emptySubtext}
                        style={TABLE_VIEW_CLASS.emptySubtextTrackingStyle}
                    >
                        {emptyHintSubtext}
                    </p>
                    <div className={TABLE_VIEW_CLASS.emptyPreview}>
                        <div
                            className={TABLE_VIEW_CLASS.emptyHintRow}
                            style={TABLE_VIEW_CLASS.emptyHintTrackingStyle}
                        >
                            <span className={TABLE_VIEW_CLASS.emptyBar} />
                            <span>{headerName}</span>
                            <span>{headerSpeed}</span>
                        </div>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                key={index}
                                className={TABLE_VIEW_CLASS.emptyPreviewRow}
                            >
                                <span className={TABLE_VIEW_CLASS.emptyBar} />
                                <span className={TABLE_VIEW_CLASS.emptyBar} />
                                <span className={TABLE_VIEW_CLASS.emptyBar} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : showNoResultsState ? (
                <div className={TABLE_VIEW_CLASS.noResults}>
                    {noResults}
                </div>
            ) : (
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={rowSensors}
                    onDragStart={handleRowDragStart}
                    onDragEnd={handleRowDragEnd}
                    onDragCancel={handleRowDragCancel}
                >
                    <SortableContext
                        items={rowIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <div
                            className={TABLE_VIEW_CLASS.bodyCanvas}
                            style={{
                                height: rowVirtualizer.getTotalSize(),
                                width: getTableTotalWidthCss(
                                    tableApi.getTotalSize(),
                                ),
                            }}
                        >
                            {rowVirtualizer
                                .getVirtualItems()
                                .map((virtualRow: VirtualItem) => {
                                    const row = rows[virtualRow.index];

                                    return (
                                        <TorrentTable_Row
                                            key={row.id}
                                            row={row}
                                            virtualRow={virtualRow}
                                            isSelected={row.getIsSelected()}
                                            isContext={
                                                contextMenuTorrentId ===
                                                row.original.id
                                            }
                                            isHighlighted={
                                                highlightedRowId === row.id &&
                                                !row.getIsSelected()
                                            }
                                            interaction={
                                                viewModel.rowInteraction
                                            }
                                            state={viewModel.state}
                                        />
                                    );
                                })}
                        </div>
                    </SortableContext>
                    {renderOverlayPortal(
                        <DragOverlay
                            adjustScale={false}
                            dropAnimation={null}
                            className={overlayClassName}
                        >
                            {activeDragRow ? (
                                <div
                                    style={{
                                        width: getTableTotalWidthCss(
                                            tableApi.getTotalSize(),
                                        ),
                                        height: rowHeight,
                                    }}
                                    className={TABLE_VIEW_CLASS.dragOverlay}
                                >
                                    <div className={TABLE_VIEW_CLASS.dragOverlayContent}>
                                        {activeDragRow
                                            .getVisibleCells()
                                            .map((cell) => (
                                                <TableCellContent
                                                    key={cell.id}
                                                    cell={cell}
                                                />
                                            ))}
                                    </div>
                                </div>
                            ) : null}
                        </DragOverlay>,
                    )}
                </DndContext>
            )}

            {marqueeRect && (
                <div
                    aria-hidden="true"
                    className={TABLE_VIEW_CLASS.marquee}
                    style={{
                        left: marqueeRect.left,
                        top: marqueeRect.top,
                        width: marqueeRect.width,
                        height: marqueeRect.height,
                    }}
                />
            )}
        </div>
    );
};

export default TorrentTable_Body;
