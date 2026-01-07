import React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@heroui/react";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { TABLE_HEADER_CLASS, TABLE_LAYOUT } from "@/config/logic";

interface Props {
    isLoading?: boolean;
    shortcut?: string;
}

export const TorrentTable_EmptyState: React.FC<Props> = ({
    isLoading = false,
    shortcut = "",
}) => {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="w-full">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex items-center w-full border-b border-content1/5 px-panel"
                        style={{
                            height: TABLE_LAYOUT.rowHeight,
                        }}
                    >
                        <div className="w-full h-indicator">
                            <Skeleton className="h-full w-full rounded-md bg-content1/10" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center gap-stage px-stage text-foreground/60">
            <div
                className="flex items-center gap-tools text-xs font-semibold uppercase text-foreground/60"
                style={{
                    letterSpacing: "var(--tt-tracking-ultra)",
                }}
            >
                <StatusIcon Icon={FileUp} size="lg" className="text-primary" />
                <span>{t("table.empty_hint", { shortcut: shortcut })}</span>
            </div>
            <p
                className="text-scaled uppercase text-foreground/40"
                style={{
                    letterSpacing: "var(--tt-tracking-wide)",
                }}
            >
                {t("table.empty_hint_subtext")}
            </p>
            <div className="w-full max-w-3xl space-y-tight">
                <div
                    className={TABLE_HEADER_CLASS}
                    style={{
                        letterSpacing: "var(--tt-tracking-ultra)",
                    }}
                >
                    <span className="h-indicator w-full rounded-full bg-content1/20" />
                    <span>{t("table.header_name")}</span>
                    <span>{t("table.header_speed")}</span>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                    <div
                        key={index}
                        className="grid grid-cols-torrent gap-tools rounded-2xl bg-content1/10 px-panel py-panel"
                    >
                        <span className="h-indicator w-full rounded-full bg-content1/20" />
                        <span className="h-indicator w-full rounded-full bg-content1/20" />
                        <span className="h-indicator w-full rounded-full bg-content1/20" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TorrentTable_EmptyState;
