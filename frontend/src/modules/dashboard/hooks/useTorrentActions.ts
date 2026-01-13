import { useCallback } from "react";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useRequiredTorrentActions } from "@/app/context/TorrentActionsContext";
import { TorrentIntents } from "@/app/intents/torrentIntents";

export function useTorrentActions() {
    const { dispatch } = useRequiredTorrentActions();

    const handleTorrentAction = useCallback(
        async (
            action: TorrentTableAction,
            torrent: Torrent,
            options?: { deleteData?: boolean }
        ) => {
            if (!torrent) return;
            switch (action) {
                case "pause":
                    await dispatch(
                        TorrentIntents.ensurePaused(torrent.id ?? torrent.hash)
                    );
                    break;
                case "resume":
                    await dispatch(
                        TorrentIntents.ensureActive(torrent.id ?? torrent.hash)
                    );
                    break;
                case "recheck":
                    await dispatch(
                        TorrentIntents.ensureValid(torrent.id ?? torrent.hash)
                    );
                    break;
                case "remove":
                    await dispatch(
                        TorrentIntents.ensureRemoved(
                            torrent.id ?? torrent.hash,
                            Boolean(options?.deleteData)
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
                case "queue-move-top":
                    await dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "top",
                            1
                        )
                    );
                    break;
                case "queue-move-up":
                    await dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "up",
                            1
                        )
                    );
                    break;
                case "queue-move-down":
                    await dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "down",
                            1
                        )
                    );
                    break;
                case "queue-move-bottom":
                    await dispatch(
                        TorrentIntents.queueMove(
                            torrent.id ?? torrent.hash,
                            "bottom",
                            1
                        )
                    );
                    break;
                default:
                    return;
            }
        },
        [dispatch]
    );

    const executeBulkRemove = useCallback(
        (ids: string[], deleteData: boolean) =>
            dispatch(TorrentIntents.ensureSelectionRemoved(ids, deleteData)),
        [dispatch]
    );

    const executeSelectionAction = useCallback(
        (action: TorrentTableAction, ids: string[]) => {
            switch (action) {
                case "pause":
                    return dispatch(TorrentIntents.ensureSelectionPaused(ids));
                case "resume":
                    return dispatch(TorrentIntents.ensureSelectionActive(ids));
                case "recheck":
                    return dispatch(TorrentIntents.ensureSelectionValid(ids));
                default:
                    return;
            }
        },
        [dispatch]
    );

    const handleOpenFolder = useCallback(
        (torrent: Torrent) => {
            if (!torrent) return;
            dispatch(TorrentIntents.openTorrentFolder(torrent.id ?? torrent.hash));
        },
        [dispatch]
    );

    return {
        handleTorrentAction,
        executeTorrentAction: handleTorrentAction,
        handleOpenFolder,
        executeBulkRemove,
        executeSelectionAction,
    };
}
