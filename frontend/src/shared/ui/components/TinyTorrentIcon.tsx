import { cn } from "@heroui/react";
import type { CSSProperties } from "react";

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
            className={cn("object-contain", className)}
            style={style}
        />
    );
}
