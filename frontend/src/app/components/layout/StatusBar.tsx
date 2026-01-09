import React from "react";
import {
    ArrowDown,
    ArrowUp,
    Network,
    Zap,
    ArrowUpDown,
    Component,
    Files,
    Activity,
    HardDrive,
    Cog as TransmissionIcon,
    RefreshCw,
    AlertCircle,
} from "lucide-react";
import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

import { useRpcConnection } from "@/app/hooks/useRpcConnection";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";

import { formatBytes, formatSpeed } from "@/shared/utils/format";
import { getShellTokens, UI_BASES, STATUS_VISUALS } from "@/config/logic";
import { STATUS } from "@/shared/status";
import {
    BLOCK_SHADOW,
    GLASS_BLOCK_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import { useSessionSpeedHistory } from "@/shared/hooks/useSessionSpeedHistory";

import type { SessionStats, NetworkTelemetry } from "@/services/rpc/entities";
import type { TorrentEntity } from "@/services/rpc/entities";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { WorkspaceStyle } from "@/app/hooks/useWorkspaceShell";

const DISK_LABELS: Record<string, string> = {
    ok: "status_bar.disk_ok",
    warn: "status_bar.disk_warn",
    bad: "status_bar.disk_bad",
    unknown: "status_bar.disk_unknown",
};

const TRANSPORT_LABELS: Record<string, string> = {
    websocket: "status_bar.transport_websocket",
    polling: "status_bar.transport_polling",
    offline: "status_bar.transport_offline",
};

const RPC_STATUS_LABEL: Record<string, string> = {
    [STATUS.connection.CONNECTED]: "status_bar.rpc_connected",
    [STATUS.connection.IDLE]: "status_bar.rpc_idle",
    [STATUS.connection.ERROR]: "status_bar.rpc_error",
};

/* ------------------------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------------------------ */

export type EngineDisplayType = "tinytorrent" | "transmission" | "unknown";
type TransportStatus = HeartbeatSource | "offline";
type DiskState = "ok" | "warn" | "bad" | "unknown";

interface StatusBarProps {
    workspaceStyle: WorkspaceStyle;
    sessionStats: SessionStats | null;
    rpcStatus: ConnectionStatus;
    liveTransportStatus: HeartbeatSource;
    selectedCount?: number;
    onEngineClick?: () => void;
    engineType: EngineDisplayType;
    torrents: TorrentEntity[];
}

/* ------------------------------------------------------------------ */
/* HOOKS */
/* ------------------------------------------------------------------ */

function useNetworkTelemetry() {
    const client = useTorrentClient();
    const [telemetry, setTelemetry] = React.useState<NetworkTelemetry | null>(
        null
    );

    React.useEffect(() => {
        let mounted = true;
        // Subscribe to the central HeartbeatManager via the adapter.
        // This ensures there is exactly one authoritative scheduler for network polling.
        const sub = client.subscribeToHeartbeat({
            mode: "background",
            onUpdate: (payload) => {
                if (!mounted) return;
                // payload.sessionStats is the authoritative session telemetry.
                // Map it to NetworkTelemetry shape if necessary, otherwise null.
                // Keep this conservative: avoid issuing any new network calls here.
                const net: NetworkTelemetry | null =
                    (payload as any).networkTelemetry ?? null;
                setTelemetry(net);
            },
            onError: () => {
                if (!mounted) return;
                setTelemetry(null);
            },
        });

        return () => {
            mounted = false;
            try {
                sub.unsubscribe();
            } catch {}
        };
    }, [client]);

    return telemetry;
}

/* ------------------------------------------------------------------ */
/* SMALL PRIMITIVES */
/* ------------------------------------------------------------------ */

function StatGroup({
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
}) {
    return (
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
}

function TelemetryIcon({
    Icon,
    tone,
    title,
}: {
    Icon: React.ComponentType<any>;
    tone: "ok" | "warn" | "bad" | "muted";
    title: string;
}) {
    const toneClass =
        tone === "ok"
            ? "text-success"
            : tone === "warn"
            ? "text-warning"
            : tone === "bad"
            ? "text-danger"
            : "text-foreground/30";

    return (
        <span
            className={cn("inline-flex items-center", toneClass)}
            title={title}
        >
            <StatusIcon Icon={Icon} size="md" className="text-current" />
        </span>
    );
}

/* ------------------------------------------------------------------ */
/* LEFT: SPEED MODULES */
/* ------------------------------------------------------------------ */

function SpeedModule({
    labelKey,
    value,
    Icon,
    tone,
    history,
    separator,
}: {
    labelKey: string;
    value: number;
    Icon: React.ComponentType<any>;
    tone: "success" | "primary";
    history: number[];
    separator?: boolean;
}) {
    const { t } = useTranslation();

    return (
        <>
            <div
                className={cn(
                    "flex flex-1 items-center h-full min-w-0 gap-tools group",
                    "rounded-modal",
                    "border border-content1/20",
                    "bg-content1/5 backdrop-blur-sm",
                    "transition-all duration-300",
                    "group-hover:border-content1/40",
                    "group-hover:bg-content1/10"
                )}
            >
                <div className="flex flex-1 items-center h-full min-w-0  gap-tools">
                    <div
                        className="flex-1 h-full min-w-0 min-h-0 py-tight overflow-hidden opacity-30 grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100"
                        style={{ minWidth: UI_BASES.statusbar.min100 }}
                    >
                        <NetworkGraph
                            data={history}
                            color={tone as any}
                            className="h-full w-full"
                        />
                    </div>
                    <div className="flex items-center shrink-0 gap-tools">
                        <div
                            className={cn(
                                "flex items-center justify-center  rounded-modal bg-content1/10 text-foreground/50 transition-colors  toolbar-icon-size-xl",
                                tone === "success"
                                    ? "group-hover:bg-success/10 group-hover:text-success"
                                    : "group-hover:bg-primary/10 group-hover:text-primary"
                            )}
                        >
                            <StatusIcon Icon={Icon} size="lg" />
                        </div>

                        <div className="flex flex-col justify-center gap-tight">
                            <span className="font-bold uppercase tracking-0-2 text-foreground/40">
                                {t(labelKey)}
                            </span>
                            <span className="font-bold tracking-tight leading-none text-foreground">
                                {formatSpeed(value)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            {separator && (
                <div
                    className="w-px bg-content1/10"
                    style={{ height: "var(--tt-sep-h)" }}
                />
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* RIGHT: TELEMETRY GRID (NO ICON REPEATS) */
/* ------------------------------------------------------------------ */

function StatusTelemetryGrid({
    telemetry,
    transportStatus,
    rpcStatus,
    diskState,
    freeBytes,
}: {
    telemetry: NetworkTelemetry | null;
    transportStatus: TransportStatus;
    rpcStatus: ConnectionStatus;
    diskState: DiskState;
    freeBytes?: number | null;
}) {
    const { t } = useTranslation();

    // ENGINE (combined: state + transport)
    const engineIcon =
        rpcStatus === STATUS.connection.ERROR
            ? AlertCircle
            : transportStatus === "websocket"
            ? Zap
            : transportStatus === "polling"
            ? ArrowUpDown
            : Activity;

    const engineTone =
        rpcStatus === STATUS.connection.ERROR
            ? "bad"
            : rpcStatus === STATUS.connection.IDLE
            ? "warn"
            : transportStatus === "polling"
            ? "warn"
            : rpcStatus === STATUS.connection.CONNECTED
            ? "ok"
            : "bad";

    // NETWORK
    const discoveryEnabled =
        telemetry?.dhtEnabled || telemetry?.pexEnabled || telemetry?.lpdEnabled;

    // Only show discovery as active when the RPC transport is connected.
    // If we're not connected, render discovery as muted to avoid showing
    // stale/passive telemetry while disconnected.
    const discoveryTone =
        rpcStatus !== STATUS.connection.CONNECTED
            ? "muted"
            : telemetry == null
            ? "muted"
            : discoveryEnabled
            ? "ok"
            : "warn";

    return (
        <div
            className="grid gap-x-stage gap-y-tight"
            style={{
                gridTemplateColumns: "repeat(2, auto)",
                gridTemplateRows: "repeat(2, auto)",
                alignItems: "center",
            }}
        >
            {/* ROW 1 — LOCAL */}
            <TelemetryIcon
                Icon={engineIcon}
                tone={engineTone}
                title={t("status_bar.engine_telemetry_tooltip", {
                    transport: t(
                        TRANSPORT_LABELS[transportStatus] ??
                            `status_bar.transport_${transportStatus}`
                    ),
                    status: t(
                        RPC_STATUS_LABEL[rpcStatus] ??
                            `status_bar.rpc_${rpcStatus}`
                    ),
                })}
            />

            <TelemetryIcon
                Icon={HardDrive}
                tone={
                    diskState === "ok"
                        ? "ok"
                        : diskState === "warn"
                        ? "warn"
                        : diskState === "bad"
                        ? "bad"
                        : "muted"
                }
                title={
                    freeBytes != null
                        ? `${t(
                              DISK_LABELS[diskState] ??
                                  `status_bar.disk_${diskState}`
                          )}\n\n${t("status_bar.disk_free", {
                              size: formatBytes(freeBytes),
                          })}`
                        : t(
                              DISK_LABELS[diskState] ??
                                  `status_bar.disk_${diskState}`
                          )
                }
            />

            {/* ROW 2 — NETWORK */}
            <TelemetryIcon
                Icon={Network}
                tone={discoveryTone}
                title={t("status_bar.discovery_tooltip", {
                    dht: telemetry?.dhtEnabled
                        ? t("labels.on")
                        : t("labels.off"),
                    pex: telemetry?.pexEnabled
                        ? t("labels.on")
                        : t("labels.off"),
                    lpd: telemetry?.lpdEnabled
                        ? t("labels.on")
                        : t("labels.off"),
                })}
            />

            <TelemetryIcon
                Icon={Component}
                tone={discoveryTone}
                title={t("status_bar.swarm_tooltip")}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* RIGHT: ENGINE CHIP (ACTIVE CONTROL ONLY) */
/* ------------------------------------------------------------------ */

function EngineControlChip({
    rpcStatus,
    engineType,
    onClick,
    tooltip,
}: {
    rpcStatus: ConnectionStatus;
    engineType: EngineDisplayType;
    onClick?: () => void;
    tooltip: string;
}) {
    // Defensive: STATUS_VISUALS may not contain every possible rpcStatus string
    // (e.g. legacy/experimental status values). Fall back to a sensible
    // connected visual when possible so the HUD remains informative.
    const statusVisual =
        STATUS_VISUALS[rpcStatus] ??
        STATUS_VISUALS[STATUS.connection.CONNECTED] ??
        Object.values(STATUS_VISUALS)[0];
    const EngineIcon =
        engineType === "tinytorrent" ? TinyTorrentIcon : TransmissionIcon;

    const renderEngineLogo = () => {
        if (rpcStatus === STATUS.connection.IDLE) {
            return (
                <StatusIcon Icon={RefreshCw} size="lg" className="opacity-50" />
            );
        }
        if (rpcStatus === STATUS.connection.ERROR) {
            return <StatusIcon Icon={AlertCircle} size="lg" />;
        }
        return (
            <StatusIcon Icon={EngineIcon} size="lg" className="text-current" />
        );
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "relative flex items-center justify-center  rounded-modal border px-panel transition-all",
                "active:scale-95 focus-visible:outline-none focus-visible:ring focus-visible:ring-primary/60 cursor-pointer",
                statusVisual.bg,
                statusVisual.border,
                statusVisual.text,
                statusVisual.shadow
            )}
            title={tooltip}
            style={{
                height: UI_BASES.statusbar.buttonH,
                minWidth: UI_BASES.statusbar.buttonMinW,
            }}
        >
            {renderEngineLogo()}

            {rpcStatus === STATUS.connection.CONNECTED && (
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
    );
}

/* ------------------------------------------------------------------ */
/* MAIN */
/* ------------------------------------------------------------------ */

export function StatusBar({
    workspaceStyle,
    sessionStats,
    rpcStatus,
    liveTransportStatus,
    selectedCount = 0,
    onEngineClick,
    engineType,
    torrents,
}: StatusBarProps) {
    const { t } = useTranslation();
    const shell = getShellTokens(workspaceStyle);
    const telemetry = useNetworkTelemetry();
    const rpcConnection = useRpcConnection();
    const client = useTorrentClient();

    // StatusBar must not independently fetch the full torrent list; prefer
    // the parent-provided `torrents` (from Heartbeat) to avoid N+1 storms.
    // Keep a nullable placeholder so `sourceTorrents` logic remains simple.
    const [fetchedTorrents, setFetchedTorrents] = React.useState<
        TorrentEntity[] | null
    >(null);

    const transportStatus: TransportStatus =
        rpcStatus === STATUS.connection.CONNECTED
            ? liveTransportStatus
            : "offline";

    // Disk safety calculation (canonical logic)
    const freeBytes =
        telemetry?.downloadDirFreeSpace ??
        (sessionStats as unknown as { downloadDirFreeSpace?: number })
            ?.downloadDirFreeSpace;

    const sourceTorrents =
        torrents && torrents.length > 0 ? torrents : fetchedTorrents || [];

    const activeTorrents = (sourceTorrents || []).filter(
        (t) =>
            !t.isFinished &&
            t.state !== STATUS.torrent.PAUSED &&
            t.state !== STATUS.torrent.MISSING_FILES &&
            !t.isGhost
    );

    let diskState: DiskState = "unknown";

    if (freeBytes != null) {
        if (activeTorrents.length > 0) {
            const requiredBytes = activeTorrents.reduce(
                (sum, t) => sum + (t.leftUntilDone ?? 0),
                0
            );

            if (freeBytes < requiredBytes) {
                diskState = "bad";
            } else if (freeBytes < requiredBytes * 1.15) {
                diskState = "warn";
            } else {
                diskState = "ok";
            }
        } else {
            // No active downloads; we still know free space from the server.
            // Treat presence of a concrete freeBytes value as OK.
            diskState = "ok";
        }
    }

    const downSpeed = sessionStats?.downloadSpeed ?? 0;
    const upSpeed = sessionStats?.uploadSpeed ?? 0;
    const isSelection = selectedCount > 0;

    const { down: downloadHistory, up: uploadHistory } =
        useSessionSpeedHistory(sessionStats);

    // Separate tooltips: telemetry (passive) vs control (action)
    const engineTelemetryTooltip = t("status_bar.engine_telemetry_tooltip", {
        transport: t(
            TRANSPORT_LABELS[transportStatus] ??
                `status_bar.transport_${transportStatus}`
        ),
        status: t(RPC_STATUS_LABEL[rpcStatus] ?? `status_bar.rpc_${rpcStatus}`),
    });

    // Determine a localized server type label for the control tooltip.
    const serverTypeLabel =
        rpcStatus === STATUS.connection.CONNECTED
            ? engineType === "tinytorrent"
                ? t("status_bar.engine_name_tinytorrent")
                : engineType === "transmission"
                ? t("status_bar.engine_name_transmission")
                : t("status_bar.engine_unknown")
            : t("status_bar.transport_offline_desc");

    const engineControlTooltip = t("status_bar.engine_control_tooltip", {
        serverType: serverTypeLabel,
    });

    const torrentStatLabel = isSelection
        ? t("status_bar.selected_count")
        : t("status_bar.active_torrents");

    const torrentStatValue = sessionStats
        ? isSelection
            ? `${selectedCount} / ${sessionStats.torrentCount}`
            : `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
        : "--";

    return (
        <footer
            className={cn(
                "w-full shrink-0 select-none relative z-30 overflow-visible",
                GLASS_BLOCK_SURFACE,
                BLOCK_SHADOW
            )}
            style={{
                ...shell.outerStyle,
            }}
        >
            <div
                className="flex items-center justify-between gap-stage"
                style={{
                    ...shell.surfaceStyle,
                    height: "var(--tt-statusbar-h)",
                }}
            >
                <StatGroup
                    label={torrentStatLabel}
                    value={torrentStatValue}
                    Icon={isSelection ? Files : Activity}
                    className="hidden sm:flex"
                    align="end"
                />

                {/* LEFT: SPEEDS - full (shown at sm+) */}
                <div className="hidden sm:flex flex-1 items-center h-full py-tight gap-stage min-w-0">
                    <SpeedModule
                        labelKey="status_bar.down"
                        value={downSpeed}
                        Icon={ArrowDown}
                        tone="success"
                        history={downloadHistory}
                        separator
                    />
                    <SpeedModule
                        labelKey="status_bar.up"
                        value={upSpeed}
                        Icon={ArrowUp}
                        tone="primary"
                        history={uploadHistory}
                    />
                </div>

                {/* LEFT: SPEEDS - compact (xs) */}
                <div className="flex sm:hidden flex-1 items-center h-full py-tight min-w-0">
                    <div className="relative flex-1 h-full min-h-0">
                        <div className="absolute inset-0">
                            <div className="absolute inset-0">
                                <NetworkGraph
                                    data={downloadHistory}
                                    color="success"
                                    className="h-full w-full "
                                />
                            </div>
                            <div className="absolute inset-0 z-10">
                                <NetworkGraph
                                    data={uploadHistory}
                                    color="primary"
                                    className="h-full w-full opacity-60 mix-blend-screen"
                                />
                            </div>
                        </div>

                        <div className="relative z-30 flex items-center justify-center h-full pointer-events-none">
                            <div className="flex items-center gap-tight text-center">
                                <div className="flex flex-col items-center">
                                    <ArrowDown
                                        className="toolbar-icon-size-md text-success"
                                        aria-hidden="true"
                                    />
                                    <span className="sr-only">
                                        {t("status_bar.down")}
                                    </span>
                                    <span className="font-bold tracking-tight leading-none text-foreground">
                                        {formatSpeed(downSpeed)}
                                    </span>
                                </div>
                                <div className="w-px h-nav bg-content1/10 mx-tight" />
                                <div className="flex flex-col items-center">
                                    <ArrowUp
                                        className="toolbar-icon-size-md text-primary"
                                        aria-hidden="true"
                                    />
                                    <span className="sr-only">
                                        {t("status_bar.up")}
                                    </span>
                                    <span className="font-bold tracking-tight leading-none text-foreground">
                                        {formatSpeed(upSpeed)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HUD */}
                <div
                    className="flex shrink-0 items-center border-l border-content1/10 gap-stage"
                    style={{
                        height: "var(--tt-statusbar-h)",
                    }}
                >
                    <StatusTelemetryGrid
                        telemetry={telemetry}
                        transportStatus={transportStatus}
                        rpcStatus={rpcStatus}
                        diskState={diskState}
                        freeBytes={freeBytes}
                    />

                    <EngineControlChip
                        rpcStatus={rpcStatus}
                        engineType={engineType}
                        onClick={onEngineClick}
                        tooltip={engineControlTooltip}
                    />
                </div>
            </div>
        </footer>
    );
}
