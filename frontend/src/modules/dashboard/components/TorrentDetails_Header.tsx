import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info } from "lucide-react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { TEXT_ROLE, withOpacity } from "@/config/textRoles";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { DETAIL_TABS } from "@/modules/dashboard/hooks/useDetailTabs";
import {
    buildDetailViewHeaderClass,
    buildDetailViewHeaderTabButtonClass,
    DETAIL_VIEW_CLASS,
} from "@/shared/ui/layout/glass-surface";

const DETAIL_TAB_LABELS: Record<string, string> = {
    general: "inspector.tab.general",
    content: "inspector.tab.content",
    pieces: "inspector.tab.pieces",
    trackers: "inspector.tab.trackers",
    peers: "inspector.tab.peers",
    speed: "inspector.tab.speed",
};

const NAME_MAX_LENGTH = 56;

const truncateTorrentName = (value?: string, fallback?: string) => {
    if (!value && fallback) return fallback;
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.length <= NAME_MAX_LENGTH) return trimmed;
    const half = Math.floor((NAME_MAX_LENGTH - 1) / 2);
    return `${trimmed.slice(0, half)}~${trimmed.slice(trimmed.length - half)}`;
};

interface TorrentDetailHeaderProps {
    torrent?: TorrentDetail | null;
    isDetailFullscreen?: boolean;
    isStandalone?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
    onClose?: () => void;
    activeTab: DetailTab;
    onTabChange: (tab: DetailTab) => void;
    statusLabel?: string | null;
    statusTooltip?: string | null;
    primaryHint?: string | null;
}

export const TorrentDetailHeader = (props: TorrentDetailHeaderProps) => {
    const {
        torrent,
        isDetailFullscreen = false,
        isStandalone = false,
        onDock,
        onPopout,
        onClose,
        activeTab,
        onTabChange,
        statusLabel,
        statusTooltip,
        primaryHint,
    } = props;

    const { t } = useTranslation();
    const renderedName = truncateTorrentName(
        torrent?.name,
        t("general.unknown")
    );

    const hasStatus = Boolean(statusLabel);

    return (
        <div
            className={buildDetailViewHeaderClass(isStandalone)}
            style={DETAIL_VIEW_CLASS.headerTrackingStyle}
        >
            {/* LEFT */}
            <div className={DETAIL_VIEW_CLASS.headerLeft}>
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={DETAIL_VIEW_CLASS.headerInfoIcon}
                />
                <span className={DETAIL_VIEW_CLASS.headerTitle}>
                    {renderedName}
                    {hasStatus ? (
                        <span
                            className={DETAIL_VIEW_CLASS.headerStatus}
                            title={statusTooltip ?? undefined}
                        >
                            {statusLabel}
                            {primaryHint && (
                                <em className={withOpacity(TEXT_ROLE.caption, 50)}>
                                    - {primaryHint}
                                </em>
                            )}
                        </span>
                    ) : null}
                </span>
            </div>

            {/* CENTER */}
            <div className={DETAIL_VIEW_CLASS.headerCenter}>
                <div className={DETAIL_VIEW_CLASS.headerTabs}>
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={buildDetailViewHeaderTabButtonClass(
                                activeTab === tab,
                            )}
                        >
                            {t(
                                DETAIL_TAB_LABELS[tab] ?? `inspector.tab.${tab}`
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT */}
            <div className={DETAIL_VIEW_CLASS.headerRight}>
                {!isDetailFullscreen && onPopout && (
                    <ToolbarIconButton
                        Icon={PinOff}
                        ariaLabel={t("torrent_modal.actions.popout")}
                        onClick={onPopout}
                        iconSize="md"
                    />
                )}
                {isDetailFullscreen && onDock && (
                    <ToolbarIconButton
                        Icon={Pin}
                        ariaLabel={t("torrent_modal.actions.dock")}
                        onClick={onDock}
                        iconSize="md"
                    />
                )}
                {onClose && (
                    <ToolbarIconButton
                        Icon={X}
                        ariaLabel={t("torrent_modal.actions.close")}
                        onClick={onClose}
                        iconSize="md"
                    />
                )}
            </div>
        </div>
    );
};
