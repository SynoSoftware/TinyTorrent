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
import { TABLE } from "@/shared/ui/layout/glass-surface";
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
    const {
        emptyHint,
        emptyHintSubtext,
        noResults,
        headerName,
        headerSpeed,
        dragOverlaySummary,
    } = viewModel.labels;
    const {
        rowSensors,
        handleRowDragStart,
        handleRowDragOver,
        handleRowDragEnd,
        handleRowDragCancel,
        renderOverlayPortal,
        overlayClassName,
    } = viewModel.dnd;
    const {
        rowIds,
        rowVirtualizer,
        rows,
        tableApi,
        activeDragRow,
        activeDragPreviewRows,
    } = viewModel.table;
    const { contextMenuTorrentId } = viewModel.rowInteraction;
    const showSkeleton = isLoading && !hasSourceTorrents;
    const showEmptyState = !isLoading && !hasSourceTorrents;
    const showNoResultsState =
        !isLoading && hasSourceTorrents && visibleRowCount === 0;
    const overlayRows = activeDragPreviewRows.slice(0, 3);
    const overlayStackOffset = 8;
    const overlayHeight =
        rowHeight +
        Math.max(0, overlayRows.length - 1) * overlayStackOffset;

    return (
        <div
            ref={parentRef}
            className={TABLE.bodyScroll}
            style={TABLE.bodyScrollStyle}
        >
            {showSkeleton ? (
                <div className={TABLE.loadingRoot}>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={i}
                            className={TABLE.loadingRow}
                            style={{
                                height: tableLayout.rowHeight,
                            }}
                        >
                            <div className={TABLE.loadingSkeletonWrap}>
                                <Skeleton className={TABLE.loadingSkeleton} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : showEmptyState ? (
                <div className={TABLE.emptyRoot}>
                    <div
                        className={TABLE.emptyHintRow}
                        style={TABLE.emptyHintTrackingStyle}
                    >
                        <StatusIcon
                            Icon={FileUp}
                            size="lg"
                            className={TABLE.emptyIcon}
                        />
                        <span>{emptyHint}</span>
                    </div>
                    <p
                        className={TABLE.emptySubtext}
                        style={TABLE.emptySubtextTrackingStyle}
                    >
                        {emptyHintSubtext}
                    </p>
                    <div className={TABLE.emptyPreview}>
                        <div
                            className={TABLE.emptyHintRow}
                            style={TABLE.emptyHintTrackingStyle}
                        >
                            <span className={TABLE.emptyBar} />
                            <span>{headerName}</span>
                            <span>{headerSpeed}</span>
                        </div>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className={TABLE.emptyPreviewRow}>
                                <span className={TABLE.emptyBar} />
                                <span className={TABLE.emptyBar} />
                                <span className={TABLE.emptyBar} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : showNoResultsState ? (
                <div className={TABLE.noResults}>{noResults}</div>
            ) : (
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={rowSensors}
                    onDragStart={handleRowDragStart}
                    onDragOver={handleRowDragOver}
                    onDragEnd={handleRowDragEnd}
                    onDragCancel={handleRowDragCancel}
                >
                    <SortableContext
                        items={rowIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <div
                            className={TABLE.bodyCanvas}
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
                                        height: overlayHeight,
                                    }}
                                    className={TABLE.dragOverlayStack}
                                >
                                    {overlayRows
                                        .slice()
                                        .reverse()
                                        .map((row, index) => {
                                            const layerIndex =
                                                overlayRows.length - index - 1;
                                            const isFrontLayer =
                                                layerIndex === 0;

                                            return (
                                                <div
                                                    key={row.id}
                                                    style={{
                                                        height: rowHeight,
                                                        top:
                                                            layerIndex *
                                                            overlayStackOffset,
                                                    }}
                                                    className={
                                                        isFrontLayer
                                                            ? TABLE.dragOverlay
                                                            : TABLE.dragOverlayGhost
                                                    }
                                                >
                                                    <div
                                                        className={
                                                            TABLE.dragOverlayContent
                                                        }
                                                    >
                                                        {row
                                                            .getVisibleCells()
                                                            .map((cell) => (
                                                                <TableCellContent
                                                                    key={cell.id}
                                                                    cell={cell}
                                                                />
                                                            ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    {activeDragPreviewRows.length > 1 && (
                                        <div className={TABLE.dragOverlayBadge}>
                                            {dragOverlaySummary}
                                        </div>
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
                    className={TABLE.marquee}
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
