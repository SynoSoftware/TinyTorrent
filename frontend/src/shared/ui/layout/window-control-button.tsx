import { Button, cn } from "@heroui/react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";

import { registry } from "@/config/logic";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { control, surface } from "@/shared/ui/layout/glass-surface";
import {
    ICON_SIZE_CLASSES,
    type ToolbarIconSize,
} from "@/shared/ui/layout/toolbar-button";
const { visuals } = registry;

export type WindowControlButtonVariant = "neutral" | "danger";

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
        title,
        ...restProps
    },
    ref
) {
    const { disabled, ...buttonProps } = restProps;
    const iconSizeClass =
        ICON_SIZE_CLASSES[iconSize as ToolbarIconSize];
    const toneClass =
        tone === "danger"
            ? control.menu.action.windowButtonDanger
            : control.menu.action.windowButtonNeutral;

    const button = (
        <Button
            ref={ref}
            isIconOnly
            variant="ghost"
            radius="none"
            className={cn(
                control.menu.action.windowButtonBase,
                toneClass,
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
                    className={cn(surface.atom.textCurrent, iconSizeClass)}
                />
            )}
        </Button>
    );

    return typeof title === "string" && title.trim().length > 0 ? (
        <AppTooltip content={title}>
            {button}
        </AppTooltip>
    ) : (
        button
    );
});

