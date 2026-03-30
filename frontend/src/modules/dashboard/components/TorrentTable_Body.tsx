import React from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { TorrentTableBodyViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Skeleton } from "@heroui/react";
import TorrentTable_Row from "@/modules/dashboard/components/TorrentTable_Row";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { table } from "@/shared/ui/layout/glass-surface";
import { getTableTotalWidthCss, TableCellContent } from "@/modules/dashboard/components/TorrentTable_Shared";

export interface TorrentTableBodyProps {
    viewModel: TorrentTableBodyViewModel;
}

export const TorrentTable_Body: React.FC<TorrentTableBodyProps> = (props) => {
    const { viewModel } = props;
    const { parentRef } = viewModel.refs;
    const { isLoading, hasSourceTorrents, visibleRowCount, tableLayout, rowHeight, marqueeRect } = viewModel.data;
    const { emptyHint, emptyHintSubtext, noResults, headerName, headerSpeed, dragOverlaySummary } = viewModel.labels;
    const {
        rowSensors,
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
        renderOverlayPortal,
        overlayClassName,
    } = viewModel.dnd;
    const { rowIds, rowVirtualizer, rows, tableApi, activeDragRow, activeDragPreviewRows } = viewModel.table;
    const { contextMenuTorrentId } = viewModel.rowInteraction;
    const showSkeleton = isLoading && !hasSourceTorrents;
    const showEmptyState = !isLoading && !hasSourceTorrents;
    const showNoResultsState = !isLoading && hasSourceTorrents && visibleRowCount === 0;
    const overlayRows = activeDragPreviewRows.slice(0, 3);
    const overlayStackOffset = 8;
    const overlayHeight = rowHeight + Math.max(0, overlayRows.length - 1) * overlayStackOffset;

    return (
        <div ref={parentRef} className={table.bodyScroll} style={table.bodyScrollStyle}>
            {showSkeleton ? (
                <div className={table.loadingRoot}>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={i}
                            className={table.loadingRow}
                            style={{
                                height: tableLayout.rowHeight,
                            }}
                        >
                            <div className={table.loadingSkeletonWrap}>
                                <Skeleton className={table.loadingSkeleton} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : showEmptyState ? (
                <div className={table.emptyRoot}>
                    <div className={table.emptyHintRow} style={table.emptyHintTrackingStyle}>
                        <StatusIcon Icon={FileUp} size="lg" className={table.emptyIcon} />
                        <span>{emptyHint}</span>
                    </div>
                    <p className={table.emptySubtext} style={table.emptySubtextTrackingStyle}>
                        {emptyHintSubtext}
                    </p>
                    <div className={table.emptyPreview}>
                        <div className={table.emptyHintRow} style={table.emptyHintTrackingStyle}>
                            <span className={table.emptyBar} />
                            <span>{headerName}</span>
                            <span>{headerSpeed}</span>
                        </div>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className={table.emptyPreviewRow}>
                                <span className={table.emptyBar} />
                                <span className={table.emptyBar} />
                                <span className={table.emptyBar} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : showNoResultsState ? (
                <div className={table.noResults}>{noResults}</div>
            ) : (
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={rowSensors}
                    onDragStart={handleRowDragStart}
                    onDragOver={handleRowDragOver}
                    onDragEnd={handleRowDragEnd}
                    onDragCancel={handleRowDragCancel}
                >
                    <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                        <div
                            className={table.bodyCanvas}
                            style={{
                                height: rowVirtualizer.getTotalSize(),
                                width: getTableTotalWidthCss(tableApi.getTotalSize()),
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                                const row = rows[virtualRow.index];

                                return (
                                    <TorrentTable_Row
                                        key={row.id}
                                        row={row}
                                        virtualRow={virtualRow}
                                        isSelected={row.getIsSelected()}
                                        isContext={contextMenuTorrentId === row.original.id}
                                        interaction={viewModel.rowInteraction}
                                        state={viewModel.state}
                                    />
                                );
                            })}
                        </div>
                    </SortableContext>
                    {renderOverlayPortal(
                        <DragOverlay adjustScale={false} dropAnimation={null} className={overlayClassName}>
                            {activeDragRow ? (
                                <div
                                    style={{
                                        width: getTableTotalWidthCss(tableApi.getTotalSize()),
                                        height: overlayHeight,
                                    }}
                                    className={table.dragOverlayStack}
                                >
                                    {overlayRows
                                        .slice()
                                        .reverse()
                                        .map((row, index) => {
                                            const layerIndex = overlayRows.length - index - 1;
                                            const isFrontLayer = layerIndex === 0;

                                            return (
                                                <div
                                                    key={row.id}
                                                    style={{
                                                        height: rowHeight,
                                                        top: layerIndex * overlayStackOffset,
                                                    }}
                                                    className={
                                                        isFrontLayer ? table.dragOverlay : table.dragOverlayGhost
                                                    }
                                                >
                                                    <div className={table.dragOverlayContent}>
                                                        {row.getVisibleCells().map((cell) => (
                                                            <TableCellContent key={cell.id} cell={cell} />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    {activeDragPreviewRows.length > 1 && (
                                        <div className={table.dragOverlayBadge}>{dragOverlaySummary}</div>
                                    )}
                                </div>
                            ) : null}
                        </DragOverlay>,
                    )}
                </DndContext>
            )}

            {marqueeRect && (
                <div
                    aria-hidden="true"
                    className={table.marquee}
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
