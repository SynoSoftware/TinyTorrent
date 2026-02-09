import { cn } from "@heroui/react";
import { type CSSProperties } from "react";

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
                "relative h-full overflow-hidden rounded-full bg-content1/20",
                trackClassName,
                className
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
                    "absolute inset-y-0 left-0 transform origin-left rounded-full",
                    "transition-all duration-300 ease-out",
                    indicatorClassName
                )}
                style={{
                    width: `${clampedValue}%`,
                    ...indicatorStyle,
                }}
            />
        </div>
    );
}
