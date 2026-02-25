import {
    ArrowDown,
    ArrowUp,
    Network,
    ArrowUpDown,
    Component,
    Files,
    Activity,
    HardDrive,
    Cog as TransmissionIcon,
    RefreshCw,
    AlertCircle,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { TEXT_ROLE_EXTENDED } from "@/config/textRoles";

import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";

import { formatBytes, formatSpeed } from "@/shared/utils/format";
import { getShellTokens, UI_BASES, STATUS_VISUAL_KEYS, STATUS_VISUALS } from "@/config/logic";
import { STATUS as APP_STATUS } from "@/shared/status";
import { WORKBENCH } from "@/shared/ui/layout/glass-surface";
import { useSessionSpeedHistory } from "@/shared/hooks/useSessionSpeedHistory";

import type { NetworkTelemetry } from "@/services/rpc/entities";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { UiMode } from "@/app/utils/uiMode";
import type { StatusBarViewModel } from "@/app/viewModels/useAppViewModel";
import type { StatusIconProps } from "@/shared/ui/components/StatusIcon";

const DISK_LABELS: Record<string, string> = {
    ok: "status_bar.disk_ok",
    warn: "status_bar.disk_warn",
    bad: "status_bar.disk_bad",
    unknown: "status_bar.disk_unknown",
};

const TRANSPORT_LABELS: Record<TransportStatus, string> = {
    [APP_STATUS.connection.POLLING]: "status_bar.transport_polling",
    [APP_STATUS.connection.OFFLINE]: "status_bar.transport_offline",
};

const RPC_STATUS_LABEL: Record<string, string> = {
    [APP_STATUS.connection.CONNECTED]: "status_bar.rpc_connected",
    [APP_STATUS.connection.IDLE]: "status_bar.rpc_idle",
    [APP_STATUS.connection.ERROR]: "status_bar.rpc_error",
};

/* ------------------------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------------------------ */

type TransportStatus = typeof APP_STATUS.connection.POLLING | typeof APP_STATUS.connection.OFFLINE;
type DiskState = "ok" | "warn" | "bad" | "unknown";

interface StatusBarProps {
    viewModel: StatusBarViewModel;
}

type StatusBarIconComponent = StatusIconProps["Icon"];

/* ------------------------------------------------------------------ */
/* HOOKS */
/* ------------------------------------------------------------------ */

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
    Icon?: StatusBarIconComponent;
    className?: string;
    align?: "start" | "end";
}) {
    return (
        <div
            className={cn(
                WORKBENCH.status.statGroup,
                align === "end" ? WORKBENCH.status.statGroupEnd : WORKBENCH.status.statGroupStart,
                className,
            )}
        >
            <span className={TEXT_ROLE_EXTENDED.statusBarLabel}>{label}</span>
            <div className={WORKBENCH.status.statValueRow}>
                <span className={cn(WORKBENCH.status.statValueText)} title={value}>
                    {value}
                </span>
                {Icon && <StatusIcon Icon={Icon} size="md" className={WORKBENCH.status.statIcon} />}
            </div>
        </div>
    );
}

