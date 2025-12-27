import React from "react";
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
import { motion } from "framer-motion";

// Components
import { StatusIcon } from "@/shared/ui/components/StatusIcon"; // Adjust path as needed
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";

// Utils & Config
import { formatSpeed } from "@/shared/utils/format";
import { getShellTokens, UI_BASES, STATUS_VISUALS } from "@/config/logic";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";

// Types
import type { SessionStats } from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { RpcStatus } from "@/shared/types/rpc";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";

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

/**
 * DRY Helper for the Label/Value pairs used in the HUD
 */
const StatGroup = ({
    label,
    value,
    Icon,
    className,
    align = "end",
}: {
    label: string;
    value: string;
    Icon?: React.ComponentType<any>;
    className?: string;
    align?: "start" | "end";
}) => (
    <div
        className={cn(
            "flex flex-col gap-tight whitespace-nowrap",
            align === "end" ? "items-end" : "items-start",
            className
        )}
    >
        <span className="font-bold uppercase tracking-0-2 text-foreground/30">
            {label}
        </span>
        <div className="flex items-center gap-tools">
            <span
                className="text-foreground truncate text-right font-semibold"
                title={value}
            >
                {value}
            </span>
            {Icon && (
                <StatusIcon
                    Icon={Icon}
                    size="md"
                    className="text-foreground/30"
                />
            )}
        </div>
    </div>
);

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

    const transportStatus =
        rpcStatus === "connected" ? liveTransportStatus : "offline";
    const statusVisual = STATUS_VISUALS[rpcStatus];

    const TransportIcon = {
        websocket: Zap,
        polling: Wifi,
        offline: Power,
    }[transportStatus];

    // --- Logic Helpers ---

    const getChipTooltip = () => {
        const engineName = t(`status_bar.engine_name_${engineType}`);
        const engineState = t(`status_bar.rpc_${rpcStatus}`);
        const transportDesc = t(`status_bar.transport_${transportStatus}_desc`);
        return t("status_bar.engine_tooltip", {
            engineName,
            transportDesc,
            status: engineState,
        });
    };

    const renderEngineLogo = () => {
        if (rpcStatus === "idle")
            return (
                <StatusIcon Icon={RefreshCw} size="md" className="opacity-50" />
            );
        if (rpcStatus === "error")
            return <StatusIcon Icon={AlertCircle} size="md" />;

        const IconComp =
            engineType === "tinytorrent" ? TinyTorrentIcon : TransmissionIcon;
        return (
            <StatusIcon Icon={IconComp} size="lg" className="text-current" />
        );
    };

    // --- Data Prep ---

    const downSpeed = sessionStats?.downloadSpeed ?? 0;
    const upSpeed = sessionStats?.uploadSpeed ?? 0;
    const isSelection = selectedCount > 0;

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
                className="flex items-center justify-between gap-stage"
                style={{
                    ...shell.contentStyle,
                    height: "var(--tt-statusbar-h)",
                    paddingLeft: "var(--spacing-panel)",
                    paddingRight: "var(--tt-navbar-padding)",
                }}
            >
                {/* --- LEFT: SPEED MODULES --- */}
                <div className="flex flex-1 items-center h-full py-tight gap-stage">
                    {[
                        {
                            label: "down",
                            val: downSpeed,
                            color: "success",
                            Icon: ArrowDown,
                        },
                        {
                            label: "up",
                            val: upSpeed,
                            color: "primary",
                            Icon: ArrowUp,
                        },
                    ].map((config, idx) => (
                        <React.Fragment key={config.label}>
                            <div className="flex flex-1 items-center h-full min-w-0 group gap-tools">
                                <div className="flex items-center shrink-0 gap-tools">
                                    <div
                                        className={cn(
                                            "flex items-center justify-center rounded-2xl bg-content1/10 text-foreground/50 transition-colors p-tight",
                                            config.color === "success"
                                                ? "group-hover:bg-success/10 group-hover:text-success"
                                                : "group-hover:bg-primary/10 group-hover:text-primary"
                                        )}
                                        style={{
                                            width: "var(--tt-status-icon-xl)",
                                            height: "var(--tt-status-icon-xl)",
                                        }}
                                    >
                                        <StatusIcon
                                            Icon={config.Icon}
                                            size="lg"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-center gap-tight">
                                        <span className="font-bold uppercase tracking-0-2 text-foreground/40">
                                            {t(`status_bar.${config.label}`)}
                                        </span>
                                        <span className="font-bold tracking-tight leading-none text-foreground">
                                            {formatSpeed(config.val)}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    className="flex-1 h-full py-tight opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100"
                                    style={{
                                        minWidth: UI_BASES.statusbar.min100,
                                    }}
                                >
                                    <NetworkGraph
                                        data={[]}
                                        color={config.color as any}
                                        className="h-full w-full"
                                    />
                                </div>
                            </div>
                            {idx === 0 && (
                                <div
                                    className="w-px bg-content1/10"
                                    style={{ height: "var(--tt-sep-h)" }}
                                />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* --- RIGHT: SYSTEM HUD --- */}
                <div
                    className="flex shrink-0 items-center border-l border-content1/10 gap-stage"
                    style={{
                        paddingLeft: "var(--tt-navbar-gap)",
                        paddingRight: "var(--spacing-panel)",
                        height: "var(--tt-statusbar-h)",
                    }}
                >
                    <StatGroup
                        label={
                            isSelection
                                ? t("status_bar.selected_count")
                                : t("status_bar.active_torrents")
                        }
                        value={
                            isSelection
                                ? `${selectedCount} ${t(
                                      "status_bar.torrents_selected"
                                  )}`
                                : sessionStats
                                ? `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
                                : "--"
                        }
                        Icon={isSelection ? HardDrive : Activity}
                        className="min-w-[var(--tt-statusbar-min120)]"
                    />

                    <StatGroup
                        label={t("status_bar.network")}
                        value={t("status_bar.dht_nodes", {
                            count: sessionStats?.dhtNodes ?? 0,
                        })}
                        Icon={Network}
                        className="min-w-[var(--tt-statusbar-min80)]"
                    />

                    {/* ENGINE CHIP */}
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={onEngineClick}
                            className={cn(
                                "relative flex items-center justify-center gap-tools rounded-xl border px-panel transition-all",
                                "active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer",
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
                            <StatusIcon
                                Icon={TransportIcon}
                                size="lg"
                                className={cn(
                                    rpcStatus === "connected" &&
                                        transportStatus === "websocket"
                                        ? "opacity-100"
                                        : "opacity-70"
                                )}
                            />

                            <div
                                className={cn(
                                    "w-px",
                                    rpcStatus === "connected"
                                        ? "bg-current opacity-20"
                                        : "bg-foreground/10"
                                )}
                                style={{ height: "var(--tt-sep-h)" }}
                            />

                            <div className="flex items-center justify-center text-current">
                                {renderEngineLogo()}
                            </div>

                            {/* Status Indicator Dot */}
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
                                    <span
                                        className="relative inline-flex rounded-full bg-current"
                                        style={{
                                            width: "var(--tt-dot-size)",
                                            height: "var(--tt-dot-size)",
                                        }}
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
