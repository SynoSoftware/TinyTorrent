import { useCallback } from "react";
import {
    getCapabilityUiState,
    type CapabilityState,
} from "@/app/types/capabilities";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import {
    isQueueTableAction,
    torrentTableActions,
    type TorrentTableAction,
} from "@/modules/dashboard/types/torrentTable";
import {
    commandReason,
    commandOutcome,
    useTorrentCommands,
    type TorrentCommandOutcome,
} from "@/app/context/AppCommandContext";
import {
    isOpenFolderSuccess,
    type OpenFolderOutcome,
} from "@/app/types/openFolder";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import type { ClipboardWriteOutcome } from "@/shared/utils/clipboard";
import {
    rowMenuKey,
    type RowContextMenuKey,
} from "@/modules/dashboard/types/torrentTableSurfaces";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import { useSelection } from "@/app/context/AppShellStateContext";

const mapClipboardOutcome = (
    outcome: ClipboardWriteOutcome,
): TorrentCommandOutcome => {
    if (outcome.status === "copied") {
        return commandOutcome.success();
    }
    if (outcome.status === "unsupported") {
        return commandOutcome.unsupported();
    }
    return commandOutcome.failed(commandReason.executionFailed);
};

const mapOpenFolderOutcome = (
    outcome: OpenFolderOutcome,
): TorrentCommandOutcome => {
    if (isOpenFolderSuccess(outcome)) {
        return commandOutcome.success();
    }
    if (outcome.status === "unsupported" || outcome.status === "missing_path") {
        return commandOutcome.unsupported();
    }
    return commandOutcome.failed(commandReason.executionFailed);
};

// Hook: context-menu action handler for the torrent table.
type UseTorrentTableContextParams = {
    contextTorrent: Torrent | null;
    copyToClipboard: (s: string) => Promise<ClipboardWriteOutcome>;
    buildMagnetLink: (t: Torrent) => string;
    closeContextMenu: () => void;
    sequentialDownloadCapability: CapabilityState;
    executeQueueAction: (
        action: TorrentTableAction,
        options?: { rowId?: string | null },
    ) => Promise<TorrentCommandOutcome>;
};

export const useTorrentTableContextActions = (params: UseTorrentTableContextParams) => {
    const {
        contextTorrent,
        copyToClipboard,
        buildMagnetLink,
        closeContextMenu,
        sequentialDownloadCapability,
        executeQueueAction,
    } = params;

    const {
        handleTorrentAction,
        handleBulkAction,
        setSequentialDownload,
    } = useTorrentCommands();
    const { selectedIds } = useSelection();
    const { canOpenFolder } = useUiModeCapabilities();
    const handleOpenFolder = useOpenTorrentFolder();
    const sequentialUiState = getCapabilityUiState(
        sequentialDownloadCapability,
    );

    const executeTableAction = useCallback(
        async (action: TorrentTableAction): Promise<TorrentCommandOutcome> => {
            if (!contextTorrent) return commandOutcome.noSelection();
            if (isQueueTableAction(action)) {
                return executeQueueAction(action, { rowId: contextTorrent.id });
            }
            const shouldRunBulkAction =
                selectedIds.length > 1 &&
                selectedIds.includes(contextTorrent.id);
            if (shouldRunBulkAction) {
                return handleBulkAction(action);
            }
            return handleTorrentAction(action, contextTorrent);
        },
        [
            contextTorrent,
            executeQueueAction,
            handleBulkAction,
            handleTorrentAction,
            selectedIds,
        ],
    );

    const handleContextMenuAction = useCallback(
        async (key: RowContextMenuKey): Promise<TorrentCommandOutcome> => {
            if (!contextTorrent) return commandOutcome.noSelection();

            const closeWithOutcome = (outcome: TorrentCommandOutcome) => {
                closeContextMenu();
                return outcome;
            };

            try {
                if (key === rowMenuKey.openFolder) {
                    const path = resolveTorrentPath(contextTorrent);
                    if (!canOpenFolder) {
                        return closeWithOutcome(commandOutcome.unsupported());
                    }
                    return closeWithOutcome(
                        mapOpenFolderOutcome(await handleOpenFolder(path)),
                    );
                }
                if (key === rowMenuKey.copyHash) {
                    return closeWithOutcome(
                        mapClipboardOutcome(
                            await copyToClipboard(contextTorrent.hash),
                        ),
                    );
                }
                if (key === rowMenuKey.copyMagnet) {
                    return closeWithOutcome(
                        mapClipboardOutcome(
                            await copyToClipboard(
                                buildMagnetLink(contextTorrent),
                            ),
                        ),
                    );
                }
                if (key === rowMenuKey.toggleSequentialDownload) {
                    if (!sequentialUiState.supported) {
                        return closeWithOutcome(commandOutcome.unsupported());
                    }
                    const outcome = await setSequentialDownload(
                        contextTorrent,
                        !contextTorrent.sequentialDownload,
                    );
                    if (outcome.status !== "success") {
                        closeContextMenu();
                    }
                    return outcome;
                }

                switch (key) {
                    case torrentTableActions.pause:
                        return closeWithOutcome(
                            await executeTableAction(torrentTableActions.pause),
                        );
                    case torrentTableActions.resume:
                        return closeWithOutcome(
                            await executeTableAction(torrentTableActions.resume),
                        );
                    case torrentTableActions.resumeNow:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.resumeNow,
                            ),
                        );
                    case torrentTableActions.recheck:
                        return closeWithOutcome(
                            await executeTableAction(torrentTableActions.recheck),
                        );
                    case torrentTableActions.remove:
                        return closeWithOutcome(
                            await executeTableAction(torrentTableActions.remove),
                        );
                    case torrentTableActions.removeWithData:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.removeWithData,
                            ),
                        );
                    case torrentTableActions.queueMoveTop:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.queueMoveTop,
                            ),
                        );
                    case torrentTableActions.queueMoveBottom:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.queueMoveBottom,
                            ),
                        );
                    case torrentTableActions.queueMoveUp:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.queueMoveUp,
                            ),
                        );
                    case torrentTableActions.queueMoveDown:
                        return closeWithOutcome(
                            await executeTableAction(
                                torrentTableActions.queueMoveDown,
                            ),
                        );
                    case rowMenuKey.setDownloadLocation:
                        return closeWithOutcome(commandOutcome.unsupported());
                    default:
                        return closeWithOutcome(commandOutcome.unsupported());
                }
            } catch {
                return closeWithOutcome(
                    commandOutcome.failed(commandReason.executionFailed),
                );
            }
        },
        [
            contextTorrent,
            copyToClipboard,
            buildMagnetLink,
            closeContextMenu,
            canOpenFolder,
            handleOpenFolder,
            executeTableAction,
            sequentialUiState.supported,
            setSequentialDownload,
        ],
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;

