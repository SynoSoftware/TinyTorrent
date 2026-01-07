import { useCallback } from "react";

// Hook: context-menu action handler for the torrent table.
// Extracted from `TorrentTable.tsx` and accepts a params object to keep
// the handler decoupled from outer-scope state.
export const useTorrentTableContextActions = (params: any) => {
    const {
        contextMenu,
        findRowElement,
        openColumnModal,
        onOpenFolder,
        onSetLocation,
        copyToClipboard,
        buildMagnetLink,
        onAction,
        setContextMenu,
    } = params;

    const handleContextMenuAction = useCallback(
        async (key?: string) => {
            if (!contextMenu) return;
            const torrent = contextMenu.torrent;
            if (!torrent) return;
            if (key === "cols") {
                const rowElement = findRowElement(torrent.id);
                openColumnModal(rowElement ?? null);
            } else if (key === "open-folder") {
                if (onOpenFolder && torrent.savePath) {
                    await onOpenFolder(torrent);
                }
            } else if (key === "set-download-path") {
                if (onSetLocation) {
                    await onSetLocation(torrent);
                }
            } else if (key === "copy-hash") {
                await copyToClipboard(torrent.hash);
            } else if (key === "copy-magnet") {
                await copyToClipboard(buildMagnetLink(torrent));
            } else if (key) {
                onAction?.(key, torrent);
            }
            setContextMenu(null);
        },
        [
            contextMenu,
            findRowElement,
            openColumnModal,
            onOpenFolder,
            onSetLocation,
            copyToClipboard,
            buildMagnetLink,
            onAction,
            setContextMenu,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
