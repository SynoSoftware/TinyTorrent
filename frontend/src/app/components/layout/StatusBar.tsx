import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    AlertCircle,
    Network,
    Zap,
    HardDrive,
    Activity,
} from "lucide-react";
import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { formatSpeed } from "../../../shared/utils/format";
import { NetworkGraph } from "../../../shared/ui/graphs/NetworkGraph";
import type {
    SessionStats,
    TorrentEntity,
} from "../../../services/rpc/entities";
import type { RpcStatus } from "../../../shared/types/rpc";
import { ICON_STROKE_WIDTH } from "../../../config/iconography";
import type { FeedbackMessage, FeedbackTone } from "../../../shared/types/feedback";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
    PANEL_SHADOW,
} from "../../../shared/ui/layout/shadows";

// --- LAYOUT CONFIGURATION ---
// Adjust these variables to control spacing and symmetry
const LAYOUT_CONFIG = {
    // Spacing between the icon and the text/graph inside the speed modules
    gapInternal: "gap-2",
    // Spacing between major sections (Down vs Up, Context vs Network)
    gapSection: "gap-2",
    // Minimum widths to ensure right-side HUD elements align symmetrically
    hudWidths: {
        context: "min-w-[140px]",
        network: "min-w-[90px]",
        engine: "min-w-[90px]",
    },
    // Height of the status bar content area
    height: "h-[76px]",
};

