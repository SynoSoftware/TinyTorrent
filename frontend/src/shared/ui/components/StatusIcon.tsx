import React from "react";
import { ICON_STROKE_WIDTH, UI_BASES } from "@/config/logic";

export type StatusIconSize = "sm" | "md" | "lg";

export interface StatusIconProps {
    Icon: React.ComponentType<any>;
    size?: StatusIconSize;
    className?: string;
    style?: React.CSSProperties;
    strokeWidth?: number;
}

export const StatusIcon = ({
    Icon,
    size = "md",
    className,
    style,
    strokeWidth,
}: StatusIconProps) => {
    const sizeMap: Record<StatusIconSize, string> = {
        sm: UI_BASES.statusbar.iconSm,
        md: UI_BASES.statusbar.iconMd,
        lg: UI_BASES.statusbar.iconLg,
    };

    const dim = sizeMap[size] ?? UI_BASES.statusbar.iconMd;

    return (
        <Icon
            className={className}
            strokeWidth={strokeWidth ?? ICON_STROKE_WIDTH}
            style={{ width: dim, height: dim, ...style }}
        />
    );
};

export default StatusIcon;
