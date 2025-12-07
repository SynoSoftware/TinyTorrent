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
import { useTranslation } from "react-i18next";
import { formatSpeed } from "../../../shared/utils/format";
import { NetworkGraph } from "../graphs/NetworkGraph";
import type {
    SessionStats,
    TorrentEntity,
} from "../../../services/rpc/entities";
import type { RpcStatus } from "../../../shared/types/rpc";

interface StatusBarProps {
    sessionStats: SessionStats | null;
    downHistory: number[];
    upHistory: number[];
    rpcStatus: RpcStatus;
    selectedTorrent?: TorrentEntity | null;
}

export function StatusBar({
    sessionStats,
    downHistory,
    upHistory,
    rpcStatus,
    selectedTorrent,
}: StatusBarProps) {
    const { t } = useTranslation();

    // Semantic status configuration
    // AGENTS.md: Use strict semantic tokens (success, danger, foreground)
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
        <footer className="w-full shrink-0 border-t border-content1/10 bg-background/80 backdrop-blur-2xl select-none relative z-50">
            <div className="flex h-[76px] items-center justify-between gap-8 px-6">
                {/* --- LEFT: SPEED TICKERS (Side-by-Side Layout) --- */}
                <div className="flex flex-1 items-center gap-8 h-full py-2">
                    {/* DOWNLOAD ZONE */}
                    <div className="flex flex-1 items-center gap-5 h-full min-w-0 group">
                        {/* Icon & Label */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-success/10 group-hover:text-success">
                                <ArrowDown size={24} strokeWidth={2.5} />
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

                        {/* Graph: Fills remaining space. No overlap. */}
                        <div className="flex-1 h-full min-w-[100px] opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100">
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
                    <div className="flex flex-1 items-center gap-5 h-full min-w-0 group">
                        {/* Icon & Label */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                <ArrowUp size={24} strokeWidth={2.5} />
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

                {/* --- RIGHT: SYSTEM HUD (Dense, Rigid Structure) --- */}
                <div className="flex shrink-0 items-center gap-6 text-[11px] pl-6 border-l border-content1/10 h-12">
                    {/* SECTION: CONTEXT INFO */}
                    <div className="flex flex-col items-end gap-1 min-w-[140px]">
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
                                    className="text-foreground/30"
                                />
                            )}
                            {isSelection && (
                                <HardDrive
                                    size={14}
                                    className="text-foreground/30"
                                />
                            )}
                        </div>
                    </div>

                    {/* DIVIDER */}
                    <div className="h-8 w-px bg-content1/10" />

                    {/* SECTION: NETWORK */}
                    <div className="flex flex-col items-end gap-1 min-w-[80px]">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/30">
                            {t("status_bar.network")}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground/70 tabular-nums">
                                {t("status_bar.dht_nodes", {
                                    count: dhtNodeCount,
                                })}
                            </span>
                            <Network size={14} className="text-foreground/30" />
                        </div>
                    </div>

                    {/* DIVIDER */}
                    <div className="h-8 w-px bg-content1/10" />

                    {/* SECTION: ENGINE STATUS */}
                    <div className="flex flex-col items-end gap-1 min-w-[80px]">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/30">
                            {t("status_bar.engine")}
                        </span>
                        <div
                            className={`flex items-center gap-1.5 ${statusConfig.color}`}
                        >
                            <span className="font-bold tracking-wide uppercase text-[10px]">
                                {statusConfig.label}
                            </span>
                            <statusConfig.icon
                                size={14}
                                strokeWidth={2.5}
                                className={
                                    rpcStatus !== "connected"
                                        ? "animate-pulse"
                                        : ""
                                }
                            />
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
