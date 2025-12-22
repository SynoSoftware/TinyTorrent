import { cn } from "@heroui/react";

interface TinyTorrentIconProps {
    className?: string;
    title?: string;
}

export function TinyTorrentIcon({ className, title }: TinyTorrentIconProps) {
    return (
        <img
            src="/tinyTorrent.svg"
            alt={title ?? "TinyTorrent"}
            className={cn("object-contain", className)}
        />
    );
}
