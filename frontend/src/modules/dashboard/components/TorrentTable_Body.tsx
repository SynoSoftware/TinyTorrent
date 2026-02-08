import React from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { TorrentTableBodyViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";
import {
    DndContext,
    DragOverlay,
    closestCenter,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn, Skeleton } from "@heroui/react";
import TorrentTable_Row from "@/modules/dashboard/components/TorrentTable_Row";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { PANEL_SHADOW } from "@/shared/ui/layout/glass-surface";
import { getTableTotalWidthCss } from "@/modules/dashboard/components/TorrentTable_Shared";

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
    const {
        rowIds,
        rowVirtualizer,
        rows,
        tableApi,
        renderVisibleCells,
        activeDragRow,
    } = viewModel.table;
    const {
        contextMenuTorrentId,
    } = viewModel.rowInteraction;
    const {
        highlightedRowId,
    } = viewModel.state;
    const showSkeleton = isLoading && !hasSourceTorrents;
    const showEmptyState = !isLoading && !hasSourceTorrents;
    const showNoResultsState = !isLoading && hasSourceTorrents && visibleRowCount === 0;

    return (
        <div
            ref={parentRef}
            className="relative flex-1 h-full min-h-0 overflow-y-auto w-full overlay-scrollbar"
            style={{ scrollbarGutter: "stable" }}
        >
            {showSkeleton ? (
                <div className="w-full">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center w-full border-b border-content1/5 px-panel"
                            style={{
                                height: tableLayout.rowHeight,
                            }}
                        >
                            <div className="w-full h-indicator">
                                <Skeleton className="h-full w-full rounded-md bg-content1/10" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : showEmptyState ? (
                <div className="h-full flex flex-col items-center justify-center gap-stage px-stage text-foreground/60">
                    <div
                        className="flex items-center gap-tools text-xs font-semibold uppercase text-foreground/60"
                        style={{
                            letterSpacing: "var(--tt-tracking-ultra)",
                        }}
                    >
                        <StatusIcon
                            Icon={FileUp}
                            size="lg"
                            className="text-primary"
                        />
                        <span>{emptyHint}</span>
                    </div>
                    <p
                        className="text-scaled uppercase text-foreground/40"
                        style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                    >
                        {emptyHintSubtext}
                    </p>
                    <div className="w-full max-w-3xl space-y-tight">
                        <div
                            className="flex items-center gap-tools text-xs font-semibold uppercase text-foreground/60"
                            style={{
                                letterSpacing: "var(--tt-tracking-ultra)",
                            }}
                        >
                            <span className="h-indicator w-full rounded-full bg-content1/20" />
                            <span>{headerName}</span>
                            <span>{headerSpeed}</span>
                        </div>
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                key={index}
                                className="grid grid-cols-torrent gap-tools rounded-2xl bg-content1/10 px-panel py-panel"
                            >
                                <span className="h-indicator w-full rounded-full bg-content1/20" />
                                <span className="h-indicator w-full rounded-full bg-content1/20" />
                                <span className="h-indicator w-full rounded-full bg-content1/20" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : showNoResultsState ? (
                <div className="h-full flex items-center justify-center px-stage text-scaled uppercase text-foreground/50">
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
                            className="relative w-full min-w-max"
                            style={{
                                height: rowVirtualizer.getTotalSize(),
                                width: getTableTotalWidthCss(
                                    tableApi.getTotalSize()
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
                                            interaction={viewModel.rowInteraction}
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
                                            tableApi.getTotalSize()
                                        ),
                                        height: rowHeight,
                                    }}
                                    className={cn(
                                        "pointer-events-none border border-content1/20 bg-background/90 backdrop-blur-3xl px-panel box-border",
                                        PANEL_SHADOW
                                    )}
                                >
                                    <div className="flex h-full w-full items-center">
                                        {renderVisibleCells(activeDragRow)}
                                    </div>
                                </div>
                            ) : null}
                        </DragOverlay>
                    )}
                </DndContext>
            )}

            {marqueeRect && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-(--r-sm) border border-primary/60 bg-primary/20"
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
