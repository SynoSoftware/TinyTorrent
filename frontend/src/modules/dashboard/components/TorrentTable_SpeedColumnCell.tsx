import { cn } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { useMemo, type RefObject } from "react";
import { getStatusRecipeText, registry } from "@/config/logic";
import { status } from "@/shared/status";
import { formatSpeed } from "@/shared/utils/format";
import { buildSplinePath } from "@/shared/utils/spline";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { table as tableSurface } from "@/shared/ui/layout/glass-surface";
import { getStatusSpeedHistory } from "@/modules/dashboard/utils/torrentStatus";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";
const { layout, visuals } = registry;

const DENSE_TEXT = `${layout.table.fontSize} ${layout.table.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;
const DEFAULT_SPARKLINE_HEIGHT = 12;

type SpeedTableMeta = {
    speedHistoryRef?: RefObject<Record<string, SpeedHistorySnapshot | Array<number | null>>>;
    rowHeight?: number;
};

interface TorrentTableSpeedColumnCellProps {
    torrent: Torrent;
    table?: Table<Torrent>;
    speedHistory?: SpeedHistorySnapshot | Array<number | null>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const getTorrentCompactSpeedValue = (torrent: Torrent) => {
    const isDownloading = torrent.state === status.torrent.downloading;
    const isSeeding = torrent.state === status.torrent.seeding;

    return isDownloading ? torrent.speed.down : isSeeding ? torrent.speed.up : null;
};

export function TorrentTable_SpeedCell({ torrent, table, speedHistory }: TorrentTableSpeedColumnCellProps) {
    const isDownloading = torrent.state === status.torrent.downloading;
    const isSeeding = torrent.state === status.torrent.seeding;

    const speedValue = getTorrentCompactSpeedValue(torrent);

    const meta = table?.options.meta as SpeedTableMeta | undefined;
    const rawHistory = speedHistory ?? meta?.speedHistoryRef?.current?.[torrent.id];
    const normalizedSpeedHistory = useMemo(() => getStatusSpeedHistory(torrent, rawHistory), [rawHistory, torrent]);
    const relevantHistory = isSeeding ? normalizedSpeedHistory.up : normalizedSpeedHistory.down;
    const hasSignal = speedValue !== null && relevantHistory.length >= 2;
    const maxSpeed = useMemo(() => (hasSignal ? Math.max(...relevantHistory) : 0), [hasSignal, relevantHistory]);

    const tableRowHeight = meta?.rowHeight;
    const resolvedRow: number = Number.isFinite(tableRowHeight ?? Number.NaN)
        ? Number(tableRowHeight)
        : DEFAULT_SPARKLINE_HEIGHT * 2.5;

    const { width: sparklineWidth, height: sparklineHeight } = useMemo(() => {
        const height = Math.max(6, Math.round(resolvedRow * 0.45));
        return {
            width: Math.max(24, Math.round(resolvedRow * 2.3)),
            height,
        };
    }, [resolvedRow]);

    const path = useMemo(
        () => (hasSignal ? buildSplinePath([...relevantHistory], sparklineWidth, sparklineHeight - 1, maxSpeed) : ""),
        [hasSignal, maxSpeed, relevantHistory, sparklineHeight, sparklineWidth],
    );

    const speedState = isDownloading ? "down" : isSeeding ? "seed" : "idle";
    const speedColorKey =
        speedState === "down"
            ? visuals.status.keys.speed.down
            : speedState === "seed"
              ? visuals.status.keys.speed.seed
              : visuals.status.keys.speed.idle;
    const speedColorClass = getStatusRecipeText(speedColorKey, visuals.status.keys.speed.idle);

    return (
        <div className={tableSurface.speedCell.root}>
            {hasSignal && (
                <svg
                    className={cn(tableSurface.speedCell.sparkline, speedColorClass)}
                    viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={visuals.icon.strokeWidthDense}
                        strokeLinecap="round"
                    />
                </svg>
            )}

            <div className={tableSurface.speedCell.valueRow}>
                <span className={cn(DENSE_NUMERIC, tableSurface.speedCell.valueText, speedColorClass)}>
                    {speedValue !== null ? formatSpeed(speedValue) : "–"}
                </span>
            </div>
        </div>
    );
}
