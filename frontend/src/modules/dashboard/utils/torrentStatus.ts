import type { TFunction } from "i18next";
import type { TorrentEntity as Torrent, TorrentStatus } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { status } from "@/shared/status";

export const getEffectiveTorrentState = (
    torrent: Pick<Torrent, "state">,
    optimisticStatus?: OptimisticStatusEntry,
): TorrentStatus => optimisticStatus?.state ?? torrent.state;

export const isTorrentPausableState = (torrentState?: TorrentStatus | null) =>
    torrentState === status.torrent.downloading ||
    torrentState === status.torrent.seeding ||
    torrentState === status.torrent.checking ||
    torrentState === status.torrent.queued ||
    torrentState === status.torrent.stalled;

export const getTorrentStatusLabelKey = (torrentState?: TorrentStatus | null) => {
    switch (torrentState) {
        case status.torrent.downloading:
            return "table.status_dl";
        case status.torrent.seeding:
            return "table.status_seed";
        case status.torrent.paused:
            return "table.status_pause";
        case status.torrent.checking:
            return "table.status_checking";
        case status.torrent.queued:
            return "table.status_queued";
        case status.torrent.stalled:
            return "table.status_stalled";
        case status.torrent.error:
            return "table.status_error";
        default:
            return null;
    }
};

export interface TorrentStatusPresentation {
    effectiveState: TorrentStatus | null;
    isOptimisticMoving: boolean;
    label: string | null;
    tooltip: string | null;
}

export const getTorrentStatusPresentation = (
    torrent: Pick<Torrent, "state" | "errorString">,
    t: TFunction,
    optimisticStatus?: OptimisticStatusEntry,
): TorrentStatusPresentation => {
    if (optimisticStatus?.operation === "moving") {
        const label = t("table.status_moving");
        return {
            effectiveState: null,
            isOptimisticMoving: true,
            label,
            tooltip: label,
        };
    }

    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
    const statusLabelKey = getTorrentStatusLabelKey(effectiveState);
    const label =
        statusLabelKey != null
            ? t(statusLabelKey)
            : typeof effectiveState === "string" && effectiveState.length > 0
              ? effectiveState
              : null;

    if (!label) {
        return {
            effectiveState,
            isOptimisticMoving: false,
            label: null,
            tooltip: null,
        };
    }

    return {
        effectiveState,
        isOptimisticMoving: false,
        label,
        tooltip:
            torrent.errorString && torrent.errorString.trim().length > 0
                ? torrent.errorString
                : label,
    };
};
