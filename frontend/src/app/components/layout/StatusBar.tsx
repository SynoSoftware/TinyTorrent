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
import { uiRoles } from "@/shared/ui/uiRoles";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";

import { formatBytes, formatSpeed } from "@/shared/utils/format";
import { getStatusRecipeText, registry } from "@/config/logic";
import { status as appStatus } from "@/shared/status";
import { workbench as workbench } from "@/shared/ui/layout/glass-surface";
import { useSessionSpeedHistory } from "@/shared/hooks/useSessionSpeedHistory";

import type { NetworkTelemetry } from "@/services/rpc/entities";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { UiMode } from "@/app/utils/uiMode";
import type { StatusBarTransportStatus, StatusBarViewModel } from "@/app/viewModels/useAppViewModel";
import type { StatusIconProps } from "@/shared/ui/components/StatusIcon";
const { shell, visuals, ui } = registry;

const DISK_LABELS: Record<string, string> = {
    ok: "status_bar.disk_ok",
    warn: "status_bar.disk_warn",
    bad: "status_bar.disk_bad",
    unknown: "status_bar.disk_unknown",
};

const TRANSPORT_LABELS: Record<StatusBarTransportStatus, string> = {
    [appStatus.connection.polling]: "status_bar.transport_polling",
    [appStatus.connection.offline]: "status_bar.transport_offline",
};

const RPC_STATUS_LABEL: Record<string, string> = {
    [appStatus.connection.connected]: "status_bar.rpc_connected",
    [appStatus.connection.idle]: "status_bar.rpc_idle",
    [appStatus.connection.error]: "status_bar.rpc_error",
};

