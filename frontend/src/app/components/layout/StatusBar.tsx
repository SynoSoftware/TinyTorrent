import {
    ArrowDown,
    ArrowUp,
    Network,
    Zap,
    HardDrive,
    Activity,
    Cog as TransmissionIcon,
    Wifi,
    Power,
    RefreshCw,
    AlertCircle,
} from "lucide-react";
import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { formatSpeed } from "@/shared/utils/format";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";
import type { SessionStats, TorrentEntity } from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { RpcStatus } from "@/shared/types/rpc";
import { ICON_STROKE_WIDTH, getShellTokens } from "@/config/logic";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";

// --- UI CONFIGURATION & TOKENS ---
const UI_CONFIG = {
    layout: {
        height: "h-[76px]",
        sectionGap: "gap-4",
        internalGap: "gap-2",
        hudGap: "gap-6",
    },
    sizing: {
        icon: {
            sm: "w-3 h-3",
            md: "w-3.5 h-3.5",
            lg: "w-4 h-4",
            xl: "w-6 h-6",
            // New larger size for the chip internals since the chip is bigger
            chip: "w-5 h-5",
        },
        button: {
            // Increased from h-8 to h-[42px] to match the visual height of the text stacks
            height: "h-[42px]",
            width: "min-w-[84px]",
        },
        dot: "w-2 h-2",
    },
    opacity: {
        dim: "opacity-30",
        medium: "opacity-50",
        high: "opacity-80",
    },
    typography: {
        label: "text-[9px] font-bold uppercase tracking-wider",
        value: "text-[11px] font-semibold tabular-nums",
        speed: "text-2xl font-bold tracking-tight leading-none",
    },
};

export type EngineDisplayType = "tinytorrent" | "transmission" | "unknown";

interface StatusBarProps {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    downHistory: number[];
    upHistory: number[];
    rpcStatus: RpcStatus;
    liveTransportStatus: HeartbeatSource;
    selectedTorrent?: TorrentEntity | null;
    onEngineClick?: () => void;
    engineType: EngineDisplayType;
}

