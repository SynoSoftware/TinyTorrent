import { cn } from "@heroui/react";
import type { CSSProperties } from "react";
import { SURFACE } from "@/shared/ui/layout/glass-surface";

interface TinyTorrentIconProps {
    className?: string;
    title?: string;
    style?: CSSProperties;
}

export function TinyTorrentIcon({
    className,
    title,
    style,
}: TinyTorrentIconProps) {
    return (
        <img
            src="/tinyTorrent.svg"
            alt={title ?? "TinyTorrent"}
            className={cn(SURFACE.atom.objectContain, className)}
            style={style}
        />
    );
}
