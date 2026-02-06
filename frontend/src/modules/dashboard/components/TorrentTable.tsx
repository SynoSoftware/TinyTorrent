import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { cn } from "@heroui/react";
import React, {
    useCallback,
    useEffect,
    useMemo,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TABLE_LAYOUT } from "@/config/logic";
import type { TorrentTableViewModel } from "@/app/viewModels/useAppViewModel";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { getEmphasisClassForAction } from "@/shared/utils/recoveryFormat";
import { BLOCK_SHADOW } from "@/shared/ui/layout/glass-surface";
import {
    ColumnMeasurementLayer,
    getTableTotalWidthCss,
} from "./TorrentTable_Shared";
import {
    ColumnHeaderPreview,
    TorrentTable_Headers,
} from "./TorrentTable_Headers";
import TorrentTable_Body from "./TorrentTable_Body";
import TorrentTable_RowMenu from "./TorrentTable_RowMenu";
import TorrentTable_HeaderMenu from "./TorrentTable_HeaderMenu";
import TorrentTable_ColumnSettingsModal from "./TorrentTable_ColumnSettingsModal";
import { useTorrentTableViewModel } from "@/modules/dashboard/viewModels/useTorrentTableViewModel";

const DND_OVERLAY_CLASSES = "pointer-events-none fixed inset-0 z-40";

interface TorrentTableProps {
    viewModel: TorrentTableViewModel;
    embedded?: boolean;
    disableDetailOpen?: boolean;
    onRequestDetails?: (torrent: Torrent) => void;
    onRequestDetailsFullscreen?: (torrent: Torrent) => void;
}

