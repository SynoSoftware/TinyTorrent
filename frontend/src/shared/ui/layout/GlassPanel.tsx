import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
    children: ReactNode;
};

export function GlassPanel({ className, ...props }: GlassPanelProps) {
    return (
        <div
            className={cn(
                "glass-panel bg-content1/90 text-foreground/90 border border-content1/30 border-t border-white/10 backdrop-blur-3xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] rounded-2xl",
                className
            )}
            {...props}
        />
    );
}
