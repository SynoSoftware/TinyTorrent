import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { control } from "@/shared/ui/layout/glass-surface";

type SurfaceLayer = 0 | 1 | 2;

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
    layer?: SurfaceLayer;
};

const SURFACE_CLASS_BY_LAYER: Record<SurfaceLayer, string> = {
    0: control.panel.canvas,
    1: control.panel.glass,
    2: control.panel.floating,
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
