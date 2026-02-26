import { useCallback, useMemo } from "react";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useTorrentCommands, type TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { isOpenFolderSuccess } from "@/app/types/openFolder";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import type { ClipboardWriteOutcome } from "@/shared/utils/clipboard";
import type { RowContextMenuKey } from "@/modules/dashboard/types/torrentTableSurfaces";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";

// Hook: context-menu action handler for the torrent table.
type UseTorrentTableContextParams = {
    contextMenu: {
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    } | null;
    copyToClipboard: (s: string) => Promise<ClipboardWriteOutcome>;
    buildMagnetLink: (t: Torrent) => string;
    setContextMenu: React.Dispatch<
        React.SetStateAction<{
            virtualElement: ContextMenuVirtualElement;
            torrent: Torrent;
        } | null>
    >;
    selectedTorrents: Torrent[];
};

const COMMAND_OUTCOME_SUCCESS: TorrentCommandOutcome = { status: "success" };
const COMMAND_OUTCOME_UNSUPPORTED: TorrentCommandOutcome = {
    status: "unsupported",
    reason: "action_not_supported",
};
const COMMAND_OUTCOME_FAILED: TorrentCommandOutcome = {
    status: "failed",
    reason: "execution_failed",
};
const COMMAND_OUTCOME_NO_SELECTION: TorrentCommandOutcome = {
    status: "canceled",
    reason: "no_selection",
};

export const useTorrentTableContextActions = (params: UseTorrentTableContextParams) => {
    const { contextMenu, copyToClipboard, buildMagnetLink, setContextMenu, selectedTorrents = [] } = params;

    const selectionTargets = useMemo(() => {
        if (!contextMenu) return [];
        const contextTorrent = contextMenu.torrent;
        if (!contextTorrent) return [];
        const hasMultiSelection = selectedTorrents.length > 1 && selectedTorrents.some((torrent) => torrent.id === contextTorrent.id);
        return hasMultiSelection ? selectedTorrents : [contextTorrent];
    }, [contextMenu, selectedTorrents]);

    const { handleTorrentAction, handleBulkAction } = useTorrentCommands();
    const { canOpenFolder } = useUiModeCapabilities();
    const handleOpenFolder = useOpenTorrentFolder();

    const executeTableAction = useCallback(
        async (action: TorrentTableAction): Promise<TorrentCommandOutcome> => {
            if (!contextMenu) return COMMAND_OUTCOME_NO_SELECTION;
            const contextTorrent = contextMenu.torrent;
            if (!contextTorrent) return COMMAND_OUTCOME_NO_SELECTION;
            const isQueueAction = action === "queue-move-top" || action === "queue-move-bottom" || action === "queue-move-up" || action === "queue-move-down";
            if (!isQueueAction && selectionTargets.length > 1) {
                return handleBulkAction(action);
            }
            return handleTorrentAction(action, contextTorrent);
        },
        [contextMenu, handleBulkAction, handleTorrentAction, selectionTargets],
    );

    const handleContextMenuAction = useCallback(
        async (key?: RowContextMenuKey): Promise<TorrentCommandOutcome> => {
            if (!contextMenu) return COMMAND_OUTCOME_NO_SELECTION;
            const torrent = contextMenu.torrent;
            if (!torrent) return COMMAND_OUTCOME_NO_SELECTION;
            if (!key) {
                setContextMenu(null);
                return COMMAND_OUTCOME_UNSUPPORTED;
            }

            const closeWithOutcome = (outcome: TorrentCommandOutcome) => {
                setContextMenu(null);
                return outcome;
            };

            try {
                if (key === "open-folder") {
                    const path = resolveTorrentPath(torrent);
                    if (!canOpenFolder) {
                        return closeWithOutcome(COMMAND_OUTCOME_UNSUPPORTED);
                    }
                    const outcome = await handleOpenFolder(path);
                    if (isOpenFolderSuccess(outcome)) {
                        return closeWithOutcome(COMMAND_OUTCOME_SUCCESS);
                    }
                    if (outcome.status === "unsupported" || outcome.status === "missing_path") {
                        return closeWithOutcome(COMMAND_OUTCOME_UNSUPPORTED);
                    }
                    return closeWithOutcome(COMMAND_OUTCOME_FAILED);
                }
                if (key === "copy-hash") {
                    const outcome = await copyToClipboard(torrent.hash);
                    if (outcome.status === "copied") {
                        return closeWithOutcome(COMMAND_OUTCOME_SUCCESS);
                    }
                    if (outcome.status === "unsupported") {
                        return closeWithOutcome(COMMAND_OUTCOME_UNSUPPORTED);
                    }
                    return closeWithOutcome(COMMAND_OUTCOME_FAILED);
                }
                if (key === "copy-magnet") {
                    const outcome = await copyToClipboard(buildMagnetLink(torrent));
                    if (outcome.status === "copied") {
                        return closeWithOutcome(COMMAND_OUTCOME_SUCCESS);
                    }
                    if (outcome.status === "unsupported") {
                        return closeWithOutcome(COMMAND_OUTCOME_UNSUPPORTED);
                    }
                    return closeWithOutcome(COMMAND_OUTCOME_FAILED);
                }

                switch (key) {
                    case "pause":
                        return closeWithOutcome(await executeTableAction("pause"));
                    case "resume":
                        return closeWithOutcome(await executeTableAction("resume"));
                    case "resume-now":
                        return closeWithOutcome(
                            await executeTableAction("resume-now"),
                        );
                    case "recheck":
                        return closeWithOutcome(await executeTableAction("recheck"));
                    case "remove":
                        return closeWithOutcome(await executeTableAction("remove"));
                    case "remove-with-data":
                        return closeWithOutcome(await executeTableAction("remove-with-data"));
                    case "queue-move-top":
                        return closeWithOutcome(await executeTableAction("queue-move-top"));
                    case "queue-move-bottom":
                        return closeWithOutcome(await executeTableAction("queue-move-bottom"));
                    case "queue-move-up":
                        return closeWithOutcome(await executeTableAction("queue-move-up"));
                    case "queue-move-down":
                        return closeWithOutcome(await executeTableAction("queue-move-down"));
                    default:
                        return closeWithOutcome(COMMAND_OUTCOME_UNSUPPORTED);
                }
            } catch {
                return closeWithOutcome(COMMAND_OUTCOME_FAILED);
            }
        },
        [
            contextMenu,
            copyToClipboard,
            buildMagnetLink,
            setContextMenu,
            canOpenFolder,
            handleOpenFolder,
            executeTableAction,
        ],
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
