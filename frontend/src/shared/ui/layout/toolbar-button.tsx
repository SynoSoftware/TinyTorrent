import { Button, cn } from "@heroui/react";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import type { LucideIcon } from "lucide-react";

export const TOOLBAR_ICON_CLASSES =
    "text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60";

export const TOOLBAR_ICON_BUTTON_CLASSES =
    `${TOOLBAR_ICON_CLASSES} bg-content1/10 border border-content1/20`;

export type ToolbarIconButtonProps = {
    Icon: LucideIcon;
    ariaLabel: string;
    title?: string;
    onPress?: () => void;
    disabled?: boolean;
    className?: string;
};

export function ToolbarIconButton({
    Icon,
    ariaLabel,
    title,
    onPress,
    disabled,
    className,
}: ToolbarIconButtonProps) {
    return (
        <Button
            isIconOnly
            variant="light"
            radius="full"
            className={cn(
                TOOLBAR_ICON_BUTTON_CLASSES,
                className,
                disabled && "pointer-events-none opacity-40"
            )}
            aria-label={ariaLabel}
            title={title}
            onPress={onPress}
            disabled={disabled}
        >
            <Icon
                size={22}
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-current"
            />
        </Button>
    );
}
