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

    // Configuration for status states
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

    const isSelection = !!selectedTorrent;
    const summaryLabel = isSelection ? "SELECTION" : "ACTIVE";
    const summaryValue = isSelection
        ? selectedTorrent.name
        : sessionStats
        ? `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
        : "--";

    return (
        <footer className="w-full shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-xl select-none relative z-50">
            <div className="flex h-[72px] items-center justify-between gap-8 px-6">
                {/* --- LEFT: SPEED TICKERS --- */}
                {/* We use flex-1 to take up all available space, split into two equal zones */}
                <div className="flex flex-1 items-center gap-8 h-full py-3">
                    {/* DOWNLOAD ZONE */}
                    <div className="flex flex-1 items-center gap-4 h-full min-w-0">
                        {/* Text Group */}
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                                <ArrowDown size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                    {t("status_bar.down")}
                                </span>
                                <span className="text-xl font-bold tracking-tight text-foreground tabular-nums leading-none">
                                    {formatSpeed(downSpeed)}
                                </span>
                            </div>
                        </div>

                        {/* Graph - Fills remaining space next to text */}
                        <div className="flex-1 h-full min-w-[100px] opacity-40 hover:opacity-100 transition-opacity">
                            <NetworkGraph
                                data={downHistory}
                                color="success"
                                className="h-full w-full"
                            />
                        </div>
                    </div>

                    {/* SEPARATOR (Optional visual break between Down/Up) */}
                    <div className="h-8 w-px bg-border/40" />

                    {/* UPLOAD ZONE */}
                    <div className="flex flex-1 items-center gap-4 h-full min-w-0">
                        {/* Text Group */}
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <ArrowUp size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                    {t("status_bar.up")}
                                </span>
                                <span className="text-xl font-bold tracking-tight text-foreground tabular-nums leading-none">
                                    {formatSpeed(upSpeed)}
                                </span>
                            </div>
                        </div>

                        {/* Graph - Fills remaining space next to text */}
                        <div className="flex-1 h-full min-w-[100px] opacity-40 hover:opacity-100 transition-opacity">
                            <NetworkGraph
                                data={upHistory}
                                color="primary"
                                className="h-full w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* --- RIGHT: SYSTEM HUD (Unchanged per request) --- */}
                <div className="flex shrink-0 items-center gap-6 text-[11px] pl-6 border-l border-border/40 h-10">
                    {/* SECTION: TORRENT INFO */}
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                            {summaryLabel}
                        </span>
                        <div className="flex items-center gap-2">
                            <span
                                className="font-semibold text-foreground max-w-[200px] truncate"
                                title={summaryValue}
                            >
                                {summaryValue}
                            </span>
                            {!isSelection && (
                                <Activity
                                    size={14}
                                    className="text-muted-foreground/50"
                                />
                            )}
                            {isSelection && (
                                <HardDrive
                                    size={14}
                                    className="text-muted-foreground/50"
                                />
                            )}
                        </div>
                    </div>

                    {/* SECTION: NETWORK STATUS */}
                    <div className="flex flex-col items-end gap-0.5 border-l border-border/40 pl-6 h-full justify-center">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                            Network
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-muted-foreground tabular-nums">
                                {t("status_bar.dht_nodes", { count: 342 })}
                            </span>
                            <Network
                                size={14}
                                className="text-muted-foreground/50"
                            />
                        </div>
                    </div>

                    {/* SECTION: RPC CONNECTION */}
                    <div className="flex flex-col items-end gap-0.5 min-w-[80px] border-l border-border/40 pl-6 h-full justify-center">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                            Engine
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
