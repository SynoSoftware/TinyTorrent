import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import type { TorrentEntity as Torrent, TorrentTransportStatus } from "@/services/rpc/entities";
import { ProgressCell } from "@/shared/ui/components/SmoothProgressBar";
import { table } from "@/shared/ui/layout/glass-surface";
import { status } from "@/shared/status";
import { getEffectiveTorrentState } from "@/modules/dashboard/utils/torrentStatus";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// eslint-disable-next-line react-refresh/only-export-components
export const getEffectiveProgress = (torrent: Torrent, optimisticStatus?: OptimisticStatusEntry) => {
    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
    const normalizedProgress = clamp01(torrent.progress ?? torrent.verificationProgress ?? 0);

    if (effectiveState === status.torrent.checking) {
        return clamp01(torrent.verificationProgress ?? 0);
    }

    return normalizedProgress;
};

const getProgressIndicatorClass = (effectiveState: TorrentTransportStatus) => {
    if (effectiveState === status.torrent.paused) {
        return table.columnDefs.progressIndicatorPaused;
    }
    if (effectiveState === status.torrent.seeding) {
        return table.columnDefs.progressIndicatorSeeding;
    }
    return table.columnDefs.progressIndicatorActive;
};

interface TorrentProgressDisplayProps {
    torrent: Torrent;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentProgressDisplay({ torrent, optimisticStatus }: TorrentProgressDisplayProps) {
    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
    const displayProgress = getEffectiveProgress(torrent, optimisticStatus);

    return (
        <ProgressCell
            progressPercent={displayProgress * 100}
            completedBytes={torrent.totalSize * displayProgress}
            indicatorClassName={getProgressIndicatorClass(effectiveState)}
        />
    );
}
