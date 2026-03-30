import { cn } from "@heroui/react";
import { type CSSProperties } from "react";
import { registry } from "@/config/logic";
import { metricChart } from "@/shared/ui/layout/glass-surface";
import { table } from "@/shared/ui/layout/glass-surface";
import { formatBytes } from "@/shared/utils/format";

const clamp = (value: number) => Math.min(Math.max(value, 0), 100);
const { layout } = registry;
const denseTextClass = `${layout.table.fontSize} ${layout.table.fontMono} leading-none cap-height-text`;
const denseNumericClass = `${denseTextClass} tabular-nums`;

export interface SmoothProgressBarProps {
    value: number;
    className?: string;
    trackClassName?: string;
    indicatorClassName?: string;
    trackStyle?: CSSProperties;
    indicatorStyle?: CSSProperties;
    "aria-label"?: string;
}

export function SmoothProgressBar({
    value,
    className,
    trackClassName,
    indicatorClassName,
    trackStyle,
    indicatorStyle,
    "aria-label": ariaLabel,
}: SmoothProgressBarProps) {
    const clampedValue = clamp(value);
    return (
        <div
            className={cn(metricChart.progressBar.track, trackClassName, className)}
            style={trackStyle}
            role="progressbar"
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={ariaLabel}
        >
            <div
                className={cn(metricChart.progressBar.indicator, indicatorClassName)}
                style={{
                    width: `${clampedValue}%`,
                    ...indicatorStyle,
                }}
            />
        </div>
    );
}

interface ProgressCellProps {
    progressPercent: number;
    completedBytes: number;
    indicatorClassName: string;
    ariaLabel?: string;
}

export function ProgressCell({ progressPercent, completedBytes, indicatorClassName, ariaLabel }: ProgressCellProps) {
    return (
        <div className={table.columnDefs.progressCell}>
            <div className={cn(table.columnDefs.progressMetricsRow, denseNumericClass)}>
                <span>{progressPercent.toFixed(1)}%</span>
                <span className={table.columnDefs.progressSecondary}>{formatBytes(completedBytes)}</span>
            </div>
            <SmoothProgressBar
                value={progressPercent}
                className={table.columnDefs.progressBar}
                trackClassName={table.columnDefs.progressTrack}
                indicatorClassName={indicatorClassName}
                aria-label={ariaLabel}
            />
        </div>
    );
}
