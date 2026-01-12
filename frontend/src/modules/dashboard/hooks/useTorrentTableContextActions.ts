import { useCallback } from "react";
import { useTorrentActionsContext } from "@/app/context/TorrentActionsContext";

// Hook: context-menu action handler for the torrent table.
// Extracted from `TorrentTable.tsx` and accepts a params object to keep
// the handler decoupled from outer-scope state.
export const useTorrentTableContextActions = (params: any) => {
    const {
        contextMenu,
        findRowElement,
        openColumnModal,
        copyToClipboard,
        buildMagnetLink,
        setContextMenu,
    } = params;

    const _actions = useTorrentActionsContext();

    const handleContextMenuAction = useCallback(
        async (key?: string) => {
            if (!contextMenu) return;
            const torrent = contextMenu.torrent;
            if (!torrent) return;
            if (key === "cols") {
                const rowElement = findRowElement(torrent.id);
                openColumnModal(rowElement ?? null);
            } else if (key === "open-folder") {
                if (torrent.savePath) {
                    await _actions.handleOpenFolder(torrent);
                }
            } else if (key === "set-download-path") {
                // Provider-owned: use TorrentActionsContext.setLocation
                if (_actions.setLocation) {
                    await _actions.setLocation(torrent);
                }
            } else if (key === "reDownload" || key === "reDownloadHere") {
                // Redownload action handled by provider
                if (_actions.redownload) {
                    await _actions.redownload(torrent);
                }
            } else if (key === "copy-hash") {
                await copyToClipboard(torrent.hash);
            } else if (key === "copy-magnet") {
                await copyToClipboard(buildMagnetLink(torrent));
            } else if (key) {
                await _actions.executeTorrentAction(key as any, torrent);
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
            _actions,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
