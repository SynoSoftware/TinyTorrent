import { ArrowDown, ArrowUp, Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatSpeed } from "../../utils/format";
import { NetworkGraph } from "../graphs/NetworkGraph";
import type { SessionStats, EngineInfo } from "../../../services/rpc/entities";
import type { RpcStatus } from "../../../shared/types/rpc";

interface StatusBarProps {
    sessionStats: SessionStats | null;
    downHistory: number[];
    upHistory: number[];
    rpcStatus: RpcStatus;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
}

export function StatusBar({
    sessionStats,
    downHistory,
    upHistory,
    rpcStatus,
    engineInfo,
    isDetectingEngine,
}: StatusBarProps) {
    const { t } = useTranslation();
    const statusLabel = {
        idle: t("status_bar.rpc_idle"),
        connected: t("status_bar.rpc_connected"),
        error: t("status_bar.rpc_error"),
    }[rpcStatus];
    const engineName = engineInfo ? engineInfo.name ?? engineInfo.type : null;
    const engineLabel = engineName
        ? `${engineName}${engineInfo?.version ? ` ${engineInfo.version}` : ""}`
        : isDetectingEngine
        ? t("status_bar.engine_detecting")
        : t("status_bar.engine_unknown");
    const statusColor =
        rpcStatus === "connected"
            ? "text-success"
            : rpcStatus === "error"
            ? "text-danger"
            : "text-foreground/50";
    const downSpeed = sessionStats?.downloadSpeed ?? 0;
    const upSpeed = sessionStats?.uploadSpeed ?? 0;
    const torrentSummary = sessionStats
        ? `${sessionStats.activeTorrentCount}/${sessionStats.torrentCount} active`
        : "Loading stats...";

    return (
        <footer className="z-20 flex flex-col border-t border-content1/20 bg-content1/70 backdrop-blur-xl text-[10px] font-mono select-none">
            <div className="flex h-9 items-center justify-between px-4">
                <div className="flex items-center gap-6">
                    {/* Download Section */}
                    <div className="flex items-center gap-3 opacity-90 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1.5 text-success">
                            <ArrowDown size={12} />
                            <span className="font-bold tracking-wider">
                                {t("status_bar.down")}
                            </span>
                        </div>
                        <span className="text-foreground min-w-[60px]">
                            {formatSpeed(downSpeed)}
                        </span>
                        <div className="w-16 h-6">
                            <NetworkGraph data={downHistory} color="success" />
                        </div>
                    </div>

                    <div className="h-4 w-px bg-content1/30" />

                    {/* Upload Section */}
                    <div className="flex items-center gap-3 opacity-90 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1.5 text-primary">
                            <ArrowUp size={12} />
                            <span className="font-bold tracking-wider">
                                {t("status_bar.up")}
                            </span>
                        </div>
                        <span className="text-foreground min-w-[60px]">
                            {formatSpeed(upSpeed)}
                        </span>
                        <div className="w-16 h-6">
                            <NetworkGraph data={upHistory} color="primary" />
                        </div>
                    </div>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                    <div className="text-xs text-foreground/50">
                        {torrentSummary}
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground/40">
                        <Network size={12} />
                        <span>{t("status_bar.dht_nodes", { count: 342 })}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/60">
                            {t("status_bar.online")}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                            {t("status_bar.engine")}
                        </span>
                        <span className="text-[11px] font-mono text-foreground/50">
                            {engineLabel}
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex h-5 items-center justify-between px-4 text-foreground/50">
                <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                    {t("status_bar.rpc_status")}
                </span>
                <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.3em] ${statusColor}`}
                >
                    {statusLabel}
                </span>
            </div>
        </footer>
    );
}
