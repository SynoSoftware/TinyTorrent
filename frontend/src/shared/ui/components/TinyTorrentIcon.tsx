import { cn } from "@heroui/react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { surface } from "@/shared/ui/layout/glass-surface";

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
    const { t } = useTranslation();
    return (
        <img
            src="/tinyTorrent.svg"
            alt={title ?? t("brand.name")}
            className={cn(surface.atom.objectContain, className)}
            style={style}
        />
    );
}
