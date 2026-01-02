import { cn } from "@heroui/react";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { ICON_SIZE_CLASSES } from "@/shared/ui/layout/toolbar-button";

export type StatusIconSize = "sm" | "md" | "lg" | "xl";

export interface StatusIconProps {
    Icon: React.ComponentType<any>;
    size?: StatusIconSize;
    className?: string;
    style?: React.CSSProperties;
    strokeWidth?: number | string;
}

export const StatusIcon = ({
    Icon,
    size = "md",
    className,
    style,
    strokeWidth,
}: StatusIconProps) => {
    return (
        <Icon
            className={cn(ICON_SIZE_CLASSES[size], className)}
            strokeWidth={strokeWidth ?? ICON_STROKE_WIDTH}
            style={style}
        />
    );
};

export default StatusIcon;
