import { cn } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { useMemo, type RefObject } from "react";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { formatSpeed } from "@/shared/utils/format";
import { buildSplinePath } from "@/shared/utils/spline";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { TABLE } from "@/shared/ui/layout/glass-surface";
const { layout, visuals, ui } = registry;

const DENSE_TEXT = `${layout.table.fontSize} ${layout.table.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;
const DEFAULT_SPARKLINE_HEIGHT = 12;

type SpeedTableMeta = {
    speedHistoryRef?: RefObject<Record<string, Array<number | null>>>;
};

interface TorrentTableSpeedColumnCellProps {
    torrent: Torrent;
    table: Table<Torrent>;
}

export function TorrentTable_SpeedCell({
    torrent,
    table,
}: TorrentTableSpeedColumnCellProps) {
    // Keep UI clock subscription here; without it sparkline cadence stalls.
    const { tick } = useUiClock();
    void tick;

    const isDownloading = torrent.state === status.torrent.downloading;
    const isSeeding = torrent.state === status.torrent.seeding;

    const speedValue = isDownloading
        ? torrent.speed.down
        : isSeeding
          ? torrent.speed.up
          : null;

    const meta = table.options.meta as SpeedTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];
    const sanitizedHistory = rawHistory.reduce<number[]>((acc, value) => {
        if (Number.isFinite(value)) {
            acc.push(value as number);
        }
        return acc;
    }, []);

    const current =
        typeof speedValue === "number" && Number.isFinite(speedValue)
            ? speedValue
            : NaN;
    const sparklineHistory: number[] = Number.isFinite(current)
        ? [...sanitizedHistory, current]
        : sanitizedHistory;

    const hasSignal = sparklineHistory.length >= 2;
    const maxSpeed = hasSignal ? Math.max(...sparklineHistory) : 0;

    const { rowHeight } = useLayoutMetrics();
    const resolvedRow = Number.isFinite(rowHeight)
        ? rowHeight
        : DEFAULT_SPARKLINE_HEIGHT * 2.5;

    const { width: sparklineWidth, height: sparklineHeight } = useMemo(() => {
        const height = Math.max(6, Math.round(resolvedRow * 0.45));
        return {
            width: Math.max(24, Math.round(resolvedRow * 2.3)),
            height,
        };
    }, [resolvedRow]);

    const path = hasSignal
        ? buildSplinePath(
              sparklineHistory,
              sparklineWidth,
              sparklineHeight - 1,
              maxSpeed,
          )
        : "";

    const speedState = isDownloading ? "down" : isSeeding ? "seed" : "idle";
    const speedColorKey =
        speedState === "down"
            ? visuals.status.keys.speed.down
            : speedState === "seed"
              ? visuals.status.keys.speed.seed
              : visuals.status.keys.speed.idle;
    const speedColorClass =
        visuals.status.recipes[speedColorKey]?.text ??
        visuals.status.recipes[visuals.status.keys.speed.idle]?.text ??
        "text-foreground/60";

    return (
        <div className={TABLE.speedCell.root}>
            {hasSignal && (
                <svg
                    className={cn(TABLE.speedCell.sparkline, speedColorClass)}
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

            <div className={TABLE.speedCell.valueRow}>
                <span
                    className={cn(
                        DENSE_NUMERIC,
                        TABLE.speedCell.valueText,
                        speedColorClass,
                    )}
                >
                    {speedValue !== null ? formatSpeed(speedValue) : "–"}
                </span>
            </div>
        </div>
    );
}


