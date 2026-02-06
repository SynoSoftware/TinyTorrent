import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { cn } from "@heroui/react";
import React, {
    useMemo,
} from "react";
import type { TorrentTableViewModel } from "@/app/viewModels/useAppViewModel";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { BLOCK_SHADOW } from "@/shared/ui/layout/glass-surface";
import {
    ColumnMeasurementLayer,
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
        interaction,
        menus,
        lifecycle,
        surfaces,
    } = tableViewModel;
    const { setTableContainerRef, setMeasureLayerRef } = refs;
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

    return (
        <>
            <div
                ref={setTableContainerRef}
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
                    measureLayerRef={setMeasureLayerRef}
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
                            viewModel={surfaces.headersViewModel}
                        />

                        <TorrentTable_Body viewModel={surfaces.bodyViewModel} />
                    </div>
                    {surfaces.renderOverlayPortal(
                        <DragOverlay
                            adjustScale={false}
                            dropAnimation={null}
                            className={
                                surfaces.bodyViewModel.dnd.overlayClassName
                            }
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

                {surfaces.renderOverlayPortal(
                    <TorrentTable_RowMenu viewModel={surfaces.rowMenuViewModel} />,
                )}

                {surfaces.headerMenuViewModel.headerMenuTriggerRect &&
                    surfaces.renderOverlayPortal(
                        <TorrentTable_HeaderMenu
                            viewModel={surfaces.headerMenuViewModel}
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData, TValue> {
        align?: "start" | "center" | "end";
    }
}
