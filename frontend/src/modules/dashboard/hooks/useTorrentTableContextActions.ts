import { useCallback } from "react";
import { useTorrentActionsContext } from "@/app/context/TorrentActionsContext";
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
                    await _actions.dispatch(
                        TorrentIntents.openTorrentFolder(
                            torrent.id ?? torrent.hash
                        )
                    );
                }
            } else if (key === "set-download-path") {
                // Provider-owned: map to ENSURE_TORRENT_AT_LOCATION
                await _actions.dispatch(
                    TorrentIntents.ensureAtLocation(
                        torrent.id ?? torrent.hash,
                        torrent.savePath ?? ""
                    )
                );
            } else if (key === "reDownload" || key === "reDownloadHere") {
                // Redownload action -> ENSURE_TORRENT_DATA_PRESENT
                await _actions.dispatch(
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
                        await _actions.dispatch(
                            TorrentIntents.ensurePaused(
                                torrent.id ?? torrent.hash
                            )
                        );
                        break;
                    case "resume":
                        await _actions.dispatch(
                            TorrentIntents.ensureActive(
                                torrent.id ?? torrent.hash
                            )
                        );
                        break;
                    case "recheck":
                        await _actions.dispatch(
                            TorrentIntents.ensureValid(
                                torrent.id ?? torrent.hash
                            )
                        );
                        break;
                    case "remove":
                        await _actions.dispatch(
                            TorrentIntents.ensureRemoved(
                                torrent.id ?? torrent.hash,
                                false
                            )
                        );
                        break;
                    case "remove-with-data":
                        await _actions.dispatch(
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
            _actions,
        ]
    );

    return { handleContextMenuAction };
};

export default useTorrentTableContextActions;
