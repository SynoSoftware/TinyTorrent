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

export type ToolbarIconButtonProps = ComponentPropsWithoutRef<typeof Button> & {
    Icon?: LucideIcon;
    icon?: ReactNode;
    ariaLabel: string;
};

export const ToolbarIconButton = forwardRef<
    HTMLButtonElement,
    ToolbarIconButtonProps
>(function ToolbarIconButton(
    { Icon, icon, ariaLabel, className, ...restProps },
    ref
) {
    const { disabled, ...buttonProps } = restProps;
    const content =
        icon ??
        (Icon ? (
            <Icon
                size={22}
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-current"
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
