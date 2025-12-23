import { Button, Chip, Tab, Tabs, cn } from "@heroui/react";

import {
    Activity,
    Grid,
    HardDrive,
    Info,
    Maximize2,
    Minimize2,
    Network,
    Server,
    X,
} from "lucide-react";

import { AnimatePresence, motion } from "framer-motion";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";

import { formatTime } from "../../../shared/utils/format";

import {
    ICON_STROKE_WIDTH,
    STATUS_CHIP_GAP,
    STATUS_CHIP_RADIUS,
} from "../../../config/logic";

import type { Torrent, TorrentDetail } from "../types/torrent";

import { SmoothProgressBar } from "../../../shared/ui/components/SmoothProgressBar";

import type {
    TorrentPeerEntity,
    TorrentStatus,
} from "../../../services/rpc/entities";
import type {
    FileExplorerContextAction,
    FileExplorerEntry,
} from "../../../shared/ui/workspace/FileExplorerTree";
import type { PeerContextAction } from "./details/tabs/PeersTab";

import { ContentTab } from "./details/tabs/ContentTab";

import { GeneralTab } from "./details/tabs/GeneralTab";

import { PeersTab } from "./details/tabs/PeersTab";

import { PiecesTab } from "./details/tabs/PiecesTab";

import { SpeedTab } from "./details/tabs/SpeedTab";

export type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "trackers"
    | "peers"
    | "speed";

export type PeerSortStrategy = "none" | "speed";

interface TorrentDetailViewProps {
    torrent: TorrentDetail | null;
    onClose: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
    onPeerContextAction?: (
        action: PeerContextAction,
        peer: TorrentPeerEntity
    ) => void;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    peerSortStrategy?: PeerSortStrategy;
    inspectorTabCommand?: DetailTab | null;
    onInspectorTabCommandHandled?: () => void;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    isFullscreen?: boolean;
    onDock?: () => void;
    onPopout?: () => void;
}

type StatusChipColor = "success" | "primary" | "warning" | "danger";

const STATUS_CONFIG: Record<
    TorrentStatus,
    { color: StatusChipColor; labelKey: string }
> = {
    downloading: {
        color: "success",
        labelKey: "torrent_modal.statuses.downloading",
    },
    seeding: { color: "primary", labelKey: "torrent_modal.statuses.seeding" },
    paused: { color: "warning", labelKey: "torrent_modal.statuses.paused" },
    checking: { color: "warning", labelKey: "torrent_modal.statuses.checking" },
    queued: { color: "warning", labelKey: "torrent_modal.statuses.queued" },
    error: { color: "danger", labelKey: "torrent_modal.statuses.error" },
} as const;
const HEADER_STATUS_CHIP_STYLE: CSSProperties = {
    gap: `${STATUS_CHIP_GAP}px`,
    borderRadius: `${STATUS_CHIP_RADIUS}px`,
};

interface DetailHeaderContentProps {
    torrent: TorrentDetail;
    statusMeta: (typeof STATUS_CONFIG)[TorrentStatus];
    isFullscreen: boolean;
    onClose: () => void;
    onDock?: () => void;
    onPopout?: () => void;
    t: TFunction;
}

function DetailHeaderContent({
    torrent,
    statusMeta,
    isFullscreen,
    onClose,
    onDock,
    onPopout,
    t,
}: DetailHeaderContentProps) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-3">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground truncate">
                        {torrent.name}
                    </h3>
                    <Chip
                        size="sm"
                        variant="flat"
                        color={statusMeta.color}
                        style={HEADER_STATUS_CHIP_STYLE}
                        classNames={{
                            base: "h-6 px-3 flex-shrink-0",
                            content:
                                "text-[9px] font-bold uppercase tracking-[0.3em]",
                        }}
                    >
                        {t(statusMeta.labelKey)}
                    </Chip>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {!isFullscreen && onPopout && (
                    <Button
                        size="sm"
                        variant="light"
                        color="primary"
                        className="flex items-center gap-2"
                        onPress={onPopout}
                    >
                        <Maximize2
                            size={14}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-current"
                        />
                        {t("torrent_modal.actions.popout")}
                    </Button>
                )}
                {isFullscreen && onDock && (
                    <Button
                        size="sm"
                        variant="light"
                        color="primary"
                        className="flex items-center gap-2"
                        onPress={onDock}
                    >
                        <Minimize2
                            size={14}
                            strokeWidth={ICON_STROKE_WIDTH}
                            className="text-current"
                        />
                        {t("torrent_modal.actions.dock")}
                    </Button>
                )}
                <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={onClose}
                    className="text-foreground/40 hover:text-foreground"
                    aria-label={t("torrent_modal.actions.close")}
                >
                    <X
                        size={20}
                        strokeWidth={ICON_STROKE_WIDTH}
                        className="text-current"
                    />
                </Button>
            </div>
        </div>
    );
}

