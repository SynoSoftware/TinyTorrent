import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentStatus } from "@/services/rpc/entities";
import STATUS from "@/shared/status";

type OptimisticAction = Extract<TorrentTableAction, "pause" | "resume" | "recheck">;

export interface OptimisticStatusUpdate {
    id: string;
    state: TorrentStatus;
}

const isCheckingLike = (torrent: Torrent): boolean => {
    if (torrent.state === STATUS.torrent.CHECKING) {
        return true;
    }
    return (
        typeof torrent.verificationProgress === "number" &&
        torrent.verificationProgress < 1
    );
};

const getOptimisticStateForAction = (
    action: OptimisticAction,
    torrent: Torrent,
): TorrentStatus | undefined => {
    switch (action) {
        case "pause":
            return torrent.state === STATUS.torrent.PAUSED
                ? undefined
                : STATUS.torrent.PAUSED;
        case "recheck":
            return isCheckingLike(torrent) ? undefined : STATUS.torrent.CHECKING;
        case "resume":
            // Transmission may queue resume while verifying or queue-limited.
            // Do not project a deterministic running state here.
            return undefined;
    }
};

export const buildOptimisticStatusUpdatesForAction = (
    action: TorrentTableAction,
    torrents: Torrent[],
): OptimisticStatusUpdate[] => {
    switch (action) {
        case "pause":
        case "resume":
        case "recheck":
            return torrents
                .map((torrent) => {
                    const state = getOptimisticStateForAction(action, torrent);
                    if (!state) {
                        return null;
                    }
                    return {
                        id: torrent.id,
                        state,
                    } satisfies OptimisticStatusUpdate;
                })
                .filter((update): update is OptimisticStatusUpdate => update !== null);
        default:
            return [];
    }
};
