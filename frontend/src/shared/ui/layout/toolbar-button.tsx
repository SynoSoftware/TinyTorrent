// All config tokens imported from '@/config/logic'. Icon sizing uses ICON_STROKE_WIDTH from config.

import { Button, cn } from "@heroui/react";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import {
    forwardRef,
    type ComponentPropsWithoutRef,
    type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

export const TOOLBAR_ICON_CLASSES =
    "flex items-center justify-center text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60";

export const TOOLBAR_ICON_BUTTON_CLASSES = `${TOOLBAR_ICON_CLASSES} bg-content1/10 border border-content1/20`;

export type ToolbarIconSize = "sm" | "md" | "lg" | "xl";

export const ICON_SIZE_MAP: Record<ToolbarIconSize, string> = {
    sm: "var(--tt-status-icon-sm)",
    md: "var(--tt-status-icon-md)",
    lg: "var(--tt-status-icon-lg)",
    xl: "var(--tt-status-icon-xl)",
};

export type ToolbarIconButtonProps = ComponentPropsWithoutRef<typeof Button> & {
    Icon?: LucideIcon;
    icon?: ReactNode;
    ariaLabel: string;
    iconSize?: ToolbarIconSize;
};

export const ToolbarIconButton = forwardRef<
    HTMLButtonElement,
    ToolbarIconButtonProps
>(function ToolbarIconButton(
    { Icon, icon, ariaLabel, className, iconSize = "lg", ...restProps },
    ref
) {
    const { disabled, ...buttonProps } = restProps;
    const content =
        icon ??
        (Icon ? (
            <Icon
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-current "
                style={{
                    width: ICON_SIZE_MAP[iconSize as ToolbarIconSize],
                    height: ICON_SIZE_MAP[iconSize as ToolbarIconSize],
                }}
            />
        ) : null);

    return (
        <Button
            ref={ref}
            isIconOnly
            variant="light"
            radius="full"
            className={cn(
                TOOLBAR_ICON_BUTTON_CLASSES,
                className,
                disabled && "pointer-events-none opacity-40"
            )}
            aria-label={ariaLabel}
            disabled={disabled}
            {...buttonProps}
        >
            {content}
        </Button>
    );
});
