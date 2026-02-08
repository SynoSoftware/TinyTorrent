import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { TorrentDispatchOutcome } from "@/app/actions/torrentDispatch";

type DispatchFn = (
    intent: TorrentIntentExtended
) => Promise<TorrentDispatchOutcome>;

interface DispatchTorrentActionParams {
    action: TorrentTableAction;
    torrent: Torrent;
    dispatch: DispatchFn;
    resume?: (torrent: Torrent) => Promise<void>;
    options?: { deleteData?: boolean };
}

const COMMAND_OUTCOME_SUCCESS: TorrentCommandOutcome = { status: "success" };
const COMMAND_OUTCOME_FAILED: TorrentCommandOutcome = {
    status: "failed",
    reason: "execution_failed",
};
const COMMAND_OUTCOME_UNSUPPORTED: TorrentCommandOutcome = {
    status: "unsupported",
    reason: "action_not_supported",
};
const COMMAND_OUTCOME_NO_SELECTION: TorrentCommandOutcome = {
    status: "canceled",
    reason: "no_selection",
};

const mapDispatchOutcome = (
    outcome: TorrentDispatchOutcome,
): TorrentCommandOutcome => {
    switch (outcome.status) {
        case "applied":
            return COMMAND_OUTCOME_SUCCESS;
        case "unsupported":
            return COMMAND_OUTCOME_UNSUPPORTED;
        case "failed":
            return COMMAND_OUTCOME_FAILED;
        default:
            return COMMAND_OUTCOME_FAILED;
    }
};

export async function dispatchTorrentAction({
    action,
    torrent,
    dispatch,
    resume,
    options,
}: DispatchTorrentActionParams): Promise<TorrentCommandOutcome> {
    const targetId = torrent.id ?? torrent.hash;
    if (!targetId) {
        return COMMAND_OUTCOME_UNSUPPORTED;
    }

    switch (action) {
        case "pause": {
            const outcome = await dispatch(
                TorrentIntents.ensurePaused(targetId),
            );
            return mapDispatchOutcome(outcome);
        }
        case "resume":
            if (resume) {
                try {
                    await resume(torrent);
                    return COMMAND_OUTCOME_SUCCESS;
                } catch {
                    return COMMAND_OUTCOME_FAILED;
                }
            }
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureActive(targetId)),
            );
        case "recheck":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureValid(targetId)),
            );
        case "remove":
            return mapDispatchOutcome(
                await dispatch(
                    TorrentIntents.ensureRemoved(
                        targetId,
                        Boolean(options?.deleteData),
                    ),
                ),
            );
        case "remove-with-data":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureRemoved(targetId, true)),
            );
        case "queue-move-top":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.queueMove(targetId, "top", 1)),
            );
        case "queue-move-bottom":
            return mapDispatchOutcome(
                await dispatch(
                    TorrentIntents.queueMove(targetId, "bottom", 1),
                ),
            );
        case "queue-move-up":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.queueMove(targetId, "up", 1)),
            );
        case "queue-move-down":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.queueMove(targetId, "down", 1)),
            );
        default:
            return COMMAND_OUTCOME_UNSUPPORTED;
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
}: DispatchTorrentSelectionActionParams): Promise<TorrentCommandOutcome> {
    if (!ids.length) {
        return COMMAND_OUTCOME_NO_SELECTION;
    }

    switch (action) {
        case "pause":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureSelectionPaused(ids)),
            );
        case "resume": {
            if (resume) {
                const recoveryTargets = torrents.filter(
                    (torrent) => Boolean(torrent.errorEnvelope),
                );
                if (recoveryTargets.length) {
                    try {
                        let resumedAny = false;
                        for (const torrent of recoveryTargets) {
                            if (!torrent.id) continue;
                            resumedAny = true;
                            await resume(torrent);
                        }
                        return resumedAny
                            ? COMMAND_OUTCOME_SUCCESS
                            : COMMAND_OUTCOME_UNSUPPORTED;
                    } catch {
                        return COMMAND_OUTCOME_FAILED;
                    }
                }
            }
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureSelectionActive(ids)),
            );
        }
        case "recheck":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureSelectionValid(ids)),
            );
        default:
            return COMMAND_OUTCOME_UNSUPPORTED;
    }
}