export function TorrentTable({
    viewModel,
    embedded = false,
    disableDetailOpen = false,
    onRequestDetails,
    onRequestDetailsFullscreen,
}: TorrentTableProps) {
    const { t } = useTranslation();
    const tableViewModel = useTorrentTableViewModel({
        viewModel,
        disableDetailOpen,
        onRequestDetails,
        onRequestDetailsFullscreen,
    });

    const {
        refs,
        state,
        table,
        column,
        selection,
        interaction,
        menus,
        labels,
        layout,
        lifecycle,
    } = tableViewModel;

    const overlayPortalHost = useMemo(
        () =>
            typeof document !== "undefined" && document.body
                ? document.body
                : null,
        [],
    );
    const renderOverlayPortal = useCallback(
        (overlay: ReactNode) => {
            if (!overlayPortalHost) return null;
            return createPortal(overlay, overlayPortalHost);
        },
        [overlayPortalHost],
    );

    const headerContainerClass = useMemo(
        () =>
            (cn(
                "flex w-full sticky top-0 z-20 border-b border-content1/20 bg-content1/10 backdrop-blur-sm",
            ) ?? "") as string,
        [],
    );
    const tableShellClass = useMemo(
        () =>
            cn(
                "relative flex-1 h-full min-h-0 flex flex-col overflow-hidden",
                "rounded-panel border border-default/10",
            ),
        [],
    );

    const activeHeader = useMemo(
        () =>
            table.instance
                .getFlatHeaders()
                .find((header) => header.id === state.activeDragHeaderId),
        [state.activeDragHeaderId, table.instance],
    );
    const activeDragRow = state.activeRowId
        ? table.rowsById.get(state.activeRowId) ?? null
        : null;

    useEffect(() => {
        refs.tableContainerRef.current?.focus();
    }, [refs.tableContainerRef]);

    return (
        <>
            <div
                ref={refs.tableContainerRef}
                tabIndex={0}
                onKeyDown={interaction.handleKeyDown}
                onFocus={lifecycle.activateScope}
                onBlur={lifecycle.deactivateScope}
                data-tt-column-resizing={
                    state.isAnyColumnResizing ? "true" : undefined
                }
                data-tt-layout-suppressed={
                    state.isAnimationSuppressed ? "true" : undefined
                }
                style={{ borderRadius: "inherit" }}
                className={cn(
                    "flex-1 min-h-0 flex flex-col h-full overflow-hidden relative select-none outline-none",
                    !embedded && "acrylic",
                    !embedded && BLOCK_SHADOW,
                )}
                onClick={menus.closeContextMenu}
            >
                <ColumnMeasurementLayer
                    headers={table.measurementHeaders}
                    rows={table.measurementRows}
                    measureLayerRef={refs.measureLayerRef}
                />
                <DndContext
                    collisionDetection={closestCenter}
                    sensors={interaction.sensors}
                    onDragStart={interaction.handleDragStart}
                    onDragEnd={interaction.handleDragEnd}
                    onDragCancel={interaction.handleDragCancel}
                >
                    <div className={tableShellClass}>
                        <TorrentTable_Headers
                            headerContainerClass={headerContainerClass}
                            handleHeaderContainerContextMenu={
                                menus.handleHeaderContainerContextMenu
                            }
                            headerSortableIds={table.headerSortableIds}
                            table={table.instance}
                            getTableTotalWidthCss={getTableTotalWidthCss}
                            handleHeaderContextMenu={menus.handleHeaderContextMenu}
                            handleColumnAutoFitRequest={
                                column.handleColumnAutoFitRequest
                            }
                            handleColumnResizeStart={
                                column.handleColumnResizeStart
                            }
                            columnSizingInfo={state.columnSizingInfo}
                            hookActiveResizeColumnId={
                                column.hookActiveResizeColumnId
                            }
                            isAnimationSuppressed={state.isAnimationSuppressed}
                        />

                        <TorrentTable_Body
                            parentRef={refs.parentRef}
                            isLoading={viewModel.isLoading}
                            torrents={viewModel.torrents}
                            TABLE_LAYOUT={TABLE_LAYOUT}
                            rowHeight={layout.rowHeight}
                            t={t}
                            ADD_TORRENT_SHORTCUT={labels.addTorrentShortcut}
                            rowSensors={interaction.rowSensors}
                            handleRowDragStart={interaction.handleRowDragStart}
                            handleRowDragEnd={interaction.handleRowDragEnd}
                            handleRowDragCancel={interaction.handleRowDragCancel}
                            rowIds={table.rowIds}
                            rowVirtualizer={table.rowVirtualizer}
                            rows={table.rows}
                            table={table.instance}
                            renderVisibleCells={table.renderVisibleCells}
                            activeDragRow={activeDragRow}
                            renderOverlayPortal={renderOverlayPortal}
                            DND_OVERLAY_CLASSES={DND_OVERLAY_CLASSES}
                            contextMenu={state.contextMenu}
                            handleRowClick={selection.handleRowClick}
                            handleRowDoubleClick={interaction.handleRowDoubleClick}
                            handleContextMenu={interaction.handleContextMenu}
                            canReorderQueue={state.canReorderQueue}
                            dropTargetRowId={state.dropTargetRowId}
                            activeRowId={state.activeRowId}
                            highlightedRowId={state.highlightedRowId}
                            handleDropTargetChange={
                                interaction.handleDropTargetChange
                            }
                            isAnyColumnResizing={state.isAnyColumnResizing}
                            columnOrder={state.columnOrder}
                            isAnimationSuppressed={state.isAnimationSuppressed}
                            isColumnOrderChanging={state.isColumnOrderChanging}
                            marqueeRect={table.marqueeRect}
                        />
                    </div>
                    {renderOverlayPortal(
                        <DragOverlay
                            adjustScale={false}
                            dropAnimation={null}
                            className={DND_OVERLAY_CLASSES}
                        >
                            {activeHeader ? (
                                <ColumnHeaderPreview
                                    header={activeHeader}
                                    isAnimationSuppressed={
                                        state.isAnimationSuppressed
                                    }
                                />
                            ) : null}
                        </DragOverlay>,
                    )}
                </DndContext>

                {renderOverlayPortal(
                    <TorrentTable_RowMenu
                        contextMenu={state.contextMenu}
                        onClose={menus.closeContextMenu}
                        handleContextMenuAction={menus.handleContextMenuAction}
                        queueMenuActions={menus.queueMenuActions}
                        getContextMenuShortcut={menus.getContextMenuShortcut}
                        t={t}
                        isClipboardSupported={menus.isClipboardSupported}
                        getEmphasisClassForAction={getEmphasisClassForAction}
                    />,
                )}

                {state.headerContextMenu &&
                    menus.headerMenuTriggerRect &&
                    renderOverlayPortal(
                        <TorrentTable_HeaderMenu
                            headerMenuTriggerRect={menus.headerMenuTriggerRect}
                            onClose={menus.closeHeaderMenu}
                            headerMenuActiveColumn={menus.headerMenuActiveColumn}
                            headerMenuItems={menus.headerMenuItems}
                            headerMenuHideLabel={menus.headerMenuHideLabel}
                            isHeaderMenuHideEnabled={
                                menus.isHeaderMenuHideEnabled
                            }
                            autoFitAllColumns={column.autoFitAllColumns}
                            handleHeaderMenuAction={menus.handleHeaderMenuAction}
                        />,
                    )}
            </div>

            <TorrentTable_ColumnSettingsModal
                isOpen={state.isColumnModalOpen}
                onOpenChange={lifecycle.setIsColumnModalOpen}
                table={table.instance}
            />
        </>
    );
}

declare module "@tanstack/react-table" {
    interface ColumnMeta<TData, TValue> {
        align?: "start" | "center" | "end";
    }
}
