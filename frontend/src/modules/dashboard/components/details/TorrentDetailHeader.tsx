import { useTranslation } from "react-i18next";
import {
    formatPrimaryActionHint,
    formatRecoveryStatus,
} from "@/shared/utils/recoveryFormat";
import { Pin, PinOff, X, Info } from "lucide-react";
import { cn } from "@heroui/react";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { ICON_STROKE_WIDTH, HEADER_BASE } from "@/config/logic";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
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
    isStandalone?: boolean;
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
        isStandalone = false,
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
                    {torrent?.errorEnvelope && (
                        <span className="text-label text-foreground/60 block">
                            {formatRecoveryStatus(
                                torrent.errorEnvelope,
                                t,
                                "general.unknown"
                            )}{" "}
                            {formatPrimaryActionHint(
                                torrent.errorEnvelope,
                                t
                            ) ? (
                                <em className="text-label text-foreground/50">
                                    —{" "}
                                    {formatPrimaryActionHint(
                                        torrent.errorEnvelope,
                                        t
                                    )}
                                </em>
                            ) : null}
                        </span>
                    )}
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
                            {t(`inspector.tab.${tab}`)}
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