function TelemetryIcon({
    Icon,
    tone,
    title,
}: {
    Icon: LucideIcon;
    tone: "ok" | "warn" | "bad" | "muted";
    title: string;
}) {
    const toneKey =
        tone === "ok"
            ? APP_STATUS.connection.CONNECTED
            : tone === "warn"
              ? STATUS_VISUAL_KEYS.tone.WARNING
              : tone === "bad"
                ? APP_STATUS.connection.ERROR
                : STATUS_VISUAL_KEYS.tone.MUTED;
    const toneClass =
        STATUS_VISUALS[toneKey]?.text ?? STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.MUTED]?.text ?? "text-foreground/30";

    return (
        <span className={cn(WORKBENCH.status.telemetryIconWrap, toneClass)} title={title}>
            <StatusIcon Icon={Icon} size="md" className={WORKBENCH.status.iconCurrent} />
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
    Icon: LucideIcon;
    tone: "success" | "primary";
    history: number[];
    separator?: boolean;
}) {
    const { t } = useTranslation();
    const iconToneKey = tone === "success" ? STATUS_VISUAL_KEYS.tone.SUCCESS : STATUS_VISUAL_KEYS.tone.PRIMARY;
    const iconToneClass =
        STATUS_VISUALS[iconToneKey]?.text ?? STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.PRIMARY]?.text ?? "text-primary";

    return (
        <>
            <div className={WORKBENCH.status.speedModule}>
                <div className={WORKBENCH.status.speedModuleGraphWrap}>
                    <div className={WORKBENCH.status.speedModuleGraph} style={{ minWidth: UI_BASES.statusbar.min100 }}>
                        <NetworkGraph data={history} color={tone} className={WORKBENCH.status.speedModuleGraphCanvas} />
                        <div className={WORKBENCH.status.speedModuleOverlay}>
                            <div className={WORKBENCH.status.speedModuleOverlayRow}>
                                <div className={cn(WORKBENCH.status.speedModuleIconWrap, iconToneClass)}>
                                    <StatusIcon Icon={Icon} size="xl" className={WORKBENCH.status.iconCurrent} />
                                </div>
                                <div className={WORKBENCH.status.speedModuleTextWrap}>
                                    <span className={WORKBENCH.status.speedModuleLabel}>{t(labelKey)}</span>
                                    <span className={WORKBENCH.status.speedModuleValue}>{formatSpeed(value)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {separator && <div className={WORKBENCH.status.speedSeparator} style={{ height: "var(--tt-sep-h)" }} />}
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
        rpcStatus === APP_STATUS.connection.ERROR
            ? AlertCircle
            : transportStatus === APP_STATUS.connection.POLLING
              ? ArrowUpDown
              : Activity;

    const engineTone =
        rpcStatus === APP_STATUS.connection.ERROR
            ? "bad"
            : rpcStatus === APP_STATUS.connection.IDLE
              ? "warn"
              : transportStatus === APP_STATUS.connection.POLLING
                ? "warn"
                : rpcStatus === APP_STATUS.connection.CONNECTED
                  ? "ok"
                  : "bad";

    // NETWORK
    const discoveryEnabled = telemetry?.dhtEnabled || telemetry?.pexEnabled || telemetry?.lpdEnabled;

    // Only show discovery as active when the RPC transport is connected.
    // If we're not connected, render discovery as muted to avoid showing
    // stale/passive telemetry while disconnected.
    const discoveryTone =
        rpcStatus !== APP_STATUS.connection.CONNECTED
            ? "muted"
            : telemetry == null
              ? "muted"
              : discoveryEnabled
                ? "ok"
                : "warn";

    return (
        <div
            className={WORKBENCH.status.telemetryGrid}
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
                    transport: t(TRANSPORT_LABELS[transportStatus] ?? `status_bar.transport_${transportStatus}`),
                    status: t(RPC_STATUS_LABEL[rpcStatus] ?? `status_bar.rpc_${rpcStatus}`),
                })}
            />

            <TelemetryIcon
                Icon={HardDrive}
                tone={diskState === "ok" ? "ok" : diskState === "warn" ? "warn" : diskState === "bad" ? "bad" : "muted"}
                title={
                    freeBytes != null
                        ? `${t(DISK_LABELS[diskState] ?? `status_bar.disk_${diskState}`)}\n\n${t(
                              "status_bar.disk_free",
                              {
                                  size: formatBytes(freeBytes),
                              },
                          )}`
                        : t(DISK_LABELS[diskState] ?? `status_bar.disk_${diskState}`)
                }
            />

            {/* ROW 2 — NETWORK */}
            <TelemetryIcon
                Icon={Network}
                tone={discoveryTone}
                title={t("status_bar.discovery_tooltip", {
                    dht: telemetry?.dhtEnabled ? t("labels.on") : t("labels.off"),
                    pex: telemetry?.pexEnabled ? t("labels.on") : t("labels.off"),
                    lpd: telemetry?.lpdEnabled ? t("labels.on") : t("labels.off"),
                })}
            />

            <TelemetryIcon Icon={Component} tone={discoveryTone} title={t("status_bar.swarm_tooltip")} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* RIGHT: ENGINE CHIP (ACTIVE CONTROL ONLY) */
/* ------------------------------------------------------------------ */

