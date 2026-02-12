import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { SURFACE_ATOM_CLASS } from "@/shared/ui/layout/glass-surface";

type SurfaceLayer = 0 | 1 | 2;

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
    layer?: SurfaceLayer;
};

const SURFACE_CLASS_BY_LAYER: Record<SurfaceLayer, string> = {
    0: "glass-panel surface-layer-0 text-foreground",
    1: SURFACE_ATOM_CLASS.glassPanel,
    2: "glass-panel surface-layer-2 text-foreground",
};

export function GlassPanel({
    className,
    layer = 2,
    ...props
}: GlassPanelProps) {
    return (
        <div
            className={cn(SURFACE_CLASS_BY_LAYER[layer], className)}
            {...props}
        />
    );
}