export function StatusBar({
    workspaceStyle,
    sessionStats,
    downHistory,
    upHistory,
    rpcStatus,
    liveTransportStatus,
    selectedTorrent,
    onEngineClick,
    engineType,
}: StatusBarProps) {
    const { t } = useTranslation();
    const shell = getShellTokens(workspaceStyle);

    // 1. Semantic Visuals
    const STATUS_VISUALS: Record<
        RpcStatus,
        {
            bg: string;
            border: string;
            text: string;
            shadow: string;
            glow: string;
        }
    > = {
        idle: {
            bg: "bg-content1/5 hover:bg-content1/10",
            border: "border-content1/10",
            text: "text-foreground/40",
            shadow: "shadow-none",
            glow: "bg-content1",
        },
        connected: {
            bg: "bg-success/5 hover:bg-success/10",
            border: "border-success/20",
            text: "text-success",
            shadow: "shadow-[0_0_20px_-5px_rgba(var(--heroui-success-500),0.2)]",
            glow: "bg-success",
        },
        error: {
            bg: "bg-danger/5 hover:bg-danger/10",
            border: "border-danger/20",
            text: "text-danger",
            shadow: "shadow-[0_0_20px_-5px_rgba(var(--heroui-danger-500),0.2)]",
            glow: "bg-danger",
        },
    };
    const statusVisual = STATUS_VISUALS[rpcStatus];

    // 2. Transport Logic
    const transportStatus =
        rpcStatus === "connected" ? liveTransportStatus : "offline";

    const TransportIcon = {
        websocket: Zap,
        polling: Wifi,
        offline: Power,
    }[transportStatus];

    // 3. Tooltip Generation
    const getChipTooltip = () => {
        const engineName =
            engineType === "tinytorrent" ? "TinyTorrent" : "Transmission";
        const engineState =
            rpcStatus === "connected"
                ? t("status_bar.rpc_connected")
                : t("status_bar.rpc_error");

        let transportDesc = "";
        if (transportStatus === "websocket")
            transportDesc = "WebSocket (Real-time)";
        if (transportStatus === "polling")
            transportDesc = "HTTP Polling (Legacy)";
        if (transportStatus === "offline") transportDesc = "Disconnected";

        // Multi-line tooltip for clarity
        return `Engine: ${engineName}\nConnection: ${transportDesc}\nStatus: ${engineState}`;
    };

    // 4. Data Prep
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

    // 5. Render Helper
    const renderEngineLogo = () => {
        if (rpcStatus === "idle")
            return (
                <RefreshCw
                    className={cn(
                        UI_CONFIG.sizing.icon.chip,
                        "animate-spin opacity-50"
                    )}
                />
            );
        if (rpcStatus === "error")
            return <AlertCircle className={UI_CONFIG.sizing.icon.chip} />;

        if (engineType === "tinytorrent") {
            return (
                <TinyTorrentIcon
                    className={UI_CONFIG.sizing.icon.chip}
                    title="TinyTorrent"
                />
            );
        }
        return (
            <TransmissionIcon
                className={UI_CONFIG.sizing.icon.chip}
                strokeWidth={ICON_STROKE_WIDTH}
            />
        );
    };

    return (
        <footer
            className={cn(
                "w-full shrink-0 select-none relative z-30 overflow-visible",
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW
            )}
            style={shell.frameStyle}
        >
            <div
                className={cn(
                    "flex items-center justify-between px-6",
                    UI_CONFIG.layout.height,
                    UI_CONFIG.layout.sectionGap
                )}
                style={shell.contentStyle}
            >
                {/* --- LEFT: SPEED MODULES --- */}
                <div
                    className={cn(
                        "flex flex-1 items-center h-full py-2",
                        UI_CONFIG.layout.sectionGap
                    )}
                >
                    {/* DOWNLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            UI_CONFIG.layout.internalGap
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center shrink-0",
                                UI_CONFIG.layout.internalGap
                            )}
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-success/10 group-hover:text-success">
                                <ArrowDown
                                    className={UI_CONFIG.sizing.icon.xl}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-0.5">
                                <span
                                    className={cn(
                                        UI_CONFIG.typography.label,
                                        "text-foreground/40"
                                    )}
                                >
                                    {t("status_bar.down")}
                                </span>
                                <span
                                    className={cn(
                                        UI_CONFIG.typography.speed,
                                        "text-foreground"
                                    )}
                                >
                                    {formatSpeed(downSpeed)}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 h-full min-w-[100px] py-2 opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100">
                            <NetworkGraph
                                data={downHistory}
                                color="success"
                                className="h-full w-full"
                            />
                        </div>
                    </div>

                    {/* SEPARATOR */}
                    <div className="h-8 w-px bg-content1/10" />

                    {/* UPLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            UI_CONFIG.layout.internalGap
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center shrink-0",
                                UI_CONFIG.layout.internalGap
                            )}
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                <ArrowUp
                                    className={UI_CONFIG.sizing.icon.xl}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-0.5">
                                <span
                                    className={cn(
                                        UI_CONFIG.typography.label,
                                        "text-foreground/40"
                                    )}
                                >
                                    {t("status_bar.up")}
                                </span>
                                <span
                                    className={cn(
                                        UI_CONFIG.typography.speed,
                                        "text-foreground"
                                    )}
                                >
                                    {formatSpeed(upSpeed)}
                                </span>
                            </div>
                        </div>
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
                        "flex shrink-0 items-center pl-6 border-l border-content1/10 h-12",
                        UI_CONFIG.layout.hudGap
                    )}
                >
                    {/* SECTION: CONTEXT INFO */}
                    <div className="flex flex-col items-end gap-1 whitespace-nowrap min-w-[120px]">
                        <span
                            className={cn(
                                UI_CONFIG.typography.label,
                                "text-foreground/30"
                            )}
                        >
                            {summaryLabel}
                        </span>
                        <div className="flex items-center gap-2">
                            <span
                                className={cn(
                                    UI_CONFIG.typography.value,
                                    "text-foreground max-w-[200px] truncate text-right"
                                )}
                                title={summaryValue}
                            >
                                {summaryValue}
                            </span>
                            {isSelection ? (
                                <HardDrive
                                    className={cn(
                                        UI_CONFIG.sizing.icon.md,
                                        "text-foreground/30"
                                    )}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            ) : (
                                <Activity
                                    className={cn(
                                        UI_CONFIG.sizing.icon.md,
                                        "text-foreground/30"
                                    )}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            )}
                        </div>
                    </div>

                    {/* SECTION: NETWORK */}
                    <div className="flex flex-col items-end gap-1 whitespace-nowrap min-w-[80px]">
                        <span
                            className={cn(
                                UI_CONFIG.typography.label,
                                "text-foreground/30"
                            )}
                        >
                            {t("status_bar.network")}
                        </span>
                        <div className="flex items-center gap-2">
                            <span
                                className={cn(
                                    UI_CONFIG.typography.value,
                                    "text-foreground/70"
                                )}
                            >
                                {t("status_bar.dht_nodes", {
                                    count: dhtNodeCount,
                                })}
                            </span>
                            <Network
                                className={cn(
                                    UI_CONFIG.sizing.icon.md,
                                    "text-foreground/30"
                                )}
                                strokeWidth={ICON_STROKE_WIDTH}
                            />
                        </div>
                    </div>

                    {/* SECTION: ENGINE CHIP (No Text Label, Larger Size) */}
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={onEngineClick}
                            className={cn(
                                // Layout & Shape
                                "relative flex items-center justify-center gap-3 rounded-xl border px-4 transition-all duration-300",
                                UI_CONFIG.sizing.button.height,
                                UI_CONFIG.sizing.button.width,
                                // Interaction
                                "active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer",
                                // Theme application
                                statusVisual.bg,
                                statusVisual.border,
                                statusVisual.text,
                                statusVisual.shadow
                            )}
                            title={getChipTooltip()}
                        >
                            {/* 1. Transport Icon (Left - The 'Power' Source) */}
                            <TransportIcon
                                className={cn(
                                    UI_CONFIG.sizing.icon.chip,
                                    rpcStatus === "connected" &&
                                        transportStatus === "websocket"
                                        ? "text-current"
                                        : "opacity-70"
                                )}
                                strokeWidth={ICON_STROKE_WIDTH + 1}
                            />

                            {/* 2. Divider (Subtle separator) */}
                            <div
                                className={cn(
                                    "h-4 w-px",
                                    rpcStatus === "connected"
                                        ? "bg-current opacity-20"
                                        : "bg-foreground/10"
                                )}
                            />

                            {/* 3. Engine Identity (Right - The 'Target') */}
                            <div className="flex items-center justify-center text-current">
                                {renderEngineLogo()}
                            </div>

                            {/* 4. Status Dot (Top Right Corner of the Chip) */}
                            {rpcStatus === "connected" && (
                                <span className="absolute -top-1 -right-1 flex">
                                    <span
                                        className={cn(
                                            "animate-ping absolute inline-flex rounded-full opacity-75",
                                            UI_CONFIG.sizing.dot,
                                            statusVisual.glow
                                        )}
                                    ></span>
                                    <span
                                        className={cn(
                                            "relative inline-flex rounded-full",
                                            UI_CONFIG.sizing.dot,
                                            statusVisual.glow
                                        )}
                                    ></span>
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
