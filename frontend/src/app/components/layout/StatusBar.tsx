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
import type { SessionStats } from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { RpcStatus } from "@/shared/types/rpc";
import {
    ICON_STROKE_WIDTH,
    getShellTokens,
    UI_BASES,
    STATUS_VISUALS,
} from "@/config/logic";
import { motion } from "framer-motion";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";

// Note: semantic tokens and visuals are owned by `config/logic.ts`.

export type EngineDisplayType = "tinytorrent" | "transmission" | "unknown";

interface StatusBarProps {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    rpcStatus: RpcStatus;
    liveTransportStatus: HeartbeatSource;
    selectedCount?: number;
    onEngineClick?: () => void;
    engineType: EngineDisplayType;
}

export function StatusBar({
    workspaceStyle,
    sessionStats,
    rpcStatus,
    liveTransportStatus,
    selectedCount = 0,
    onEngineClick,
    engineType,
}: StatusBarProps) {
    const { t } = useTranslation();
    const shell = getShellTokens(workspaceStyle);

    // 1. Semantic Visuals
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
            engineType === "tinytorrent"
                ? t("status_bar.engine_name_tinytorrent")
                : t("status_bar.engine_name_transmission");
        const engineState =
            rpcStatus === "connected"
                ? t("status_bar.rpc_connected")
                : rpcStatus === "idle"
                ? t("status_bar.rpc_idle")
                : t("status_bar.rpc_error");

        const transportDesc =
            transportStatus === "websocket"
                ? t("status_bar.transport_websocket_desc")
                : transportStatus === "polling"
                ? t("status_bar.transport_polling_desc")
                : t("status_bar.transport_offline_desc");

        return t("status_bar.engine_tooltip", {
            engineName,
            transportDesc,
            status: engineState,
        });
    };

    // 4. Data Prep
    // If a selection exists, prefer selection-specific speeds; otherwise fall back
    // to aggregate session speeds. Consumers now pass `selectedCount` instead
    // of a full torrent object to avoid cluttering the status bar.
    const downSpeed = sessionStats?.downloadSpeed ?? 0;
    const upSpeed = sessionStats?.uploadSpeed ?? 0;
    const dhtNodeCount = sessionStats?.dhtNodes ?? 0;

    const selCount = selectedCount ?? 0;
    const isSelection = selCount > 0;
    const summaryLabel = isSelection
        ? t("status_bar.selected_count")
        : t("status_bar.active_torrents");

    const summaryValue = isSelection
        ? `${selCount} ${t("status_bar.torrents_selected")}`
        : sessionStats
        ? `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
        : "--";

    // 5. Render Helper
    const renderEngineLogo = () => {
        if (rpcStatus === "idle")
            return (
                <RefreshCw
                    className={cn("size-icon-btn", "opacity-50")}
                    style={{
                        width: UI_BASES.statusbar.iconMd,
                        height: UI_BASES.statusbar.iconMd,
                    }}
                />
            );
        if (rpcStatus === "error")
            return (
                <AlertCircle
                    className={cn("size-icon-btn")}
                    style={{
                        width: UI_BASES.statusbar.iconMd,
                        height: UI_BASES.statusbar.iconMd,
                    }}
                />
            );

        if (engineType === "tinytorrent") {
            return (
                <TinyTorrentIcon
                    className={"size-icon-btn"}
                    title={t("status_bar.engine_name_tinytorrent")}
                />
            );
        }
        return (
            <TransmissionIcon
                className={"size-icon-btn"}
                strokeWidth={ICON_STROKE_WIDTH}
                style={{
                    width: UI_BASES.statusbar.iconMd,
                    height: UI_BASES.statusbar.iconMd,
                }}
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
                    "flex items-center justify-between",
                    "gap-stage"
                )}
                style={{
                    ...shell.contentStyle,
                    height: "var(--tt-statusbar-h)",
                    paddingLeft: "var(--tt-navbar-padding)",
                    paddingRight: "var(--tt-navbar-padding)",
                }}
            >
                {/* --- LEFT: SPEED MODULES --- */}
                <div
                    className={cn(
                        "flex flex-1 items-center h-full py-tight",
                        "gap-stage"
                    )}
                >
                    {/* DOWNLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            "gap-tools"
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center shrink-0",
                                "gap-tools"
                            )}
                        >
                            <div
                                className="flex items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-success/10 group-hover:text-success"
                                style={{
                                    width: "var(--tt-status-icon-xl)",
                                    height: "var(--tt-status-icon-xl)",
                                }}
                            >
                                <ArrowDown
                                    style={{
                                        width: "var(--tt-status-icon-lg)",
                                        height: "var(--tt-status-icon-lg)",
                                    }}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-tight">
                                <span className={cn("font-bold uppercase tracking-0-2", "text-foreground/40")}>
                                    {t("status_bar.down")}
                                </span>
                                <span className={cn("font-bold tracking-tight leading-none", "text-foreground")}>
                                    {formatSpeed(downSpeed)}
                                </span>
                            </div>
                        </div>
                        <div
                            className="flex-1 h-full py-tight opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100"
                            style={{ minWidth: UI_BASES.statusbar.min100 }}
                        >
                            <NetworkGraph
                                data={[]}
                                color="success"
                                className="h-full w-full"
                            />
                        </div>
                    </div>

                    {/* SEPARATOR */}
                    <div
                        className="w-px bg-content1/10"
                        style={{ height: "var(--tt-sep-h)" }}
                    />

                    {/* UPLOAD ZONE */}
                    <div
                        className={cn(
                            "flex flex-1 items-center h-full min-w-0 group",
                            "gap-tools"
                        )}
                    >
                        <div
                            className={cn("flex items-center shrink-0", "gap-tools")}
                        >
                            <div
                                className="flex items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors group-hover:bg-primary/10 group-hover:text-primary"
                                style={{
                                    width: "var(--tt-status-icon-xl)",
                                    height: "var(--tt-status-icon-xl)",
                                }}
                            >
                                <ArrowUp
                                    style={{
                                        width: "var(--tt-status-icon-lg)",
                                        height: "var(--tt-status-icon-lg)",
                                    }}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                />
                            </div>
                            <div className="flex flex-col justify-center gap-tight">
                                <span className={cn("font-bold uppercase tracking-0-2", "text-foreground/40")}>
                                    {t("status_bar.up")}
                                </span>
                                <span className={cn("font-bold tracking-tight leading-none", "text-foreground")}>
                                    {formatSpeed(upSpeed)}
                                </span>
                            </div>
                        </div>
                        <div
                            className="flex-1 h-full opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100"
                            style={{ minWidth: UI_BASES.statusbar.min100 }}
                        >
                            <NetworkGraph
                                data={[]}
                                color="primary"
                                className="h-full w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* --- RIGHT: SYSTEM HUD --- */}
                <div
                    className={cn(
                        "flex shrink-0 items-center border-l border-content1/10",
                        "gap-stage"
                    )}
                    style={{
                        paddingLeft: "var(--tt-navbar-gap)",
                        height: "var(--tt-statusbar-h)",
                    }}
                >
                    {/* SECTION: CONTEXT INFO */}
                    <div
                        className="flex flex-col items-end gap-tight whitespace-nowrap"
                        style={{ minWidth: UI_BASES.statusbar.min120 }}
                    >
                        <span
                            className={cn(
                                "font-bold uppercase tracking-0-2",
                                "text-foreground/30"
                            )}
                        >
                            {summaryLabel}
                        </span>
                        <div className="flex items-center gap-tools">
                            <span
                                className={cn(
                                    "text-foreground truncate text-right"
                                )}
                                title={summaryValue}
                                style={{
                                    maxWidth: "var(--tt-statusbar-short-max-w)",
                                }}
                            >
                                {summaryValue}
                            </span>
                            {isSelection ? (
                                <HardDrive
                                    className={cn(
                                        "size-icon-btn text-foreground/30"
                                    )}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    style={{
                                        width: UI_BASES.statusbar.iconSm,
                                        height: UI_BASES.statusbar.iconSm,
                                    }}
                                />
                            ) : (
                                <Activity
                                    className={cn(
                                        "size-icon-btn text-foreground/30"
                                    )}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    style={{
                                        width: UI_BASES.statusbar.iconSm,
                                        height: UI_BASES.statusbar.iconSm,
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* SECTION: NETWORK */}
                    <div
                        className="flex flex-col items-end gap-tight whitespace-nowrap"
                        style={{ minWidth: UI_BASES.statusbar.min80 }}
                    >
                        <span className={cn("font-bold uppercase tracking-0-2", "text-foreground/30")}>
                            {t("status_bar.network")}
                        </span>
                        <div className="flex items-center gap-tools">
                            <span className={cn("font-semibold tabular-nums", "text-foreground/70")}>
                                {t("status_bar.dht_nodes", {
                                    count: dhtNodeCount,
                                })}
                            </span>
                            <Network
                                className={cn("size-icon-btn text-foreground/30")}
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
                                "relative flex items-center justify-center gap-tools rounded-xl border px-panel",
                                // Interaction
                                "active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer",
                                // Theme application
                                statusVisual.bg,
                                statusVisual.border,
                                statusVisual.text,
                                statusVisual.shadow
                            )}
                            title={getChipTooltip()}
                            style={{
                                height: UI_BASES.statusbar.buttonH,
                                minWidth: UI_BASES.statusbar.buttonMinW,
                            }}
                        >
                            {/* 1. Transport Icon (Left - The 'Power' Source) */}
                            <TransportIcon
                                className={cn(
                                    "size-icon-btn",
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
                                    "w-px",
                                    rpcStatus === "connected"
                                        ? "bg-current opacity-20"
                                        : "bg-foreground/10"
                                )}
                                style={{
                                    height: "var(--tt-sep-h)",
                                }}
                            />

                            {/* 3. Engine Identity (Right - The 'Target') */}
                            <div className="flex items-center justify-center text-current">
                                {renderEngineLogo()}
                            </div>

                            {/* 4. Status Dot (Top Right Corner of the Chip) */}
                            {rpcStatus === "connected" && (
                                <span className="absolute inset-0 flex items-start justify-end p-tight">
                                    <motion.span
                                        className={cn(
                                            "absolute inline-flex rounded-full",
                                            statusVisual.glow
                                        )}
                                        style={{
                                            width: "var(--tt-dot-size)",
                                            height: "var(--tt-dot-size)",
                                        }}
                                        animate={{
                                            scale: [1, 1.6, 1],
                                            opacity: [0.9, 0.6, 0.9],
                                        }}
                                        transition={{
                                            duration: 1.2,
                                            repeat: Infinity,
                                        }}
                                    />
                                    <motion.span
                                        className={cn(
                                            "relative inline-flex rounded-full bg-current"
                                        )}
                                        style={{
                                            width: "var(--tt-dot-size)",
                                            height: "var(--tt-dot-size)",
                                        }}
                                        initial={{ scale: 1 }}
                                    />
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
