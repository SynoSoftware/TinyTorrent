import { useTranslation } from "react-i18next";
import { Pin, PinOff, X } from "lucide-react";
import { cn } from "@heroui/react";
import { Info } from "lucide-react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH } from "@/config/logic";
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
    const head = trimmed.slice(0, half);
    const tail = trimmed.slice(trimmed.length - half);
    return `${head}~${tail}`;
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
        <div className="flex items-center gap-tools px-tight py-tight rounded-panel bg-content1/20 border border-content1/20 shadow-inner h-row">
            {/* LEFT */}

            <div className="flex items-center gap-tight min-w-0">
                <Info
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-foreground/50 shrink-0 toolbar-icon-size-md"
                />
                <span className="text-scaled font-semibold uppercase text-foreground leading-tight tracking-tight truncate min-w-0">
                    {renderedName}
                </span>
            </div>
            {/* CENTER */}
            <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-tight">
                    {DETAIL_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={activeTab === tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "px-panel py-tight rounded-full uppercase tracking-tight text-scaled font-semibold transition-colors",
                                activeTab === tab
                                    ? "bg-primary/20 text-foreground"
                                    : "text-foreground/60 hover:text-foreground"
                            )}
                        >
                            {t(`inspector.tab.${tab}`)}
                        </button>
                    ))}
                </div>
            </div>
            {/* RIGHT */}
            <div className="flex items-center gap-tight min-w-max">
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
