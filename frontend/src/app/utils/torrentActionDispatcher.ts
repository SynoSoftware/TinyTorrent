import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";

type DispatchFn = (intent: TorrentIntentExtended) => Promise<void>;

interface DispatchTorrentActionParams {
    action: TorrentTableAction;
    torrent: Torrent;
    dispatch: DispatchFn;
    resume?: (torrent: Torrent) => Promise<void>;
    options?: { deleteData?: boolean };
}

export async function dispatchTorrentAction({
    action,
    torrent,
    dispatch,
    resume,
    options,
}: DispatchTorrentActionParams) {
    const targetId = torrent.id ?? torrent.hash;
    if (!targetId) return;

    switch (action) {
        case "pause":
            return dispatch(TorrentIntents.ensurePaused(targetId));
        case "resume":
            if (resume) {
                await resume(torrent);
                return;
            }
            return dispatch(TorrentIntents.ensureActive(targetId));
        case "recheck":
            return dispatch(TorrentIntents.ensureValid(targetId));
        case "remove":
            return dispatch(
                TorrentIntents.ensureRemoved(
                    targetId,
                    Boolean(options?.deleteData)
                )
            );
        case "remove-with-data":
            return dispatch(TorrentIntents.ensureRemoved(targetId, true));
        case "queue-move-top":
            return dispatch(TorrentIntents.queueMove(targetId, "top", 1));
        case "queue-move-bottom":
            return dispatch(TorrentIntents.queueMove(targetId, "bottom", 1));
        case "queue-move-up":
            return dispatch(TorrentIntents.queueMove(targetId, "up", 1));
        case "queue-move-down":
            return dispatch(TorrentIntents.queueMove(targetId, "down", 1));
        default:
            return;
    }
}

interface DispatchTorrentSelectionActionParams {
    action: TorrentTableAction;
    ids: string[];
    torrents: Torrent[];
    dispatch: DispatchFn;
    resume?: (torrent: Torrent) => Promise<void>;
}

export async function dispatchTorrentSelectionAction({
    action,
    ids,
    torrents,
    dispatch,
    resume,
}: DispatchTorrentSelectionActionParams) {
    if (!ids.length) return;

    switch (action) {
        case "pause":
            return dispatch(TorrentIntents.ensureSelectionPaused(ids));
        case "resume": {
            if (resume) {
                const recoveryTargets = torrents.filter(
                    (torrent) => Boolean(torrent.errorEnvelope)
                );
                if (recoveryTargets.length) {
                    for (const torrent of recoveryTargets) {
                        if (!torrent.id) continue;
                        await resume(torrent);
                    }
                    return;
                }
            }
            return dispatch(TorrentIntents.ensureSelectionActive(ids));
        }
        case "recheck":
            return dispatch(TorrentIntents.ensureSelectionValid(ids));
        default:
            return;
    }
}
