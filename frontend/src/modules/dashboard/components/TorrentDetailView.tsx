import { Button, Chip, Switch, Tab, Tabs, cn } from "@heroui/react";
import {
    Activity,
    ArrowDownCircle,
    ArrowUpCircle,
    Copy,
    Grid,
    HardDrive,
    Folder,
    Hash,
    Info,
    Network,
    PauseCircle,
    PlayCircle,
    Server,
    Trash2,
    X,
    Pin,
    PinOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "../../../shared/ui/layout/GlassPanel";
import { formatBytes, formatTime } from "../../../shared/utils/format";
import constants from "../../../config/constants.json";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import { INTERACTION_CONFIG } from "../../../config/interaction";
import type { Torrent, TorrentDetail } from "../types/torrent";
import { SmoothProgressBar } from "../../../shared/ui/components/SmoothProgressBar";
import type { TorrentTableAction } from "./TorrentTable";
import type { TorrentStatus } from "../../../services/rpc/entities";
import { ContentTab } from "./details/tabs/ContentTab";
import { GeneralTab } from "./details/tabs/GeneralTab";
import { PeersTab } from "./details/tabs/PeersTab";
import { PiecesTab } from "./details/tabs/PiecesTab";
import { SpeedTab } from "./details/tabs/SpeedTab";

const GLASS_TOOLTIP_CLASSNAMES = {
    content:
        "bg-content1/80 border border-content1/20 backdrop-blur-3xl shadow-[0_25px_75px_rgba(0,0,0,0.35)] rounded-2xl px-3 py-1.5 text-[11px] leading-tight text-foreground/90",
    arrow: "bg-content1/80",
} as const;

// --- TYPES ---
type DetailTab =
    | "general"
    | "content"
    | "pieces"
    | "trackers"
    | "peers"
    | "speed";

interface TorrentDetailViewProps {
    torrent: TorrentDetail | null;
    onClose: () => void;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => Promise<void> | void;
    onSequentialToggle?: (enabled: boolean) => Promise<void> | void;
    onSuperSeedingToggle?: (enabled: boolean) => Promise<void> | void;
    onForceTrackerReannounce?: () => Promise<void> | void;
    sequentialSupported?: boolean;
    superSeedingSupported?: boolean;
    onAction?: (action: TorrentTableAction, torrent: Torrent) => void;
    isPinned?: boolean;
    onTogglePin?: () => void;
}

type StatusChipColor = "success" | "primary" | "warning" | "danger";

// --- MAIN COMPONENT ---

const STATUS_CONFIG: Record<
    TorrentStatus,
    { color: StatusChipColor; labelKey: string }
> = {
    downloading: {
        color: "success",
        labelKey: "torrent_modal.statuses.downloading",
    },
    seeding: {
        color: "primary",
        labelKey: "torrent_modal.statuses.seeding",
    },
    paused: {
        color: "warning",
        labelKey: "torrent_modal.statuses.paused",
    },
    checking: {
        color: "warning",
        labelKey: "torrent_modal.statuses.checking",
    },
    queued: {
        color: "warning",
        labelKey: "torrent_modal.statuses.queued",
    },
    error: { color: "danger", labelKey: "torrent_modal.statuses.error" },
} as const;

export function TorrentDetailView({
    torrent,
    onClose,
    onFilesToggle,
    onSequentialToggle,
    onSuperSeedingToggle,
    onForceTrackerReannounce,
    sequentialSupported: sequentialSupportedProp,
    superSeedingSupported: superSeedingSupportedProp,
    onAction,
    isPinned = false,
    onTogglePin,
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

    const handleAction = useCallback(
        (action: TorrentTableAction) => {
            if (!torrent || !onAction) return;
            onAction(action, torrent);
        },
        [onAction, torrent]
    );

    const handleCopyHash = () => {
        if (!torrent) return;
        navigator.clipboard.writeText(torrent.hash);
    };

    if (!torrent) return null;

    const progressPercent = torrent.progress * 100;
    const activePeers =
        torrent.peerSummary.connected + (torrent.peerSummary.seeds ?? 0);
    const timeRemainingLabel =
        torrent.eta > 0
            ? formatTime(torrent.eta)
            : t("torrent_modal.eta_unknown");
    const canPause = ["downloading", "seeding", "checking"].includes(
        torrent.state
    );
    const canResume = ["paused", "queued", "error"].includes(torrent.state);

    const trackers = torrent.trackers ?? [];
    const peerEntries = torrent.peers ?? [];
    const files = torrent.files ?? [];
    const downloadDir = torrent.savePath ?? t("torrent_modal.labels.unknown");
    const statusMeta = STATUS_CONFIG[torrent.state];
    const tabContentClasses = cn(
        "min-h-0 pr-2 scrollbar-hide pb-8",
        activeTab === "peers" ? "overflow-y-hidden" : "overflow-y-auto"
    );
    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="sticky top-0 z-30 border-b border-content1/20 bg-background/90 backdrop-blur-2xl">
                <div className="px-6 pt-6 pb-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-foreground truncate">
                                    {torrent.name}
                                </h3>
                                <Chip
                                    size="sm"
                                    variant="flat"
                                    color={statusMeta.color}
                                    classNames={{
                                        base: "h-5 px-1",
                                        content:
                                            "text-[9px] font-bold uppercase tracking-wider",
                                    }}
                                >
                                    {t(statusMeta.labelKey)}
                                </Chip>
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                                {t("torrent_modal.general.hash")}:{" "}
                                {torrent.hash.substring(0, 8)}...
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {canPause && (
                                <Button
                                    size="sm"
                                    variant="shadow"
                                    color="warning"
                                    className="flex items-center gap-1"
                                    onPress={() => handleAction("pause")}
                                >
                                    <PauseCircle
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />
                                    {t("table.actions.pause")}
                                </Button>
                            )}
                            {canResume && (
                                <Button
                                    size="sm"
                                    variant="shadow"
                                    color="success"
                                    className="flex items-center gap-1"
                                    onPress={() => handleAction("resume")}
                                >
                                    <PlayCircle
                                        size={14}
                                        strokeWidth={ICON_STROKE_WIDTH}
                                        className="text-current"
                                    />
                                    {t("table.actions.resume")}
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="flat"
                                color="danger"
                                className="flex items-center gap-1"
                                onPress={() => handleAction("remove")}
                            >
                                <Trash2
                                    size={14}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                                {t("table.actions.remove")}
                            </Button>
                            {onTogglePin && (
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    onPress={onTogglePin}
                                    aria-label={
                                        isPinned
                                            ? t(
                                                  "torrent_modal.actions.popout_panel"
                                              )
                                            : t(
                                                  "torrent_modal.actions.pin_panel"
                                              )
                                    }
                                    title={
                                        isPinned
                                            ? t(
                                                  "torrent_modal.actions.popout_panel"
                                              )
                                            : t(
                                                  "torrent_modal.actions.pin_panel"
                                              )
                                    }
                                    className="text-foreground/40 hover:text-foreground"
                                >
                                    {isPinned ? (
                                        <PinOff
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="text-current"
                                        />
                                    ) : (
                                        <Pin
                                            size={16}
                                            strokeWidth={ICON_STROKE_WIDTH}
                                            className="text-current"
                                        />
                                    )}
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

                    <div className="rounded-2xl border border-content1/20 bg-content1/20 p-4 space-y-3">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold mb-1">
                                    {t("torrent_modal.stats.total_progress")}
                                </div>
                                <div className="text-4xl font-mono font-medium tracking-tight">
                                    {progressPercent.toFixed(1)}%
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold">
                                    {t("torrent_modal.stats.time_remaining")}
                                </div>
                                <div className="font-mono text-xl">
                                    {timeRemainingLabel}
                                </div>
                            </div>
                        </div>

                        <div className="h-3">
                            <SmoothProgressBar
                                value={progressPercent}
                                trackClassName="h-full bg-content1/20"
                                indicatorClassName="h-full bg-gradient-to-r from-success/50 to-success"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold text-foreground/40">
                                <span>
                                    {t("torrent_modal.stats.availability")}
                                </span>
                                <span className="text-primary">
                                    {activePeers}{" "}
                                    {t("torrent_modal.stats.active")}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-content1/20 rounded-full overflow-hidden flex">
                                <div className="h-full bg-primary w-full opacity-80" />{" "}
                                {/* Full bar implies 100% available */}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BODY --- */}
            <div className="flex-1 min-h-0 bg-content1/20 border-t border-content1/10">
                <div className="flex-1 min-h-0 h-full overflow-y-auto px-6 pb-6 pt-6">
                    <Tabs
                        variant="underlined"
                        selectedKey={activeTab}
                        onSelectionChange={(k) => setActiveTab(k as DetailTab)}
                        classNames={{
                            tabList: "gap-6 p-0",
                            cursor: "w-full bg-primary h-[2px]",
                            tab: "px-0 h-9 text-xs font-medium text-foreground/50 data-[selected=true]:text-foreground data-[selected=true]:font-bold",
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
                                    />{" "}
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
                                    />{" "}
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
                                    />{" "}
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
                                    />{" "}
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
                                    />{" "}
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
                                    />{" "}
                                    {t("torrent_modal.tabs.speed")}
                                </div>
                            }
                        />
                    </Tabs>
                    <div className="pt-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className={tabContentClasses}
                            >
                                {/* --- TAB: GENERAL --- */}
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
                                    />
                                )}

                                {/* --- TAB: PIECES --- */}
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
                                {/* --- TAB: SPEED --- */}
                                {activeTab === "speed" && (
                                    <SpeedTab torrent={torrent} />
                                )}

                                {/* --- TAB: CONTENT --- */}
                                {activeTab === "content" && (
                                    <ContentTab
                                        files={files}
                                        emptyMessage={t(
                                            "torrent_modal.files_empty"
                                        )}
                                        onFilesToggle={onFilesToggle}
                                    />
                                )}

                                {/* --- TAB: PEERS --- */}
                                {activeTab === "peers" && (
                                    <PeersTab peers={peerEntries} />
                                )}
                                {/* --- TAB: TRACKERS --- */}
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
                                                                ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]"
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
