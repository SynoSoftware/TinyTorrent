import React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@heroui/react";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { TABLE_HEADER_CLASS, TABLE_LAYOUT } from "@/config/logic";
import { TABLE } from "@/shared/ui/layout/glass-surface";

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
            <div className={TABLE.loadingRoot}>
                {Array.from({ length: 10 }).map((_, i) => (
                    <div
                        key={i}
                        className={TABLE.loadingRow}
                        style={{
                            height: TABLE_LAYOUT.rowHeight,
                        }}
                    >
                        <div className={TABLE.loadingSkeletonWrap}>
                            <Skeleton className={TABLE.loadingSkeleton} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={TABLE.emptyRoot}>
            <div
                className={TABLE.emptyHintRow}
                style={TABLE.emptyHintTrackingStyle}
            >
                <StatusIcon
                    Icon={FileUp}
                    size="lg"
                    className={TABLE.emptyIcon}
                />
                <span>{t("table.empty_hint", { shortcut: shortcut })}</span>
            </div>
            <p
                className={TABLE.emptySubtext}
                style={TABLE.emptySubtextTrackingStyle}
            >
                {t("table.empty_hint_subtext")}
            </p>
            <div className={TABLE.emptyPreview}>
                <div
                    className={TABLE_HEADER_CLASS}
                    style={TABLE.emptyHintTrackingStyle}
                >
                    <span className={TABLE.emptyBar} />
                    <span>{t("table.header_name")}</span>
                    <span>{t("table.header_speed")}</span>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className={TABLE.emptyPreviewRow}>
                        <span className={TABLE.emptyBar} />
                        <span className={TABLE.emptyBar} />
                        <span className={TABLE.emptyBar} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TorrentTable_EmptyState;
