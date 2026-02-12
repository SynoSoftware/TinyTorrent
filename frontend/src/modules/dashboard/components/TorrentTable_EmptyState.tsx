import React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@heroui/react";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FileUp } from "lucide-react";
import { TABLE_HEADER_CLASS, TABLE_LAYOUT } from "@/config/logic";
import {
    TABLE_VIEW_CLASS,
} from "@/shared/ui/layout/glass-surface";

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
            <div className={TABLE_VIEW_CLASS.loadingRoot}>
                {Array.from({ length: 10 }).map((_, i) => (
                    <div
                        key={i}
                        className={TABLE_VIEW_CLASS.loadingRow}
                        style={{
                            height: TABLE_LAYOUT.rowHeight,
                        }}
                    >
                        <div className={TABLE_VIEW_CLASS.loadingSkeletonWrap}>
                            <Skeleton className={TABLE_VIEW_CLASS.loadingSkeleton} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={TABLE_VIEW_CLASS.emptyRoot}>
            <div
                className={TABLE_VIEW_CLASS.emptyHintRow}
                style={TABLE_VIEW_CLASS.emptyHintTrackingStyle}
            >
                <StatusIcon Icon={FileUp} size="lg" className={TABLE_VIEW_CLASS.emptyIcon} />
                <span>{t("table.empty_hint", { shortcut: shortcut })}</span>
            </div>
            <p
                className={TABLE_VIEW_CLASS.emptySubtext}
                style={TABLE_VIEW_CLASS.emptySubtextTrackingStyle}
            >
                {t("table.empty_hint_subtext")}
            </p>
            <div className={TABLE_VIEW_CLASS.emptyPreview}>
                <div
                    className={TABLE_HEADER_CLASS}
                    style={TABLE_VIEW_CLASS.emptyHintTrackingStyle}
                >
                    <span className={TABLE_VIEW_CLASS.emptyBar} />
                    <span>{t("table.header_name")}</span>
                    <span>{t("table.header_speed")}</span>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                    <div
                        key={index}
                        className={TABLE_VIEW_CLASS.emptyPreviewRow}
                    >
                        <span className={TABLE_VIEW_CLASS.emptyBar} />
                        <span className={TABLE_VIEW_CLASS.emptyBar} />
                        <span className={TABLE_VIEW_CLASS.emptyBar} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TorrentTable_EmptyState;
