import { cn } from "@heroui/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type GlassPanelProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

export function GlassPanel({ className, ...props }: GlassPanelProps) {
  return (
    <div
      className={cn(
        "bg-content1/10 border border-content1/30 backdrop-blur-3xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] rounded-2xl",
        className
      )}
      {...props}
    />
  );
}
