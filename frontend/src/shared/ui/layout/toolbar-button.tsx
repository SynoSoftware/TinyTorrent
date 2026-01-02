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

export const ICON_SIZE_VARS: Record<ToolbarIconSize, string> = {
    sm: "var(--tt-status-icon-sm)",
    md: "var(--tt-status-icon-md)",
    lg: "var(--tt-status-icon-lg)",
    xl: "var(--tt-status-icon-xl)",
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
            const sizeVar = ICON_SIZE_VARS[iconSize];
            return (
                <Icon
                    strokeWidth={strokeWidth}
                    className={cn("text-current", iconClass)}
                    style={{ width: sizeVar, height: sizeVar }}
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
            const sizeVar = ICON_SIZE_VARS[iconSize];
            const elProps = (element.props || {}) as any;
            const mergedStyle = {
                ...(elProps.style || {}),
                width: sizeVar,
                height: sizeVar,
            } as any;
            return cloneElement(element, {
                className: cn(iconClass, "text-current", elProps.className),
                style: mergedStyle,
            } as any);
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
                "p-tight inline-flex items-center justify-center transition-colors toolbar-icon-hit",
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