export function TorrentDetailView({
    torrent,

    onClose,

    onFilesToggle,

    onFileContextAction,
    onPeerContextAction,
    peerSortStrategy,
    inspectorTabCommand,
    onInspectorTabCommandHandled,

    onSequentialToggle,

    onSuperSeedingToggle,

    onForceTrackerReannounce,

    sequentialSupported: sequentialSupportedProp,

    superSeedingSupported: superSeedingSupportedProp,

    isFullscreen,

    onDock,

    onPopout,
}: TorrentDetailViewProps) {
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState<DetailTab>("general");

    const sequentialSupported =
        sequentialSupportedProp ?? Boolean(onSequentialToggle);

    const superSeedingSupported =
        superSeedingSupportedProp ?? Boolean(onSuperSeedingToggle);

    useEffect(() => {
        if (torrent) setActiveTab("general");
    }, [torrent?.id]);

    useEffect(() => {
        if (!inspectorTabCommand) return;
        setActiveTab(inspectorTabCommand);
        onInspectorTabCommandHandled?.();
    }, [inspectorTabCommand, onInspectorTabCommandHandled]);

    if (!torrent) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center px-5 text-center text-[10px] uppercase tracking-[0.4em] text-foreground/50">
                {t("torrent_modal.placeholder")}
            </div>
        );
    }

    const progressPercent = torrent.progress * 100;

    const activePeers =
        torrent.peerSummary.connected + (torrent.peerSummary.seeds ?? 0);

    const timeRemainingLabel =
        torrent.eta > 0
            ? formatTime(torrent.eta)
            : t("torrent_modal.eta_unknown");

    const trackers = torrent.trackers ?? [];

    const peerEntries = torrent.peers ?? [];

    const files = torrent.files ?? [];
    const downloadDir = torrent.savePath ?? t("torrent_modal.labels.unknown");
    const statusMeta = STATUS_CONFIG[torrent.state];
    const headerPanel = (
        <DetailHeaderContent
            torrent={torrent}
            statusMeta={statusMeta}
            isFullscreen={Boolean(isFullscreen)}
            onClose={onClose}
            onDock={onDock}
            onPopout={onPopout}
            t={t}
        />
    );
    const tabBodyClass = "flex-1 min-h-0 h-full overflow-y-auto px-5 pt-4 pb-5";
    const tabContentPadding = "pt-4";
    const tabContentClasses = cn(
        "min-h-0 pr-2 scrollbar-hide pb-8",
        activeTab === "peers" ? "overflow-y-hidden" : "overflow-y-auto"
    );
    const tabListClasses =
        "flex flex-row items-center gap-2 overflow-x-auto rounded-2xl border border-content1/20 bg-background/80 px-3 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.12)] scrollbar-hide";
    const tabClasses =
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-foreground/60 transition duration-150 select-none whitespace-nowrap flex-shrink-0 data-[selected=true]:bg-primary/25 data-[selected=true]:text-foreground data-[selected=true]:shadow-sm data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30";

    const headerWrapperClass =
        "sticky top-0 z-30 border-b border-content1/20 bg-background/80 backdrop-blur-2xl px-5 py-2 transition-all duration-200";

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className={headerWrapperClass}>{headerPanel}</div>

            <div className="flex-1 min-h-0 bg-content1/20 border-t border-content1/10">
                <div className={tabBodyClass}>
                    <Tabs
                        variant="light"
                        selectedKey={activeTab}
                        onSelectionChange={(k) => setActiveTab(k as DetailTab)}
                        className="w-full"
                        classNames={{
                            tabList: tabListClasses,

                            cursor: "hidden",

                            tab: tabClasses,
                        }}
                    >
                        <Tab
                            key="general"
                            title={
                                <div className="flex items-center gap-2">
                                    <Info
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.general")}
                                </div>
                            }
                        />

                        <Tab
                            key="content"
                            title={
                                <div className="flex items-center gap-2">
                                    <HardDrive
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.content")}
                                </div>
                            }
                        />

                        <Tab
                            key="pieces"
                            title={
                                <div className="flex items-center gap-2">
                                    <Grid
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.pieces")}
                                </div>
                            }
                        />

                        <Tab
                            key="trackers"
                            title={
                                <div className="flex items-center gap-2">
                                    <Server
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.trackers")}
                                </div>
                            }
                        />

                        <Tab
                            key="peers"
                            title={
                                <div className="flex items-center gap-2">
                                    <Network
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.peers")}
                                </div>
                            }
                        />

                        <Tab
                            key="speed"
                            title={
                                <div className="flex items-center gap-2">
                                    <Activity
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />

                                    {t("torrent_modal.tabs.speed")}
                                </div>
                            }
                        />
                    </Tabs>

                    <div className={tabContentPadding}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className={tabContentClasses}
                            >
                                {activeTab === "general" && (
                                    <GeneralTab
                                        torrent={torrent}
                                        downloadDir={downloadDir}
                                        sequentialSupported={
                                            sequentialSupported
                                        }
                                        superSeedingSupported={
                                            superSeedingSupported
                                        }
                                        onSequentialToggle={onSequentialToggle}
                                        onSuperSeedingToggle={
                                            onSuperSeedingToggle
                                        }
                                        onForceTrackerReannounce={
                                            onForceTrackerReannounce
                                        }
                                        progressPercent={progressPercent}
                                        timeRemainingLabel={timeRemainingLabel}
                                        activePeers={activePeers}
                                    />
                                )}

                                {activeTab === "pieces" && (
                                    <PiecesTab
                                        piecePercent={torrent.progress}
                                        pieceCount={torrent.pieceCount}
                                        pieceSize={torrent.pieceSize}
                                        pieceStates={torrent.pieceStates}
                                        pieceAvailability={
                                            torrent.pieceAvailability
                                        }
                                    />
                                )}

                                {activeTab === "speed" && (
                                    <SpeedTab torrent={torrent} />
                                )}

                                {activeTab === "content" && (
                                    <ContentTab
                                        files={files}
                                        emptyMessage={t(
                                            "torrent_modal.files_empty"
                                        )}
                                        onFilesToggle={onFilesToggle}
                                        onFileContextAction={
                                            onFileContextAction
                                        }
                                    />
                                )}

                                {activeTab === "peers" && (
                                    <PeersTab
                                        peers={peerEntries}
                                        onPeerContextAction={
                                            onPeerContextAction
                                        }
                                        sortBySpeed={
                                            peerSortStrategy === "speed"
                                        }
                                    />
                                )}

                                {activeTab === "trackers" && (
                                    <div className="flex flex-col gap-2">
                                        {trackers.length === 0 && (
                                            <div className="px-4 py-3 text-xs text-foreground/50">
                                                {t(
                                                    "torrent_modal.trackers.empty"
                                                )}
                                            </div>
                                        )}

                                        {trackers.map((tracker) => (
                                            <GlassPanel
                                                key={`${tracker.announce}-${tracker.tier}`}
                                                className="p-3 flex items-center justify-between hover:bg-content1/50 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(
                                                            "w-1.5 h-1.5 rounded-full",

                                                            tracker.lastAnnounceSucceeded
                                                                ? "bg-success shadow-small"
                                                                : "bg-warning"
                                                        )}
                                                    />

                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-mono text-foreground/80 truncate max-w-xs">
                                                            {tracker.announce}
                                                        </span>

                                                        <span className="text-[10px] text-foreground/40">
                                                            {t(
                                                                "torrent_modal.trackers.tier"
                                                            )}{" "}
                                                            {tracker.tier} -{" "}
                                                            {tracker.lastAnnounceResult ||
                                                                "-"}{" "}
                                                            -{" "}
                                                            {tracker.lastAnnounceSucceeded
                                                                ? t(
                                                                      "torrent_modal.trackers.status_online"
                                                                  )
                                                                : t(
                                                                      "torrent_modal.trackers.status_partial"
                                                                  )}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/30">
                                                        {t(
                                                            "torrent_modal.trackers.peers_label"
                                                        )}
                                                    </span>

                                                    <div className="font-mono text-xs">
                                                        {t(
                                                            "torrent_modal.trackers.peer_summary",

                                                            {
                                                                seeded: tracker.seederCount,

                                                                leeching:
                                                                    tracker.leecherCount,
                                                            }
                                                        )}
                                                    </div>
                                                </div>
                                            </GlassPanel>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
