import React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@heroui/react";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { registry } from "@/config/logic";
import { table } from "@/shared/ui/layout/glass-surface";
const { layout, visuals } = registry;

interface Props {
    isLoading?: boolean;
    shortcut?: string;
}

export const TorrentTable_EmptyState: React.FC<Props> = ({ isLoading = false, shortcut = "" }) => {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className={table.loadingRoot}>
                {Array.from({ length: 10 }).map((_, i) => (
                    <div
                        key={i}
                        className={table.loadingRow}
                        style={{
                            height: layout.table.rowHeight,
                        }}
                    >
                        <div className={table.loadingSkeletonWrap}>
                            <Skeleton className={table.loadingSkeleton} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={table.emptyRoot}>
            <div className={table.emptyHintRow} style={table.emptyHintTrackingStyle}>
                <StatusIcon Icon={FileUp} size="lg" className={table.emptyIcon} />
                <span>{t("table.empty_hint", { shortcut: shortcut })}</span>
            </div>
            <p className={table.emptySubtext} style={table.emptySubtextTrackingStyle}>
                {t("table.empty_hint_subtext")}
            </p>
            <div className={table.emptyPreview}>
                <div className={visuals.table.headerClass} style={table.emptyHintTrackingStyle}>
                    <span className={table.emptyBar} />
                    <span>{t("table.header_name")}</span>
                    <span>{t("table.header_speed")}</span>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className={table.emptyPreviewRow}>
                        <span className={table.emptyBar} />
                        <span className={table.emptyBar} />
                        <span className={table.emptyBar} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TorrentTable_EmptyState;
