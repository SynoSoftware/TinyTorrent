import React from "react";
import type { Row } from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type { SensorDescriptor } from "@dnd-kit/core";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    DndContext,
    DragOverlay,
    closestCenter,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn, Skeleton } from "@heroui/react";
import TorrentTable_Row from "./TorrentTable_Row";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { PANEL_SHADOW } from "@/shared/ui/layout/glass-surface";
import { getTableTotalWidthCss } from "./TorrentTable_Shared";

// Props mirror the variables previously used inline in TorrentTable.tsx
type RowVirtualizerShape = Virtualizer<any, Element>;

export interface TorrentTableBodyProps {
    parentRef: React.RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    torrents: Torrent[];
    TABLE_LAYOUT: { rowHeight: number | string; overscan: number };
    // numeric row height (from useLayoutMetrics) to keep virtualization and
    // visual components perfectly aligned.
    rowHeight: number;
    t: (key: string, opts?: Record<string, unknown>) => string;
    ADD_TORRENT_SHORTCUT: string;
    rowSensors: SensorDescriptor<any>[];
    handleRowDragStart: (e: DragStartEvent) => void;
    handleRowDragEnd: (e: DragEndEvent) => void;
    handleRowDragCancel: () => void;
    rowIds: string[];
    rowVirtualizer: RowVirtualizerShape;
    rows: Row<Torrent>[];
    table: { getTotalSize: () => number };
    renderVisibleCells: (row: Row<Torrent>) => React.ReactNode;
    activeDragRow?: Row<Torrent> | null;
    renderOverlayPortal: (node: React.ReactNode) => React.ReactNode;
    DND_OVERLAY_CLASSES: string;
    contextMenu?: { torrent: { id: string } } | null;
    handleRowClick: (e: React.MouseEvent, rowId: string, index: number) => void;
    handleRowDoubleClick: (row: Torrent) => void;
    handleContextMenu: (e: React.MouseEvent, row: Torrent) => void;
    canReorderQueue: boolean;
    dropTargetRowId?: string | null;
    activeRowId?: string | null;
    highlightedRowId?: string | null;
    handleDropTargetChange: (id: string | null) => void;
    isAnyColumnResizing: boolean;
    /** True while the table container is actively being resized (panel/window) */
    isTableResizing?: boolean;
    columnOrder: string[];
    suppressLayoutAnimations: boolean;
    isColumnOrderChanging: boolean;
    marqueeRect?: {
        left: number;
        top: number;
        width: number;
        height: number;
    } | null;
}

export const TorrentTable_Body: React.FC<TorrentTableBodyProps> = (props) => {
    const {
        parentRef,
        isLoading,
        torrents,
        TABLE_LAYOUT,
        t,
        ADD_TORRENT_SHORTCUT,
        rowSensors,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragCancel,
        rowIds,
        rowVirtualizer,
        rows,
        table,
        renderVisibleCells,
        activeDragRow,
        renderOverlayPortal,
        DND_OVERLAY_CLASSES,
        contextMenu,
        handleRowClick,
        handleRowDoubleClick,
        handleContextMenu,
        canReorderQueue,
        dropTargetRowId,
        activeRowId,
        highlightedRowId,
        handleDropTargetChange,
        isAnyColumnResizing,
        isTableResizing,
        columnOrder,
        suppressLayoutAnimations,
        isColumnOrderChanging,
        marqueeRect,
        rowHeight,
    } = props;

    return (
        <div
            ref={parentRef}
            className="relative flex-1 h-full min-h-0 overflow-y-auto w-full overlay-scrollbar"
        >
            {isLoading && torrents.length === 0 ? (
                <div className="w-full">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center w-full border-b border-content1/5 px-panel"
                            style={{
                                height: TABLE_LAYOUT.rowHeight,
                            }}
                        >
                            <div className="w-full h-indicator">
                                <Skeleton className="h-full w-full rounded-md bg-content1/10" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : torrents.length === 0 ? (
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
                        <span>
                            {t("table.empty_hint", {
                                shortcut: ADD_TORRENT_SHORTCUT,
                            })}
                        </span>
                    </div>
                    <p
                        className="text-scaled uppercase text-foreground/40"
                        style={{ letterSpacing: "var(--tt-tracking-wide)" }}
                    >
                        {t("table.empty_hint_subtext")}
                    </p>
                    <div className="w-full max-w-3xl space-y-tight">
                        <div
                            className="flex items-center gap-tools text-xs font-semibold uppercase text-foreground/60"
                            style={{
                                letterSpacing: "var(--tt-tracking-ultra)",
                            }}
                        >
                            <span className="h-indicator w-full rounded-full bg-content1/20" />
                            <span>{t("table.header_name")}</span>
                            <span>{t("table.header_speed")}</span>
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
                                    table.getTotalSize()
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
                                                contextMenu?.torrent.id ===
                                                row.original.id
                                            }
                                            onClick={handleRowClick}
                                            onDoubleClick={handleRowDoubleClick}
                                            onContextMenu={handleContextMenu}
                                            isQueueSortActive={canReorderQueue}
                                            dropTargetRowId={dropTargetRowId}
                                            activeRowId={activeRowId}
                                            isHighlighted={
                                                highlightedRowId === row.id &&
                                                !row.getIsSelected()
                                            }
                                            onDropTargetChange={
                                                handleDropTargetChange
                                            }
                                            isAnyColumnResizing={
                                                isAnyColumnResizing
                                            }
                                            columnOrder={columnOrder}
                                            suppressLayoutAnimations={
                                                suppressLayoutAnimations ||
                                                isColumnOrderChanging
                                            }
                                            isTableResizing={isTableResizing}
                                        />
                                    );
                                })}
                        </div>
                    </SortableContext>
                    {renderOverlayPortal(
                        <DragOverlay
                            adjustScale={false}
                            dropAnimation={null}
                            className={DND_OVERLAY_CLASSES}
                        >
                            {activeDragRow ? (
                                <div
                                    style={{
                                        width: getTableTotalWidthCss(
                                            table.getTotalSize()
                                        ),
                                        height: rowHeight,
                                    }}
                                    className={cn(
                                        "pointer-events-none border border-content1/20 bg-background/90 backdrop-blur-3xl",
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