/* ------------------------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------------------------ */

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
                workbench.status.statGroup,
                align === "end" ? workbench.status.statGroupEnd : workbench.status.statGroupStart,
                className,
            )}
        >
            <span className={cn(visuals.typography.text.labelDense, uiRoles.text.subtle)}>{label}</span>
            <div className={workbench.status.statValueRow}>
                <AppTooltip content={value} native>
                    <span className={cn(workbench.status.statValueText)}>{value}</span>
                </AppTooltip>
                {Icon && <StatusIcon Icon={Icon} size="md" className={workbench.status.statIcon} />}
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
            ? appStatus.connection.connected
            : tone === "warn"
              ? visuals.status.keys.tone.warning
              : tone === "bad"
                ? appStatus.connection.error
                : visuals.status.keys.tone.muted;
    const toneClass = getStatusRecipeText(toneKey, visuals.status.keys.tone.muted);

    return (
        <AppTooltip content={title} native>
            <span className={cn(workbench.status.telemetryIconWrap, toneClass)}>
                <StatusIcon Icon={Icon} size="md" className={workbench.status.iconCurrent} />
            </span>
        </AppTooltip>
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
    const iconToneKey = tone === "success" ? visuals.status.keys.tone.success : visuals.status.keys.tone.primary;
    const iconToneClass = getStatusRecipeText(iconToneKey, visuals.status.keys.tone.primary);

    return (
        <>
            <div className={workbench.status.speedModule}>
                <div className={workbench.status.speedModuleGraphWrap}>
                    <div className={workbench.status.speedModuleGraph} style={{ minWidth: ui.bases.statusbar.min100 }}>
                        <NetworkGraph data={history} color={tone} className={workbench.status.speedModuleGraphCanvas} />
                        <div className={workbench.status.speedModuleOverlay}>
                            <div className={workbench.status.speedModuleOverlayRow}>
                                <div className={cn(workbench.status.speedModuleIconWrap, iconToneClass)}>
                                    <StatusIcon Icon={Icon} size="xl" className={workbench.status.iconCurrent} />
                                </div>
                                <div className={workbench.status.speedModuleTextWrap}>
                                    <span className={workbench.status.speedModuleLabel}>{t(labelKey)}</span>
                                    <span className={workbench.status.speedModuleValue}>{formatSpeed(value)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {separator && <div className={workbench.status.speedSeparator} style={{ height: "var(--tt-sep-h)" }} />}
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
    transportStatus: StatusBarTransportStatus;
    rpcStatus: ConnectionStatus;
    diskState: DiskState;
    freeBytes?: number | null;
}) {
    const { t } = useTranslation();

    // ENGINE (combined: state + transport)
    const engineIcon =
        rpcStatus === appStatus.connection.error
            ? AlertCircle
            : transportStatus === appStatus.connection.polling
              ? ArrowUpDown
              : Activity;

    const engineTone =
        rpcStatus === appStatus.connection.error
            ? "bad"
            : rpcStatus === appStatus.connection.idle
              ? "warn"
              : transportStatus === appStatus.connection.polling
                ? "warn"
                : rpcStatus === appStatus.connection.connected
                  ? "ok"
                  : "bad";

    // NETWORK
    const discoveryEnabled = telemetry?.dhtEnabled || telemetry?.pexEnabled || telemetry?.lpdEnabled;

    // Only show discovery as active when the RPC transport is connected.
    // If we're not connected, render discovery as muted to avoid showing
    // stale/passive telemetry while disconnected.
    const discoveryTone =
        rpcStatus !== appStatus.connection.connected
            ? "muted"
            : telemetry == null
              ? "muted"
              : discoveryEnabled
                ? "ok"
                : "warn";

    return (
        <div
            className={workbench.status.telemetryGrid}
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
    // Defensive: visuals.status.recipes may not contain every possible rpcStatus string
    // (e.g. legacy/experimental status values). Fall back to a sensible
    // connected visual when possible so the HUD remains informative.
    const statusVisual =
        visuals.status.recipes[rpcStatus] ??
        visuals.status.recipes[appStatus.connection.connected] ??
        Object.values(visuals.status.recipes)[0];
    const EngineIcon = uiMode === "Full" ? TinyTorrentIcon : TransmissionIcon;

    const renderEngineLogo = () => {
        if (rpcStatus === appStatus.connection.idle) {
            return <StatusIcon Icon={RefreshCw} size="lg" className={workbench.status.iconMuted} />;
        }
        if (rpcStatus === appStatus.connection.error) {
            return <StatusIcon Icon={AlertCircle} size="lg" />;
        }
        return <StatusIcon Icon={EngineIcon} size="lg" className={workbench.status.iconCurrent} />;
    };

    const button = (
        <button
            type="button"
            onClick={() => {
                if (onClick) {
                    void onClick();
                }
            }}
            className={cn(
                workbench.status.engineButton,
                statusVisual.bg,
                statusVisual.border,
                statusVisual.text,
                statusVisual.shadow,
            )}
            style={{
                height: ui.bases.statusbar.buttonH,
                minWidth: ui.bases.statusbar.buttonMinW,
            }}
        >
            {renderEngineLogo()}

            {rpcStatus === appStatus.connection.connected && (
                <span className={workbench.status.engineConnectedWrap}>
                    <motion.span
                        className={cn(workbench.status.engineConnectedPulse, statusVisual.glow)}
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
                        className={workbench.status.engineConnectedDot}
                        style={{
                            width: "var(--tt-dot-size)",
                            height: "var(--tt-dot-size)",
                        }}
                    />
                </span>
            )}
        </button>
    );

    return (
        <AppTooltip content={tooltip} native>
            {button}
        </AppTooltip>
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
    const shellTokens = shell.getTokens(workspaceStyle);

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
    const compactSpeedGraphMaxValue = Math.max(1, ...downloadHistory, ...uploadHistory);

    // Determine a localized server type label for the control tooltip.
    const modeLabel =
        rpcStatus === appStatus.connection.connected
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
            className={cn(workbench.status.footer, workbench.status.surface)}
            style={{
                ...shellTokens.outerStyle,
            }}
        >
            <div
                className={workbench.status.main}
                style={{
                    ...shellTokens.surfaceStyle,
                    height: "var(--tt-statusbar-h)",
                }}
            >
                <StatGroup
                    label={torrentStatLabel}
                    value={torrentStatValue}
                    Icon={isSelection ? Files : Activity}
                    className={workbench.status.statGroupDesktop}
                    align="end"
                />

                {/* LEFT: SPEEDS - full (shown at sm+) */}
                <div className={workbench.status.speedFull}>
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
                <div className={workbench.status.speedCompact}>
                    <div className={workbench.status.speedCompactGraphWrap}>
                        <div className={workbench.status.speedCompactLayer}>
                            <NetworkGraph
                                data={downloadHistory}
                                color="success"
                                maxValue={compactSpeedGraphMaxValue}
                                className={workbench.status.speedCompactDownGraph}
                            />
                            <div className={workbench.status.speedCompactUpLayer}>
                                <NetworkGraph
                                    data={uploadHistory}
                                    color="primary"
                                    maxValue={compactSpeedGraphMaxValue}
                                    className={workbench.status.speedCompactUpGraph}
                                />
                            </div>
                        </div>

                        <div className={workbench.status.speedCompactOverlay}>
                            <div className={workbench.status.speedCompactOverlayRow}>
                                <div className={workbench.status.speedCompactColumn}>
                                    <ArrowDown className={workbench.status.speedCompactDownIcon} aria-hidden="true" />
                                    <span className={workbench.status.srOnly}>{t("status_bar.down")}</span>
                                    <span className={workbench.status.speedCompactValue}>{formatSpeed(downSpeed)}</span>
                                </div>
                                <div className={workbench.status.speedCompactDivider} />
                                <div className={workbench.status.speedCompactColumn}>
                                    <ArrowUp className={workbench.status.speedCompactUpIcon} aria-hidden="true" />
                                    <span className={workbench.status.srOnly}>{t("status_bar.up")}</span>
                                    <span className={workbench.status.speedCompactValue}>{formatSpeed(upSpeed)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HUD */}
                <div
                    className={workbench.status.right}
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
