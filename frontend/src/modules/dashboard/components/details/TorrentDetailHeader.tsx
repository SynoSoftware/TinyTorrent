import { useTranslation } from "react-i18next";
import { Pin, PinOff, X, Info } from "lucide-react";
import { cn } from "@heroui/react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH, HEADER_BASE } from "@/config/logic";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";
import { DETAIL_TABS } from "./useDetailTabs";

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
    onDock?: () => void;
    onPopout?: () => void;
    onClose?: () => void;
    activeTab: DetailTab;
    onTabChange: (tab: DetailTab) => void;
}

export const TorrentDetailHeader = (props: TorrentDetailHeaderProps) => {
    const {
        torrent,
        isDetailFullscreen = false,
        onDock,
        onPopout,
        onClose,
        activeTab,
        onTabChange,
    } = props;

    const { t } = useTranslation();
    const renderedName = truncateTorrentName(
        torrent?.name,
        t("general.unknown")
    );

    return (
        <div
            className={`flex items-center ${HEADER_BASE} h-row`}
            style={{ letterSpacing: "var(--tt-tracking-ultra)" }}
        >
            {/* LEFT */}
            <div className="flex items-center gap-tight min-w-0 px-panel">
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-foreground/50 shrink-0 toolbar-icon-size-md"
                />
                <span className="truncate min-w-0">{renderedName}</span>
            </div>

            {/* CENTER */}
            <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-tight">
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "px-panel py-tight rounded-full uppercase tracking-tight text-scaled font-bold transition-colors",
                                activeTab === tab
                                    ? "text-foreground"
                                    : "text-foreground/60 hover:text-foreground"
                            )}
                        >
                            {t(`inspector.tab.${tab}`)}
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-tight min-w-max px-panel">
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
