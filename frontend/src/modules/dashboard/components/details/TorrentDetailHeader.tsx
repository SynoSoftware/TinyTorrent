import { Tab, Tabs } from "@heroui/react";
import {
    Activity,
    Grid,
    HardDrive,
    Info,
    Network,
    Server,
    Pin,
    PinOff,
    X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";

import { ICON_STROKE_WIDTH } from "@/config/logic";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { DetailTab } from "@/modules/dashboard/types/torrentDetail";

const TAB_CONFIG: Array<{
    key: DetailTab;
    Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    labelKey: string;
}> = [
    { key: "general", Icon: Info, labelKey: "torrent_modal.tabs.general" },
    { key: "content", Icon: HardDrive, labelKey: "torrent_modal.tabs.content" },
    { key: "pieces", Icon: Grid, labelKey: "torrent_modal.tabs.pieces" },
    { key: "trackers", Icon: Server, labelKey: "torrent_modal.tabs.trackers" },
    { key: "peers", Icon: Network, labelKey: "torrent_modal.tabs.peers" },
    { key: "speed", Icon: Activity, labelKey: "torrent_modal.tabs.speed" },
];

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

const buildPropertyText = (
    t: ReturnType<typeof useTranslation>["t"],
    torrent?: TorrentDetail | null
) => {
    if (!torrent) return null;
    const pieces: string[] = [];
    const percent = Math.round((torrent.progress ?? 0) * 100);
    pieces.push(`${percent}%`);
    const activePeers = torrent.peerSummary?.connected ?? 0;
    if (typeof activePeers === "number") {
        pieces.push(`${activePeers} ${t("torrent_modal.stats.active")}`);
    }
    pieces.push(t(`torrent_modal.statuses.${torrent.state}`));
    return pieces.join(" · ");
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

export const TorrentDetailHeader = ({
    torrent,
    isDetailFullscreen = false,
    onDock,
    onPopout,
    onClose,
    activeTab,
    onTabChange,
}: TorrentDetailHeaderProps) => {
    const { t } = useTranslation();
    const propertyText = buildPropertyText(t, torrent);
    const renderedName = truncateTorrentName(
        torrent?.name,
        t("general.unknown")
    );

    return (
        <div className="flex items-center gap-tight px-tight py-tight relative">
            <div className="flex-shrink-0">
                <Tabs
                    aria-label={t("inspector.panel_label")}
                    variant="ghost"
                    size="md"
                    selectedKey={activeTab}
                    onSelectionChange={(key) => onTabChange(key as DetailTab)}
                    classNames={{
                        tabList:
                            "flex flex-col gap-tight p-tight rounded-panel bg-content1/20 border border-content1/20 shadow-inner",
                        tab: "text-xs font-semibold uppercase tracking-widest text-foreground/50 data-[selected=true]:text-foreground data-[selected=true]:bg-content1/10 data-[selected=true]:shadow-sm data-[selected=true]:rounded-xl",
                        cursor: "hidden",
                    }}
                >
                    {TAB_CONFIG.map(({ key, Icon, labelKey }) => (
                        <Tab
                            key={key}
                            title={
                                <div className="flex items-center gap-tight">
                                    <Icon
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />
                                    {t(labelKey)}
                                </div>
                            }
                        />
                    ))}
                </Tabs>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-tight text-center">
                {propertyText && (
                    <span className="hidden sm:block text-scaled font-semibold uppercase tracking-tighter text-foreground/50">
                        {propertyText}
                    </span>
                )}
                <span className="text-scaled font-semibold uppercase truncate text-foreground">
                    {renderedName}
                </span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-label tracking-label uppercase text-foreground/40 pointer-events-none">
                {t("inspector.panel_label")}
            </div>
            <div className="flex items-center gap-tight">
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
