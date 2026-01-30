import { useCallback, useMemo } from "react";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useTorrentCommands } from "@/app/context/TorrentCommandContext";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";

// Hook: context-menu action handler for the torrent table.
// Extracted from `TorrentTable.tsx` and accepts a params object to keep
// the handler decoupled from outer-scope state.
type UseTorrentTableContextParams = {
    contextMenu: {
        virtualElement: ContextMenuVirtualElement;
        torrent: Torrent;
    } | null;
    findRowElement: (id: string) => HTMLElement | null;
    openColumnModal: (el: HTMLElement | null) => void;
    copyToClipboard: (s: string) => Promise<void>;
    buildMagnetLink: (t: Torrent) => string;
    setContextMenu: React.Dispatch<
        React.SetStateAction<{
            virtualElement: ContextMenuVirtualElement;
            torrent: Torrent;
        } | null>
    >;
    openTorrentFolder?: (path?: string | null) => void;
    selectedTorrents: Torrent[];
};

export const useTorrentTableContextActions = (
    params: UseTorrentTableContextParams
) => {
    const {
        contextMenu,
        findRowElement,
        openColumnModal,
        copyToClipboard,
        buildMagnetLink,
        setContextMenu,
        openTorrentFolder,
        selectedTorrents = [],
    } = params;

    const selectionTargets = useMemo(() => {
        if (!contextMenu) return [];
        const contextTorrent = contextMenu.torrent;
        if (!contextTorrent) return [];
        const hasMultiSelection =
            selectedTorrents.length > 1 &&
            selectedTorrents.some(
                (torrent) => torrent.id === contextTorrent.id
            );
        return hasMultiSelection ? selectedTorrents : [contextTorrent];
    }, [contextMenu, selectedTorrents]);

    const { dispatch } = useRequiredTorrentActions();

    const { handleTorrentAction, handleBulkAction } = useTorrentCommands();
    const executeTableAction = useCallback(
        async (action: TorrentTableAction) => {
            if (!contextMenu) return;
            const contextTorrent = contextMenu.torrent;
            if (!contextTorrent) return;
            if (selectionTargets.length > 1) {
                await handleBulkAction(action);
                return;
            }
            await handleTorrentAction(action, contextTorrent);
        },
        [
            contextMenu,
            handleBulkAction,
            handleTorrentAction,
            selectionTargets,
        ]
    );
    const { handleSetLocation } = useRecoveryContext();
    const handleContextMenuAction = useCallback(
        async (key?: string): Promise<void> => {
            if (!contextMenu) return;
            const torrent = contextMenu.torrent;
            if (!torrent) return;
            if (key === "cols") {
                const rowElement = findRowElement(torrent.id);
                openColumnModal(rowElement ?? null);
            } else if (key === "open-folder") {
                const path = resolveTorrentPath(torrent);
                if (path) {
                    await openTorrentFolder?.(path);
                }
            } else if (key === "set-download-path") {
                // Provider-owned: map to ENSURE_TORRENT_AT_LOCATION
                await handleSetLocation(torrent, {
                    surface: "context-menu",
                    mode: "manual",
                });
                return;
            } else if (key === "reDownload" || key === "reDownloadHere") {
                // Redownload action -> ENSURE_TORRENT_DATA_PRESENT
                await dispatch(
                    TorrentIntents.ensureDataPresent(torrent.id ?? torrent.hash)
                );
            } else if (key === "copy-hash") {
                await copyToClipboard(torrent.hash);
            } else if (key === "copy-magnet") {
                await copyToClipboard(buildMagnetLink(torrent));
            } else if (key) {
                // Map common table actions to intents when possible
                switch (key) {
                    case "pause":
                        await executeTableAction("pause");
                        break;
                    case "resume":
                        await executeTableAction("resume");
                        break;
                    case "recheck":
                        await executeTableAction("recheck");
                        break;
                    case "remove":
                        await executeTableAction("remove");
                        break;
                    case "remove-with-data":
                        await executeTableAction("remove-with-data");
                        break;
                    default:
                        // Unknown key: no-op under intent-only migration
                        break;
                }
            }
            setContextMenu(null);
            return;
        },
        [
            contextMenu,
            findRowElement,
            openColumnModal,
            copyToClipboard,
            buildMagnetLink,
            setContextMenu,
            openTorrentFolder,
            dispatch,
            executeTableAction,
            handleSetLocation,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
