import { Button, cn } from "@heroui/react";
import {
    cloneElement,
    forwardRef,
    isValidElement,
    type ComponentPropsWithoutRef,
    type ReactElement,
    type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

import { ICON_STROKE_WIDTH } from "@/config/logic";

export type ToolbarIconSize = "sm" | "md" | "lg" | "xl";

export const ICON_SIZE_CLASSES: Record<ToolbarIconSize, string> = {
    sm: "toolbar-icon-size-sm",
    md: "toolbar-icon-size-md",
    lg: "toolbar-icon-size-lg",
    xl: "toolbar-icon-size-xl",
};

export interface ToolbarIconButtonProps
    extends Omit<ComponentPropsWithoutRef<typeof Button>, "isIconOnly"> {
    Icon?: LucideIcon;
    icon?: ReactNode;
    iconSize?: ToolbarIconSize;
    iconStrokeWidth?: number | string;
    ariaLabel?: string;
}

export const ToolbarIconButton = forwardRef<
    HTMLButtonElement,
    ToolbarIconButtonProps
>(function ToolbarIconButton(
    {
        Icon,
        icon,
        iconSize = "md",
        iconStrokeWidth,
        ariaLabel,
        title,
        className,
        children,
        variant,
        ...buttonProps
    },
    ref
) {
    const mergedVariant = variant ?? "ghost";
    const strokeWidth = iconStrokeWidth ?? ICON_STROKE_WIDTH;
    const iconClass = ICON_SIZE_CLASSES[iconSize];

    const iconContent = (() => {
        if (Icon) {
            return (
                <Icon
                    strokeWidth={strokeWidth}
                    className={cn("text-current", iconClass)}
                />
            );
        }

        const node = icon ?? children;
        if (!node) {
            return null;
        }

        if (isValidElement(node)) {
            const element = node as ReactElement<{
                className?: string;
            }>;
            return cloneElement(element, {
                className: cn(
                    iconClass,
                    "text-current",
                    element.props.className
                ),
            });
        }

        return <span className={cn(iconClass, "text-current")}>{node}</span>;
    })();

    return (
        <Button
            ref={ref}
            isIconOnly
            variant={mergedVariant}
            radius="full"
            className={cn(
                "p-tight inline-flex items-center justify-center transition-colors",
                className
            )}
            aria-label={ariaLabel}
            title={title}
            {...buttonProps}
        >
            {iconContent}
        </Button>
    );
});
