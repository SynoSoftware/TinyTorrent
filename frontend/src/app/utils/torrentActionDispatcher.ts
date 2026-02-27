import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { TorrentIntents } from "@/app/intents/torrentIntents";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import {
    commandOutcome,
    type TorrentCommandOutcome,
} from "@/app/context/AppCommandContext";
import {
    type TorrentDispatchOutcome,
} from "@/app/actions/torrentDispatch";

type DispatchFn = (intent: TorrentIntentExtended) => Promise<TorrentDispatchOutcome>;

interface DispatchTorrentActionParams {
    action: TorrentTableAction;
    torrent: Torrent;
    dispatch: DispatchFn;
    options?: { deleteData?: boolean };
}

const mapDispatchOutcome = (outcome: TorrentDispatchOutcome): TorrentCommandOutcome => {
    switch (outcome.status) {
        case "applied":
            return commandOutcome.success();
        case "unsupported":
            return commandOutcome.unsupported();
        case "failed":
            return commandOutcome.failed("execution_failed");
        default:
            return commandOutcome.failed("execution_failed");
    }
};

export async function dispatchTorrentAction({
    action,
    torrent,
    dispatch,
    options,
}: DispatchTorrentActionParams): Promise<TorrentCommandOutcome> {
    const targetId = torrent.id ?? torrent.hash;
    if (!targetId) {
        return commandOutcome.unsupported();
    }

    switch (action) {
        case "pause": {
            const outcome = await dispatch(TorrentIntents.ensurePaused(targetId));
            return mapDispatchOutcome(outcome);
        }
        case "resume":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureActive(targetId)));
        case "resume-now":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureActiveNow(targetId)));
        case "recheck":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureValid(targetId)));
        case "remove":
            return mapDispatchOutcome(
                await dispatch(TorrentIntents.ensureRemoved(targetId, Boolean(options?.deleteData))),
            );
        case "remove-with-data":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureRemoved(targetId, true)));
        case "queue-move-top":
            return mapDispatchOutcome(await dispatch(TorrentIntents.queueMove(targetId, "top", 1)));
        case "queue-move-bottom":
            return mapDispatchOutcome(await dispatch(TorrentIntents.queueMove(targetId, "bottom", 1)));
        case "queue-move-up":
            return mapDispatchOutcome(await dispatch(TorrentIntents.queueMove(targetId, "up", 1)));
        case "queue-move-down":
            return mapDispatchOutcome(await dispatch(TorrentIntents.queueMove(targetId, "down", 1)));
        default:
            return commandOutcome.unsupported();
    }
}

interface DispatchTorrentSelectionActionParams {
    action: TorrentTableAction;
    ids: string[];
    dispatch: DispatchFn;
}

export async function dispatchTorrentSelectionAction({
    action,
    ids,
    dispatch,
}: DispatchTorrentSelectionActionParams): Promise<TorrentCommandOutcome> {
    if (!ids.length) {
        return commandOutcome.noSelection();
    }

    switch (action) {
        case "pause":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureSelectionPaused(ids)));
        case "resume":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureSelectionActive(ids)));
        case "resume-now":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureSelectionActiveNow(ids)));
        case "recheck":
            return mapDispatchOutcome(await dispatch(TorrentIntents.ensureSelectionValid(ids)));
        default:
            return commandOutcome.unsupported();
    }
}

