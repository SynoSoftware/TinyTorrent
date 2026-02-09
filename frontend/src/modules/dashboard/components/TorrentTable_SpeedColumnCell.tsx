import { cn } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { useMemo, type RefObject } from "react";
import { TABLE_LAYOUT } from "@/config/logic";
import STATUS from "@/shared/status";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { formatSpeed } from "@/shared/utils/format";
import { buildSplinePath } from "@/shared/utils/spline";
import type { Torrent } from "@/modules/dashboard/types/torrent";

const DENSE_TEXT = `${TABLE_LAYOUT.fontSize} ${TABLE_LAYOUT.fontMono} leading-none cap-height-text`;
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

    const isDownloading = torrent.state === STATUS.torrent.DOWNLOADING;
    const isSeeding = torrent.state === STATUS.torrent.SEEDING;

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

    const SPEED_COLOR: Record<typeof speedState, string> = {
        down: "text-success",
        seed: "text-primary",
        idle: "text-foreground/60",
    };

    return (
        <div className="relative w-full h-full min-w-0 min-h-0">
            {hasSignal && (
                <svg
                    className={cn(
                        "absolute inset-0 w-full h-full overflow-visible",
                        SPEED_COLOR[speedState],
                        "opacity-50",
                    )}
                    viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                </svg>
            )}

            <div className="relative z-10 flex items-center h-full pointer-events-none">
                <span
                    className={cn(
                        DENSE_NUMERIC,
                        "font-medium",
                        SPEED_COLOR[speedState],
                        "drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] dark:drop-shadow-[0_1px_1px_rgba(255,255,255,0.15)]",
                    )}
                >
                    {speedValue !== null ? formatSpeed(speedValue) : "–"}
                </span>
            </div>
        </div>
    );
}
