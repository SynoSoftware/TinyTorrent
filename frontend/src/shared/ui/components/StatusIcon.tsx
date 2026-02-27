import { cn } from "@heroui/react";
import { registry } from "@/config/logic";
import { ICON_SIZE_CLASSES } from "@/shared/ui/layout/toolbar-button";
const { layout, visuals, ui } = registry;

export type StatusIconSize = "sm" | "md" | "lg" | "xl";

type IconComponentProps = {
    className?: string;
    style?: React.CSSProperties;
    strokeWidth?: number | string;
};

export interface StatusIconProps {
    Icon: React.ComponentType<IconComponentProps>;
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
            strokeWidth={strokeWidth ?? visuals.icon.strokeWidth}
            style={style}
        />
    );
};

export default StatusIcon;

