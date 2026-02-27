import { Button, cn } from "@heroui/react";
import {
    cloneElement, forwardRef, isValidElement, type CSSProperties, type ComponentPropsWithoutRef, type ReactElement, type ReactNode, } from "react";
import type { LucideIcon } from "lucide-react";

import { registry } from "@/config/logic";
import { SURFACE } from "@/shared/ui/layout/glass-surface";
const { visuals } = registry;

export type ToolbarIconSize = "sm" | "md" | "lg" | "xl";

// eslint-disable-next-line react-refresh/only-export-components
export const ICON_SIZE_CLASSES: Record<ToolbarIconSize, string> = {
    sm: "toolbar-icon-size-sm",
    md: "toolbar-icon-size-md",
    lg: "toolbar-icon-size-lg",
    xl: "toolbar-icon-size-xl",
};

// eslint-disable-next-line react-refresh/only-export-components
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
    const strokeWidth = iconStrokeWidth ?? visuals.icon.strokeWidth;
    const iconClass = ICON_SIZE_CLASSES[iconSize];

    type IconElementProps = {
        className?: string;
        style?: CSSProperties;
    };

    const iconContent = (() => {
        if (Icon) {
            const sizeVar = ICON_SIZE_VARS[iconSize];
            return (
                <Icon
                    strokeWidth={strokeWidth}
                    className={cn(SURFACE.atom.textCurrent, iconClass)}
                    style={{ width: sizeVar, height: sizeVar }}
                />
            );
        }

        const node = icon ?? children;
        if (!node) {
            return null;
        }

        if (isValidElement(node)) {
            const element = node as ReactElement<IconElementProps>;
            const sizeVar = ICON_SIZE_VARS[iconSize];
            const elProps = element.props ?? {};
            const mergedStyle: CSSProperties = {
                ...(elProps.style ?? {}),
                width: sizeVar,
                height: sizeVar,
            };
            return cloneElement(element, {
                className: cn(
                    iconClass,
                    SURFACE.atom.textCurrent,
                    elProps.className,
                ),
                style: mergedStyle,
            });
        }

        return (
            <span className={cn(iconClass, SURFACE.atom.textCurrent)}>{node}</span>
        );
    })();

    return (
        <Button
            ref={ref}
            isIconOnly
            variant={mergedVariant}
            radius="full"
            className={cn(
                `p-tight inline-flex items-center justify-center ${visuals.transitions.fast} toolbar-icon-hit`,
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

