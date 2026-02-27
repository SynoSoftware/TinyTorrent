import { Button, cn } from "@heroui/react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";

import { registry } from "@/config/logic";
import { SURFACE } from "@/shared/ui/layout/glass-surface";
import {
    ICON_SIZE_CLASSES,
    type ToolbarIconSize,
} from "@/shared/ui/layout/toolbar-button";
const { layout, visuals, ui } = registry;

export type WindowControlButtonVariant = "neutral" | "danger";

const VARIANT_CLASSES: Record<WindowControlButtonVariant, string> = {
    neutral: "text-foreground/60 hover:text-foreground hover:bg-primary/10",
    danger: "text-foreground/60 hover:text-danger hover:bg-danger/20",
};

export type WindowControlButtonProps = Omit<
    ComponentPropsWithoutRef<typeof Button>,
    "variant"
> & {
    Icon?: LucideIcon;
    ariaLabel: string;
    iconSize?: ToolbarIconSize;
    tone?: WindowControlButtonVariant;
};

export const WindowControlButton = forwardRef<
    HTMLButtonElement,
    WindowControlButtonProps
>(function WindowControlButton(
    {
        Icon,
        ariaLabel,
        iconSize = "lg",
        tone = "neutral",
        className,
        ...restProps
    },
    ref
) {
    const { disabled, ...buttonProps } = restProps;
    const iconSizeClass =
        ICON_SIZE_CLASSES[iconSize as ToolbarIconSize];

    return (
        <Button
            ref={ref}
            isIconOnly
            variant="ghost"
            radius="none"
            className={cn(
                "flex h-full items-center justify-center rounded-none border-0 px-0 transition-none",
                VARIANT_CLASSES[tone],
                "window-control-button-width",
                className,
                disabled && visuals.state.disabled
            )}
            aria-label={ariaLabel}
            disabled={disabled}
            {...buttonProps}
        >
            {Icon && (
                <Icon
                    strokeWidth={visuals.icon.strokeWidth}
                    className={cn(SURFACE.atom.textCurrent, iconSizeClass)}
                />
            )}
        </Button>
    );
});

