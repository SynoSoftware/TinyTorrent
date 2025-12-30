import { Button, cn } from "@heroui/react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";

import { ICON_STROKE_WIDTH } from "@/config/logic";
import {
    ICON_SIZE_MAP,
    type ToolbarIconSize,
} from "@/shared/ui/layout/toolbar-button";

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

    return (
        <Button
            ref={ref}
            isIconOnly
            variant="ghost"
            radius="none"
            className={cn(
                "flex h-full items-center justify-center rounded-none border-0 px-0 transition-none",
                VARIANT_CLASSES[tone],
                className,
                disabled && "pointer-events-none opacity-40"
            )}
            style={{ width: "var(--tt-navbar-h)" }}
            aria-label={ariaLabel}
            disabled={disabled}
            {...buttonProps}
        >
            {Icon && (
                <Icon
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-current"
                    style={{
                        width: ICON_SIZE_MAP[iconSize],
                        height: ICON_SIZE_MAP[iconSize],
                    }}
                />
            )}
        </Button>
    );
});
