import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info } from "lucide-react";
import { cn } from "@heroui/react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH, HEADER_BASE } from "@/config/logic";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { DETAIL_TABS } from "@/modules/dashboard/hooks/useDetailTabs";

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
            className={cn(
                "flex items-center h-row",
                HEADER_BASE,

                // Header band (content-level)
                !isStandalone && "bg-content1/80 border-b border-default/10"
            )}
            style={{
                letterSpacing: "var(--tt-tracking-wide)",
            }}
        >
            {/* LEFT */}
            <div className="flex  items-center w-full gap-tight px-tight">
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-foreground/50 shrink-0 toolbar-icon-size-md"
                />
                <span className="truncate min-w-0 text-foreground font-semibold">
                    {renderedName}
                    {hasStatus ? (
                        <span
                            className="text-label text-foreground/60 block"
                            title={statusTooltip ?? undefined}
                        >
                            {statusLabel}
                            {primaryHint && (
                                <em className="text-label text-foreground/50">
                                    — {primaryHint}
                                </em>
                            )}
                        </span>
                    ) : null}
                </span>
            </div>

            {/* CENTER */}
            <div className="flex  items-center w-full gap-panel">
                <div className="flex items-center gap-tight">
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "py-tight rounded-full  border  text-scaled font-bold transition-colors px-panel",
                                activeTab === tab
                                    ? "text-foreground"
                                    : "text-foreground/60 hover:text-foreground"
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
            <div className="flex items-center gap-tight min-w-max px-tight">
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
