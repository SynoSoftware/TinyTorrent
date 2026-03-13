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
