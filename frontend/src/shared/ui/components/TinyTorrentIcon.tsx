import { cn } from "@heroui/react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
    return (
        <img
            src="/tinyTorrent.svg"
            alt={title ?? t("brand.name")}
            className={cn(SURFACE.atom.objectContain, className)}
            style={style}
        />
    );
}