const FEEDBACK_TONE_CLASSES: Record<FeedbackTone, string> = {
    info: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

interface StatusBarProps {
    sessionStats: SessionStats | null;
    downHistory: number[];
    upHistory: number[];
    rpcStatus: RpcStatus;
    selectedTorrent?: TorrentEntity | null;
    actionFeedback?: FeedbackMessage | null;
    onEngineClick?: () => void;
}

export function StatusBar({
    sessionStats,
    downHistory,
    upHistory,
    rpcStatus,
    selectedTorrent,
    actionFeedback,
    onEngineClick,
}: StatusBarProps) {
    const { t } = useTranslation();

    const statusConfig = {
        idle: {
            label: t("status_bar.rpc_idle"),
            color: "text-foreground/40",
            icon: Zap,
        },
        connected: {
            label: t("status_bar.rpc_connected"),
            color: "text-success",
            icon: CheckCircle2,
        },
        error: {
            label: t("status_bar.rpc_error"),
            color: "text-danger",
            icon: AlertCircle,
        },
    }[rpcStatus];

    const STATUS_VISUALS: Record<
        RpcStatus,
        { bg: string; border: string; text: string }
    > = {
        idle: {
            bg: "bg-content1/10",
            border: "border-content1/20",
            text: "text-foreground/50",
        },
        connected: {
            bg: "bg-success/10",
            border: "border-success/30",
            text: "text-success",
        },
        error: {
            bg: "bg-danger/10",
            border: "border-danger/30",
            text: "text-danger",
        },
    };
    const statusVisual = STATUS_VISUALS[rpcStatus];

    const downSpeed =
        selectedTorrent?.speed.down ?? sessionStats?.downloadSpeed ?? 0;
    const upSpeed = selectedTorrent?.speed.up ?? sessionStats?.uploadSpeed ?? 0;

    const dhtNodeCount = sessionStats?.dhtNodes ?? 0;

    const isSelection = !!selectedTorrent;
    const summaryLabel = isSelection
        ? t("status_bar.selected_torrent")
        : t("status_bar.active_torrents");

    const summaryValue = isSelection
        ? selectedTorrent.name
        : sessionStats
        ? `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
        : "--";

    return (
        <footer
            className={cn(
                "w-full shrink-0 rounded-[28px] select-none relative z-30 overflow-visible",
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW
            )}
        >
            {actionFeedback && (
                <div className="pointer-events-none absolute inset-x-6 -top-5 flex justify-end">
                    <div
                        className={cn(
                            "rounded-full border border-content1/20 bg-content1/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur-md",
                            PANEL_SHADOW,
                            FEEDBACK_TONE_CLASSES[actionFeedback.tone]
                        )}
                        aria-live="polite"
                    >
                        {actionFeedback.message}
                    </div>
                </div>
            )}
            <div
                className={cn(
                    "flex items-center justify-between px-6",
                    LAYOUT_CONFIG.height,
                    LAYOUT_CONFIG.gapSection
                )}
            >
                {/* --- LEFT: SPEED TICKERS --- */}
                <div
                    className={cn(
                        "flex flex-1 items-center h-full py-2",
                        LAYOUT_CONFIG.gapSection
                    )}
                >
                    {/* DOWNLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            LAYOUT_CONFIG.gapInternal
                        )}
                    >
                        {/* Icon & Label */}
                        <div
                            className={cn(
                                "flex items-center shrink-0",
                                LAYOUT_CONFIG.gapInternal
                            )}
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-success/10 group-hover:text-success">
                                <ArrowDown
                                    size={24}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                                    {t("status_bar.down")}
                                </span>
                                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
                                    {formatSpeed(downSpeed)}
                                </span>
                            </div>
                        </div>

                        {/* Graph */}
                        <div className="flex-1 h-full min-w-[100px] py-2 opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100">
                            <NetworkGraph
                                data={downHistory}
                                color="success"
                                className="h-full w-full"
                            />
                        </div>
                    </div>

                    {/* SEPARATOR */}
                    <div className="h-8 w-px bg-content1/20" />

                    {/* UPLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            LAYOUT_CONFIG.gapInternal
                        )}
                    >
                        {/* Icon & Label */}
                        <div
                            className={cn(
                                "flex items-center shrink-0",
                                LAYOUT_CONFIG.gapInternal
                            )}
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                <ArrowUp
                                    size={24}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-current"
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                                    {t("status_bar.up")}
                                </span>
                                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
                                    {formatSpeed(upSpeed)}
                                </span>
                            </div>
                        </div>

                        {/* Graph */}
                        <div className="flex-1 h-full min-w-[100px] opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100">
                            <NetworkGraph
                                data={upHistory}
                                color="primary"
                                className="h-full w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* --- RIGHT: SYSTEM HUD --- */}
                <div
                    className={cn(
                        "flex shrink-0 items-center text-[11px] pl-6 border-l border-content1/10 h-12",
                        LAYOUT_CONFIG.gapSection
                    )}
                >
                    {/* SECTION: CONTEXT INFO */}
                    <div
                        className={cn(
                            "flex flex-col items-end gap-1",
                            LAYOUT_CONFIG.hudWidths.context
                        )}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/30">
                            {summaryLabel}
                        </span>
                        <div className="flex items-center gap-2">
                            <span
                                className="font-semibold text-foreground max-w-[200px] truncate text-right"
                                title={summaryValue}
                            >
                                {summaryValue}
                            </span>
                            {!isSelection && (
                                <Activity
                                    size={14}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-foreground/30"
                                />
                            )}
                            {isSelection && (
                                <HardDrive
                                    size={14}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-foreground/30"
                                />
                            )}
                        </div>
                    </div>

                    {/* DIVIDER */}
                    <div className="h-8 w-px bg-content1/10" />

                    {/* SECTION: NETWORK */}
                    <div
                        className={cn(
                            "flex flex-col items-end gap-1",
                            LAYOUT_CONFIG.hudWidths.network
                        )}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/30">
                            {t("status_bar.network")}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground/70 tabular-nums">
                                {t("status_bar.dht_nodes", {
                                    count: dhtNodeCount,
                                })}
                            </span>
                            <Network
                                size={14}
                                strokeWidth={ICON_STROKE_WIDTH}
                                className="text-foreground/30"
                            />
                        </div>
                    </div>

                    {/* DIVIDER */}
                    <div className="h-8 w-px bg-content1/10" />

                    {/* SECTION: ENGINE STATUS */}
                    <div
                        className={cn(
                            "flex flex-col items-end gap-1",
                            LAYOUT_CONFIG.hudWidths.engine
                        )}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/30">
                            {t("status_bar.engine")}
                        </span>
                        <div className="flex w-full justify-end">
                            <button
                                type="button"
                                onClick={onEngineClick}
                                className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-2xl border transition duration-200 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60",
                                    statusVisual.bg,
                                    statusVisual.border,
                                    statusVisual.text
                                )}
                                title={statusConfig.label}
                            >
                                <statusConfig.icon
                                    size={18}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className={cn(
                                        "text-current",
                                        rpcStatus !== "connected" &&
                                            "animate-pulse"
                                    )}
                                />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
