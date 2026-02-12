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
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";

import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { TinyTorrentIcon } from "@/shared/ui/components/TinyTorrentIcon";
import { NetworkGraph } from "@/shared/ui/graphs/NetworkGraph";

import { formatBytes, formatSpeed } from "@/shared/utils/format";
import {
    getShellTokens,
    UI_BASES,
    STATUS_VISUAL_KEYS,
    STATUS_VISUALS,
} from "@/config/logic";
import { STATUS } from "@/shared/status";
import {
    APP_STATUS_CLASS,
} from "@/shared/ui/layout/glass-surface";
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
    [STATUS.connection.POLLING]: "status_bar.transport_polling",
    [STATUS.connection.OFFLINE]: "status_bar.transport_offline",
};

const RPC_STATUS_LABEL: Record<string, string> = {
    [STATUS.connection.CONNECTED]: "status_bar.rpc_connected",
    [STATUS.connection.IDLE]: "status_bar.rpc_idle",
    [STATUS.connection.ERROR]: "status_bar.rpc_error",
};

/* ------------------------------------------------------------------ */
/* TYPES */
/* ------------------------------------------------------------------ */

type TransportStatus =
    | typeof STATUS.connection.POLLING
    | typeof STATUS.connection.OFFLINE;
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
                APP_STATUS_CLASS.statGroup,
                align === "end"
                    ? APP_STATUS_CLASS.statGroupEnd
                    : APP_STATUS_CLASS.statGroupStart,
                className
            )}
        >
            <span className={TEXT_ROLE_EXTENDED.statusBarLabel}>
                {label}
            </span>
            <div className={APP_STATUS_CLASS.statValueRow}>
                <span
                    className={cn(
                        APP_STATUS_CLASS.statValueText,
                    )}
                    title={value}
                >
                    {value}
                </span>
                {Icon && (
                    <StatusIcon
                        Icon={Icon}
                        size="md"
                        className={APP_STATUS_CLASS.statIcon}
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
    Icon: LucideIcon;
    tone: "ok" | "warn" | "bad" | "muted";
    title: string;
}) {
    const toneKey =
        tone === "ok"
            ? STATUS.connection.CONNECTED
            : tone === "warn"
              ? STATUS_VISUAL_KEYS.tone.WARNING
              : tone === "bad"
                ? STATUS.connection.ERROR
                : STATUS_VISUAL_KEYS.tone.MUTED;
    const toneClass =
        STATUS_VISUALS[toneKey]?.text ??
        STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.MUTED]?.text ??
        "text-foreground/30";

    return (
        <span
            className={cn(APP_STATUS_CLASS.telemetryIconWrap, toneClass)}
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
    Icon: LucideIcon;
    tone: "success" | "primary";
    history: number[];
    separator?: boolean;
}) {
    const { t } = useTranslation();
    const iconToneKey =
        tone === "success"
            ? STATUS_VISUAL_KEYS.tone.SUCCESS
            : STATUS_VISUAL_KEYS.tone.PRIMARY;
    const iconToneClass =
        STATUS_VISUALS[iconToneKey]?.text ??
        STATUS_VISUALS[STATUS_VISUAL_KEYS.tone.PRIMARY]?.text ??
        "text-primary";

    return (
        <>
            <div
                className={APP_STATUS_CLASS.speedModule}
            >
                <div className={APP_STATUS_CLASS.speedModuleGraphWrap}>
                    <div
                        className={APP_STATUS_CLASS.speedModuleGraph}
                        style={{ minWidth: UI_BASES.statusbar.min100 }}
                    >
                        <NetworkGraph
                            data={history}
                            color={tone}
                            className={APP_STATUS_CLASS.speedModuleGraphCanvas}
                        />
                        <div className={APP_STATUS_CLASS.speedModuleOverlay}>
                            <div className={APP_STATUS_CLASS.speedModuleOverlayRow}>
                                <div
                                    className={cn(
                                        APP_STATUS_CLASS.speedModuleIconWrap,
                                        iconToneClass
                                    )}
                                >
                                    <StatusIcon
                                        Icon={Icon}
                                        size="xl"
                                        className="text-current"
                                    />
                                </div>
                                <div className={APP_STATUS_CLASS.speedModuleTextWrap}>
                                    <span
                                        className={APP_STATUS_CLASS.speedModuleLabel}
                                    >
                                        {t(labelKey)}
                                    </span>
                                    <span className={APP_STATUS_CLASS.speedModuleValue}>
                                        {formatSpeed(value)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {separator && (
                <div
                    className={APP_STATUS_CLASS.speedSeparator}
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
            : transportStatus === STATUS.connection.POLLING
            ? ArrowUpDown
            : Activity;

    const engineTone =
        rpcStatus === STATUS.connection.ERROR
            ? "bad"
            : rpcStatus === STATUS.connection.IDLE
            ? "warn"
            : transportStatus === STATUS.connection.POLLING
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
        STATUS_VISUALS[STATUS.connection.CONNECTED] ??
        Object.values(STATUS_VISUALS)[0];
    const EngineIcon = uiMode === "Full" ? TinyTorrentIcon : TransmissionIcon;

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
            onClick={() => {
                if (onClick) {
                    void onClick();
                }
            }}
            className={cn(
                APP_STATUS_CLASS.engineButton,
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
                <span className={APP_STATUS_CLASS.engineConnectedWrap}>
                    <motion.span
                        className={cn(
                            APP_STATUS_CLASS.engineConnectedPulse,
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
                        className={APP_STATUS_CLASS.engineConnectedDot}
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
        (sessionStats as unknown as { downloadDirFreeSpace?: number })
            ?.downloadDirFreeSpace;

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

    const { down: downloadHistory, up: uploadHistory } =
        useSessionSpeedHistory();

    // Determine a localized server type label for the control tooltip.
    const modeLabel =
        rpcStatus === STATUS.connection.CONNECTED
            ? uiMode === "Full"
                ? t("settings.connection.ui_mode_full_label")
                : t("settings.connection.ui_mode_rpc_label")
            : t("status_bar.transport_offline_desc");
    const engineControlTooltip = t("status_bar.engine_control_tooltip", {
        mode: modeLabel,
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
            className={APP_STATUS_CLASS.footer}
            style={{
                ...shell.outerStyle,
            }}
        >
            <div
                className={APP_STATUS_CLASS.main}
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
                <div className={APP_STATUS_CLASS.speedFull}>
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
                <div className={APP_STATUS_CLASS.speedCompact}>
                    <div className={APP_STATUS_CLASS.speedCompactGraphWrap}>
                        <div className={APP_STATUS_CLASS.speedCompactLayer}>
                            <div className={APP_STATUS_CLASS.speedCompactLayer}>
                                <NetworkGraph
                                    data={downloadHistory}
                                    color="success"
                                    className="h-full w-full "
                                />
                            </div>
                            <div className={APP_STATUS_CLASS.speedCompactUpLayer}>
                                <NetworkGraph
                                    data={uploadHistory}
                                    color="primary"
                                    className={APP_STATUS_CLASS.speedCompactUpGraph}
                                />
                            </div>
                        </div>

                        <div className={APP_STATUS_CLASS.speedCompactOverlay}>
                            <div className={APP_STATUS_CLASS.speedCompactOverlayRow}>
                                <div className={APP_STATUS_CLASS.speedCompactColumn}>
                                    <ArrowDown
                                        className={APP_STATUS_CLASS.speedCompactDownIcon}
                                        aria-hidden="true"
                                    />
                                    <span className="sr-only">
                                        {t("status_bar.down")}
                                    </span>
                                    <span className={APP_STATUS_CLASS.speedCompactValue}>
                                        {formatSpeed(downSpeed)}
                                    </span>
                                </div>
                                <div className={APP_STATUS_CLASS.speedCompactDivider} />
                                <div className={APP_STATUS_CLASS.speedCompactColumn}>
                                    <ArrowUp
                                        className={APP_STATUS_CLASS.speedCompactUpIcon}
                                        aria-hidden="true"
                                    />
                                    <span className="sr-only">
                                        {t("status_bar.up")}
                                    </span>
                                    <span className={APP_STATUS_CLASS.speedCompactValue}>
                                        {formatSpeed(upSpeed)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HUD */}
                <div
                    className={APP_STATUS_CLASS.right}
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

