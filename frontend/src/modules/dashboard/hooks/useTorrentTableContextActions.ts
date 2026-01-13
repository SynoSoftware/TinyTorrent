import { useCallback } from "react";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { ContextMenuVirtualElement } from "@/shared/hooks/ui/useContextMenuPosition";

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
    resumeTorrent?: (torrent: Torrent) => Promise<void> | void;
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
        resumeTorrent,
        openTorrentFolder,
    } = params;

    const { dispatch } = useRequiredTorrentActions();

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
                        await dispatch(
                            TorrentIntents.ensurePaused(
                                torrent.id ?? torrent.hash
                            )
                        );
                        break;
                    case "resume":
                        if (resumeTorrent) {
                            await resumeTorrent(torrent);
                        } else {
                            await dispatch(
                                TorrentIntents.ensureActive(
                                    torrent.id ?? torrent.hash
                                )
                            );
                        }
                        break;
                    case "recheck":
                        await dispatch(
                            TorrentIntents.ensureValid(
                                torrent.id ?? torrent.hash
                            )
                        );
                        break;
                    case "remove":
                        await dispatch(
                            TorrentIntents.ensureRemoved(
                                torrent.id ?? torrent.hash,
                                false
                            )
                        );
                        break;
                    case "remove-with-data":
                        await dispatch(
                            TorrentIntents.ensureRemoved(
                                torrent.id ?? torrent.hash,
                                true
                            )
                        );
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
            resumeTorrent,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
