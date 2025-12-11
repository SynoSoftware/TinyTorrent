import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
};

export function GlassPanel({ className, ...props }: GlassPanelProps) {
    return (
        <div
            className={cn(
                "glass-panel surface-layer-2 text-foreground/90",
                className
            )}
            {...props}
        />
    );
}
