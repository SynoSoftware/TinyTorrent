import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type SurfaceLayer = 0 | 1 | 2;

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
    layer?: SurfaceLayer;
};

export function GlassPanel({
    className,
    layer = 2,
    ...props
}: GlassPanelProps) {
    return (
        <div
            className={cn(
                "glass-panel text-foreground/90",
                `surface-layer-${layer}`,
                className
            )}
            {...props}
        />
    );
}