function EngineControlChip({
    rpcStatus,
    uiMode,
    onClick,
    tooltip,
}: {
    rpcStatus: ConnectionStatus;
    uiMode: UiMode;
    onClick?: () => Promise<unknown>;
    tooltip: string;
}) {
    // Defensive: STATUS_VISUALS may not contain every possible rpcStatus string
    // (e.g. legacy/experimental status values). Fall back to a sensible
    // connected visual when possible so the HUD remains informative.
    const statusVisual =
        STATUS_VISUALS[rpcStatus] ??
        STATUS_VISUALS[APP_STATUS.connection.CONNECTED] ??
        Object.values(STATUS_VISUALS)[0];
    const EngineIcon = uiMode === "Full" ? TinyTorrentIcon : TransmissionIcon;

    const renderEngineLogo = () => {
        if (rpcStatus === APP_STATUS.connection.IDLE) {
            return <StatusIcon Icon={RefreshCw} size="lg" className={WORKBENCH.status.iconMuted} />;
        }
        if (rpcStatus === APP_STATUS.connection.ERROR) {
            return <StatusIcon Icon={AlertCircle} size="lg" />;
        }
        return <StatusIcon Icon={EngineIcon} size="lg" className={WORKBENCH.status.iconCurrent} />;
    };

    return (
        <button
            type="button"
            onClick={() => {
                if (onClick) {
                    void onClick();
                }
            }}
            className={cn(
                WORKBENCH.status.engineButton,
                statusVisual.bg,
                statusVisual.border,
                statusVisual.text,
                statusVisual.shadow,
            )}
            title={tooltip}
            style={{
                height: UI_BASES.statusbar.buttonH,
                minWidth: UI_BASES.statusbar.buttonMinW,
            }}
        >
            {renderEngineLogo()}

            {rpcStatus === APP_STATUS.connection.CONNECTED && (
                <span className={WORKBENCH.status.engineConnectedWrap}>
                    <motion.span
                        className={cn(WORKBENCH.status.engineConnectedPulse, statusVisual.glow)}
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
                        className={WORKBENCH.status.engineConnectedDot}
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

export function StatusBar({ viewModel }: StatusBarProps) {
    const {
        workspaceStyle,
        sessionStats,
        transportStatus,
        telemetry,
        rpcStatus,
        uiMode,
        handleReconnect,
        selectedCount = 0,
        activeDownloadCount,
        activeDownloadRequiredBytes,
    } = viewModel;
    const { t } = useTranslation();
    const shell = getShellTokens(workspaceStyle);

    // Disk safety calculation (canonical logic)
    const freeBytes =
        telemetry?.downloadDirFreeSpace ??
        (sessionStats as unknown as { downloadDirFreeSpace?: number })?.downloadDirFreeSpace;

    let diskState: DiskState = "unknown";

    if (freeBytes != null) {
        if (activeDownloadCount > 0) {
            if (freeBytes < activeDownloadRequiredBytes) {
                diskState = "bad";
            } else if (freeBytes < activeDownloadRequiredBytes * 1.15) {
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

    const { down: downloadHistory, up: uploadHistory } = useSessionSpeedHistory();

    // Determine a localized server type label for the control tooltip.
    const modeLabel =
        rpcStatus === APP_STATUS.connection.CONNECTED
            ? uiMode === "Full"
                ? t("settings.connection.ui_mode_full_label")
                : t("settings.connection.ui_mode_rpc_label")
            : t("status_bar.transport_offline_desc");
    const engineControlTooltip = t("status_bar.engine_control_tooltip", {
        mode: modeLabel,
    });

    const torrentStatLabel = isSelection ? t("status_bar.selected_count") : t("status_bar.active_torrents");

    const torrentStatValue = sessionStats
        ? isSelection
            ? `${selectedCount} / ${sessionStats.torrentCount}`
            : `${sessionStats.activeTorrentCount} / ${sessionStats.torrentCount}`
        : "--";

    return (
        <footer
            className={cn(WORKBENCH.status.footer, WORKBENCH.status.surface)}
            style={{
                ...shell.outerStyle,
            }}
        >
            <div
                className={WORKBENCH.status.main}
                style={{
                    ...shell.surfaceStyle,
                    height: "var(--tt-statusbar-h)",
                }}
            >
                <StatGroup
                    label={torrentStatLabel}
                    value={torrentStatValue}
                    Icon={isSelection ? Files : Activity}
                    className={WORKBENCH.status.statGroupDesktop}
                    align="end"
                />

                {/* LEFT: SPEEDS - full (shown at sm+) */}
                <div className={WORKBENCH.status.speedFull}>
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
                <div className={WORKBENCH.status.speedCompact}>
                    <div className={WORKBENCH.status.speedCompactGraphWrap}>
                        <div className={WORKBENCH.status.speedCompactLayer}>
                            <div className={WORKBENCH.status.speedCompactLayer}>
                                <NetworkGraph
                                    data={downloadHistory}
                                    color="success"
                                    className={WORKBENCH.status.speedCompactDownGraph}
                                />
                            </div>
                            <div className={WORKBENCH.status.speedCompactUpLayer}>
                                <NetworkGraph
                                    data={uploadHistory}
                                    color="primary"
                                    className={WORKBENCH.status.speedCompactUpGraph}
                                />
                            </div>
                        </div>

                        <div className={WORKBENCH.status.speedCompactOverlay}>
                            <div className={WORKBENCH.status.speedCompactOverlayRow}>
                                <div className={WORKBENCH.status.speedCompactColumn}>
                                    <ArrowDown className={WORKBENCH.status.speedCompactDownIcon} aria-hidden="true" />
                                    <span className={WORKBENCH.status.srOnly}>{t("status_bar.down")}</span>
                                    <span className={WORKBENCH.status.speedCompactValue}>{formatSpeed(downSpeed)}</span>
                                </div>
                                <div className={WORKBENCH.status.speedCompactDivider} />
                                <div className={WORKBENCH.status.speedCompactColumn}>
                                    <ArrowUp className={WORKBENCH.status.speedCompactUpIcon} aria-hidden="true" />
                                    <span className={WORKBENCH.status.srOnly}>{t("status_bar.up")}</span>
                                    <span className={WORKBENCH.status.speedCompactValue}>{formatSpeed(upSpeed)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HUD */}
                <div
                    className={WORKBENCH.status.right}
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
                        uiMode={uiMode}
                        onClick={handleReconnect}
                        tooltip={engineControlTooltip}
                    />
                </div>
            </div>
        </footer>
    );
}
