import { cn } from "@heroui/react";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import { TABLE } from "@/shared/ui/layout/glass-surface";
import { status, type TorrentStatus } from "@/shared/status";
import { formatBytes } from "@/shared/utils/format";
import { getEffectiveTorrentState } from "@/modules/dashboard/utils/torrentStatus";

const { layout } = registry;

const DENSE_TEXT = `${layout.table.fontSize} ${layout.table.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// eslint-disable-next-line react-refresh/only-export-components
export const getEffectiveProgress = (
    torrent: Torrent,
    optimisticStatus?: OptimisticStatusEntry,
) => {
    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
    const normalizedProgress = clamp01(
        torrent.progress ?? torrent.verificationProgress ?? 0,
    );

    if (effectiveState === status.torrent.checking) {
        return clamp01(torrent.verificationProgress ?? 0);
    }

    return normalizedProgress;
};

const getProgressIndicatorClass = (effectiveState: TorrentStatus) => {
    if (effectiveState === status.torrent.paused) {
        return TABLE.columnDefs.progressIndicatorPaused;
    }
    if (effectiveState === status.torrent.seeding) {
        return TABLE.columnDefs.progressIndicatorSeeding;
    }
    return TABLE.columnDefs.progressIndicatorActive;
};

interface TorrentProgressDisplayProps {
    torrent: Torrent;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentProgressDisplay({
    torrent,
    optimisticStatus,
}: TorrentProgressDisplayProps) {
    const effectiveState = getEffectiveTorrentState(torrent, optimisticStatus);
    const displayProgress = getEffectiveProgress(torrent, optimisticStatus);

    return (
        <div className={TABLE.columnDefs.progressCell}>
            <div className={cn(TABLE.columnDefs.progressMetricsRow, DENSE_NUMERIC)}>
                <span>{(displayProgress * 100).toFixed(1)}%</span>
                <span className={TABLE.columnDefs.progressSecondary}>
                    {formatBytes(torrent.totalSize * displayProgress)}
                </span>
            </div>
            <SmoothProgressBar
                value={displayProgress * 100}
                className={TABLE.columnDefs.progressBar}
                trackClassName={TABLE.columnDefs.progressTrack}
                indicatorClassName={getProgressIndicatorClass(effectiveState)}
            />
        </div>
    );
}
