import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
};

export function GlassPanel({ className, ...props }: GlassPanelProps) {
    return (
        <div
            className={cn(
                "glass-panel border border-default/20 bg-background/70 text-foreground/90 backdrop-blur-3xl shadow-medium rounded-2xl",
                className
            )}
            {...props}
        />
    );
}
