import { useCallback } from "react";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";
import { useTorrentCommands } from "@/app/context/TorrentCommandContext";

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
    } = params;

    const { dispatch } = useRequiredTorrentActions();

    const { handleTorrentAction } = useTorrentCommands();
    const handleContextMenuAction = useCallback(
        async (key?: string) => {
            if (!contextMenu) return;
            const torrent = contextMenu.torrent;
            if (!torrent) return;
            if (key === "cols") {
                const rowElement = findRowElement(torrent.id);
                openColumnModal(rowElement ?? null);
            } else if (key === "open-folder") {
                const path =
                    torrent.savePath ??
                    torrent.downloadDir ??
                    torrent.savePath ??
                    "";
                if (path) {
                    await openTorrentFolder?.(path);
                }
            } else if (key === "set-download-path") {
                // Provider-owned: map to ENSURE_TORRENT_AT_LOCATION
                await dispatch(
                    TorrentIntents.ensureAtLocation(
                        torrent.id ?? torrent.hash,
                        torrent.savePath ?? ""
                    )
                );
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
                        await handleTorrentAction("pause", torrent);
                        break;
                    case "resume":
                        await handleTorrentAction("resume", torrent);
                        break;
                    case "recheck":
                        await handleTorrentAction("recheck", torrent);
                        break;
                    case "remove":
                        await handleTorrentAction("remove", torrent);
                        break;
                    case "remove-with-data":
                        await handleTorrentAction("remove-with-data", torrent);
                        break;
                    default:
                        // Unknown key: no-op under intent-only migration
                        break;
                }
            }
            setContextMenu(null);
        },
        [
            contextMenu,
            findRowElement,
            openColumnModal,
            copyToClipboard,
            buildMagnetLink,
            setContextMenu,
            dispatch,
            handleTorrentAction,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
