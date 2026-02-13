import { cn } from "@heroui/react";
import { type CSSProperties } from "react";
import { METRIC_CHART } from "@/shared/ui/layout/glass-surface";

const clamp = (value: number) => Math.min(Math.max(value, 0), 100);

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
            className={cn(
                METRIC_CHART.progressBar.track,
                trackClassName,
                className,
            )}
            style={trackStyle}
            role="progressbar"
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={ariaLabel}
        >
            <div
                className={cn(
                    METRIC_CHART.progressBar.indicator,
                    indicatorClassName,
                )}
                style={{
                    width: `${clampedValue}%`,
                    ...indicatorStyle,
                }}
            />
        </div>
    );
}
