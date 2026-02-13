import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info } from "lucide-react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { DETAIL_TABS } from "@/modules/dashboard/hooks/useDetailTabs";
import { DETAILS } from "@/shared/ui/layout/glass-surface";

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
        t("general.unknown"),
    );

    const hasStatus = Boolean(statusLabel);

    return (
        <div
            className={DETAILS.builder.headerClass(isStandalone)}
            style={DETAILS.headerTrackingStyle}
        >
            {/* LEFT */}
            <div className={DETAILS.headerLeft}>
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={DETAILS.headerInfoIcon}
                />
                <span className={DETAILS.headerTitle}>
                    {renderedName}
                    {hasStatus ? (
                        <span
                            className={DETAILS.headerStatus}
                            title={statusTooltip ?? undefined}
                        >
                            {statusLabel}
                            {primaryHint && (
                                <em className={DETAILS.headerPrimaryHint}>
                                    - {primaryHint}
                                </em>
                            )}
                        </span>
                    ) : null}
                </span>
            </div>

            {/* CENTER */}
            <div className={DETAILS.headerCenter}>
                <div className={DETAILS.headerTabs}>
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={DETAILS.builder.headerTabButtonClass(
                                activeTab === tab,
                            )}
                        >
                            {t(
                                DETAIL_TAB_LABELS[tab] ??
                                    `inspector.tab.${tab}`,
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT */}
            <div className={DETAILS.headerRight}>
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
