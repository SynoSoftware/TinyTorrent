// FILE: src/modules/dashboard/components/ColumnDefinitions.tsx

import { Chip, cn, Button } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import {
    FileText, // name
    Percent, // progress
    Activity, // status
    ListOrdered, // queue
    Timer, // eta
    Gauge, // speed
    Network, // peers
    HardDrive, // size
    TrendingUp, // ratio
    Clock, // added
    WifiOff,
    Users,
    FileWarning,
    ListStart,
    Pause,
    Bug,
    ArrowDown,
    ArrowUp,
    RefreshCw,
    CheckCircle,
    Hourglass,
    AlertCircle,
    AlertTriangle,
    Lock,
    Search,
} from "lucide-react";

import {
    type ServerClass,
    type TorrentStatus,
    type RecoveryState,
} from "@/services/rpc/entities";
import STATUS from "@/shared/status";
import {
    formatRecoveryStatus,
    formatRecoveryTooltip,
    extractDriveLabel,
} from "@/shared/utils/recoveryFormat";
import { classifyMissingFilesState } from "@/services/recovery/recovery-controller";
import { type TFunction } from "i18next";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { type CSSProperties, type ReactNode, type RefObject } from "react";
import { TABLE_LAYOUT, ICON_STROKE_WIDTH_DENSE } from "@/config/logic";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import {
    formatBytes,
    formatDate,
    formatEtaAbsolute,
    formatRelativeTime,
    formatSpeed,
    formatTime,
} from "@/shared/utils/format";
import { buildSplinePath } from "@/shared/utils/spline";
import type { Table } from "@tanstack/react-table";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { useMemo } from "react";

// --- TYPES ---
export type ColumnId =
    | "name"
    | "progress"
    | "status"
    | "queue"
    | "eta"
    | "speed"
    | "peers"
    | "size"
    | "ratio"
    | "added";

// We define what we expect in table.options.meta
export interface DashboardTableMeta {
    speedHistoryRef: RefObject<Record<string, Array<number | null>>>;
    optimisticStatuses: OptimisticStatusMap;
    onDownloadMissing?: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void> | void;
    onChangeLocation?: (torrent: Torrent) => Promise<void> | void;
    onOpenFolder?: (torrent: Torrent) => Promise<void> | void;
    onRetry?: (torrent: Torrent) => Promise<void> | void;
    serverClass?: ServerClass;
}

export interface ColumnRendererProps {
    torrent: Torrent;
    t: TFunction;
    isSelected: boolean;
    table: Table<Torrent>;
}

export interface ColumnDefinition {
    id: ColumnId;
    labelKey?: string;
    descriptionKey?: string;
    width?: number;
    minSize?: number;
    align?: "start" | "center" | "end";
    sortable?: boolean;
    sortAccessor?: (torrent: Torrent) => number | string;
    rpcField?: keyof Torrent;
    defaultVisible?: boolean;
    isRequired?: boolean;
    render: (ctx: ColumnRendererProps) => ReactNode;
    headerIcon?: LucideIcon;
}

type StatusColor =
    | "success"
    | "default"
    | "primary"
    | "secondary"
    | "warning"
    | "danger";

type StatusMeta = {
    color: StatusColor;
    icon: LucideIcon;
    labelKey: string;
};

const ratioValue = (torrent: Torrent) => {
    if (typeof torrent.ratio === "number") return torrent.ratio;
    if (torrent.downloaded > 0) return torrent.uploaded / torrent.downloaded;
    return torrent.uploaded === 0 ? 0 : torrent.uploaded;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const getEffectiveProgress = (torrent: Torrent) => {
    switch (torrent.state) {
        case STATUS.torrent.CHECKING:
            return clamp01(torrent.verificationProgress ?? 0);
        case STATUS.torrent.MISSING_FILES:
            return 0;

        default:
            return clamp01(torrent.progress ?? 0);
    }
};

const DENSE_TEXT = `${TABLE_LAYOUT.fontSize} ${TABLE_LAYOUT.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;

const DEFAULT_SPARKLINE_HEIGHT = 12;

const STATUS_CHIP_STYLE: CSSProperties = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
};

const getOrdinalSuffix = (value: number) => {
    const normalized = value % 100;
    if (normalized >= 11 && normalized <= 13) {
        return "th";
    }

    switch (value % 10) {
        case 1:
            return "st";
        case 2:
            return "nd";
        case 3:
            return "rd";
        default:
            return "th";
    }
};

const formatQueueOrdinal = (queuePosition?: number) => {
    if (queuePosition === undefined || queuePosition === null) {
        return "-";
    }
    const displayValue = queuePosition + 1;
    return `${displayValue}${getOrdinalSuffix(displayValue)}`;
};

const SpeedColumnCell = ({ torrent, table }: ColumnRendererProps) => {
    const { tick } = useUiClock(); // Force periodic re-render to sample external telemetry.
    void tick; // Force periodic re-render to sample external telemetry.

    const isDownloading = torrent.state === STATUS.torrent.DOWNLOADING;
    const isSeeding = torrent.state === STATUS.torrent.SEEDING;

    const speedValue = isDownloading
        ? torrent.speed.down
        : isSeeding
        ? torrent.speed.up
        : null;

    const meta = table.options.meta as DashboardTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];

    // Preserve signal integrity: unknown ≠ zero
    const sanitizedHistory: number[] = rawHistory.filter((v): v is number =>
        Number.isFinite(v)
    );

    const current = Number.isFinite(speedValue) ? speedValue : NaN;

    const sparklineHistory: number[] = Number.isFinite(current)
        ? ([...sanitizedHistory, current] as number[])
        : sanitizedHistory;

    const hasSignal = sparklineHistory.length >= 2;
    const maxSpeed = hasSignal ? Math.max(...sparklineHistory) : 0;

    const { rowHeight } = useLayoutMetrics();
    const resolvedRow = Number.isFinite(rowHeight)
        ? rowHeight
        : DEFAULT_SPARKLINE_HEIGHT * 2.5;

    const { width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT } = useMemo(() => {
        const height = Math.max(6, Math.round(resolvedRow * 0.45));
        return {
            width: Math.max(24, Math.round(resolvedRow * 2.3)),
            height,
        };
    }, [resolvedRow]);

    const path = hasSignal
        ? buildSplinePath(
              sparklineHistory,
              SPARKLINE_WIDTH,
              SPARKLINE_HEIGHT - 1,
              maxSpeed
          )
        : "";

    const speedState = isDownloading ? "down" : isSeeding ? "seed" : "idle";

    const SPEED_COLOR: Record<typeof speedState, string> = {
        down: "text-success",
        seed: "text-primary",
        idle: "text-foreground/60",
    };

    return (
        <div className="relative w-full h-full min-w-0 min-h-0">
            {/* Sparkline fills entire cell */}
            {hasSignal && (
                <svg
                    className={cn(
                        "absolute inset-0 w-full h-full overflow-visible",
                        SPEED_COLOR[speedState],
                        "opacity-50"
                    )}
                    viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                </svg>
            )}

            {/* Text padding wrapper */}
            <div className="relative z-10 flex items-center h-full pointer-events-none">
                <span
                    className={cn(
                        DENSE_NUMERIC,
                        "font-medium",
                        SPEED_COLOR[speedState],
                        "drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] dark:drop-shadow-[0_1px_1px_rgba(255,255,255,0.15)]"
                    )}
                >
                    {speedValue !== null ? formatSpeed(speedValue) : "–"}
                </span>
            </div>
        </div>
    );
};

// Allow both canonical TorrentStatus keys and RecoveryState keys
const statusMap: Record<TorrentStatus | RecoveryState, StatusMeta> = {
    downloading: {
        color: "success",
        icon: ArrowDown,
        labelKey: "table.status_dl",
    },
    seeding: {
        color: "primary",
        icon: ArrowUp,
        labelKey: "table.status_seed",
    },
    paused: {
        color: "warning",
        icon: Pause,
        labelKey: "table.status_pause",
    },
    checking: {
        color: "warning",
        icon: RefreshCw,
        labelKey: "table.status_checking",
    },
    queued: {
        color: "secondary",
        icon: ListStart,
        labelKey: "table.status_queued",
    },
    stalled: {
        color: "secondary",
        icon: WifiOff,
        labelKey: "table.status_stalled",
    },
    error: {
        color: "danger",
        icon: Bug,
        labelKey: "table.status_error",
    },
    missing_files: {
        color: "warning",
        icon: FileWarning,
        labelKey: "table.status_missing_files",
    },
    // Recovery / overlay states (these override the base torrent state visually)
    ok: {
        color: "success",
        icon: CheckCircle,
        labelKey: "recovery.status.ok",
    },
    transientWaiting: {
        color: "secondary",
        icon: Hourglass,
        labelKey: "recovery.status.transientWaiting",
    },
    needsUserAction: {
        color: "warning",
        icon: AlertCircle,
        labelKey: "recovery.status.needsUserAction",
    },
    needsUserConfirmation: {
        color: "warning",
        icon: AlertCircle,
        labelKey: "recovery.status.needsUserConfirmation",
    },
    blocked: {
        color: "danger",
        icon: Lock,
        labelKey: "recovery.status.blocked",
    },
    verifying: {
        color: "warning",
        icon: Search,
        labelKey: "recovery.status.verifying",
    },
};

export const TORRENTTABLE_COLUMN_DEFS: Record<ColumnId, ColumnDefinition> = {
    name: {
        id: "name",
        labelKey: "table.header_name",
        minSize: 90,
        sortable: true,
        rpcField: "name",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.name,
        headerIcon: FileText,
        render: ({ torrent }) => (
            <div className="flex min-w-0 items-center h-full">
                <span
                    title={
                        torrent.errorEnvelope?.errorMessage ??
                        (torrent.errorString ? torrent.errorString : undefined)
                    }
                    className={cn(
                        "font-medium truncate max-w-full transition-colors cap-height-text",
                        TABLE_LAYOUT.fontSize,
                        torrent.state === STATUS.torrent.PAUSED &&
                            "text-foreground/50"
                    )}
                >
                    {torrent.name}
                </span>
            </div>
        ),
    },

    progress: {
        id: "progress",
        labelKey: "table.header_progress",
        width: 220,
        minSize: 110,
        sortable: true,
        rpcField: "progress",
        defaultVisible: true,
        sortAccessor: getEffectiveProgress,
        headerIcon: Percent,
        render: ({ torrent }) => {
            const displayProgress = getEffectiveProgress(torrent);
            return (
                <div className="flex flex-col gap-tight w-full min-w-0 py-tight">
                    <div
                        className={cn(
                            "flex justify-between items-end font-medium opacity-80",
                            DENSE_NUMERIC
                        )}
                    >
                        <span>{(displayProgress * 100).toFixed(1)}%</span>
                        <span className="text-foreground/40">
                            {formatBytes(torrent.totalSize * displayProgress)}
                        </span>
                    </div>
                    <SmoothProgressBar
                        value={displayProgress * 100}
                        className="h-indicator"
                        trackClassName="bg-content1/20 h-full"
                        indicatorClassName={cn(
                            torrent.state === STATUS.torrent.PAUSED
                                ? "bg-gradient-to-r from-warning/50 to-warning"
                                : torrent.state === STATUS.torrent.SEEDING
                                ? "bg-gradient-to-r from-primary/50 to-primary"
                                : "bg-gradient-to-r from-success/50 to-success"
                        )}
                    />
                </div>
            );
        },
    },

    status: {
        id: "status",
        labelKey: "table.header_status",
        width: 110,
        minSize: 95,
        sortable: true,
        rpcField: "state",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.state,
        headerIcon: Activity,
        render: ({ torrent, t, table }) => {
            // Determine effective state (recovery overlay overrides engine state)
            const effectiveState =
                torrent.errorEnvelope &&
                torrent.errorEnvelope.recoveryState &&
                torrent.errorEnvelope.recoveryState !== "ok"
                    ? torrent.errorEnvelope.recoveryState
                    : torrent.state;

            const conf = statusMap[effectiveState] ?? statusMap.paused;
            const Icon = conf.icon;

            const envelopeMsg = torrent.errorEnvelope?.errorMessage;
            const statusLabel = formatRecoveryStatus(
                torrent.errorEnvelope,
                t,
                torrent.state,
                conf.labelKey
            );

            const tooltip =
                formatRecoveryTooltip(
                    torrent.errorEnvelope,
                    t,
                    torrent.state,
                    conf.labelKey
                ) || t(conf.labelKey);

            // Special-case view for missing files: aligned with state machine spec
            if (effectiveState === "missing_files") {
                const tableMeta = table.options.meta as DashboardTableMeta | undefined;
                const downloadDir =
                    torrent.savePath ??
                    torrent.downloadDir ??
                    (torrent as any).downloadDir ??
                    "";
                const classification = classifyMissingFilesState(
                    torrent.errorEnvelope,
                    downloadDir,
                    tableMeta?.serverClass ?? "unknown"
                );
                const missingBytes =
                    typeof torrent.leftUntilDone === "number"
                        ? torrent.leftUntilDone
                        : null;
                const missingLabel =
                    missingBytes !== null
                        ? formatBytes(missingBytes)
                        : t("labels.unknown");
                const fallbackText = t("recovery.inline_fallback");
                const pathLabel =
                    classification.path || downloadDir || t("labels.unknown");
                const driveLabel =
                    classification.root ??
                    extractDriveLabel(pathLabel) ??
                    t("labels.unknown");
                const isUnknownConfidence =
                    classification.confidence === "unknown";
                const dataGapStatus =
                    missingBytes !== null
                        ? `${t("torrent_modal.files.missing")}: ${missingLabel}`
                        : t("recovery.generic_header");
                const statusText = (() => {
                    if (isUnknownConfidence) {
                        return fallbackText;
                    }
                    switch (classification.kind) {
                        case "pathLoss":
                            return t("recovery.status.folder_not_found", {
                                path: pathLabel,
                            });
                        case "volumeLoss":
                            return t("recovery.status.drive_disconnected", {
                                drive: driveLabel,
                            });
                        case "accessDenied":
                            return t("recovery.status.access_denied");
                        default:
                            return dataGapStatus;
                    }
                })();
                const sizeHint =
                    classification.kind === "dataGap" &&
                    missingBytes !== null &&
                    typeof torrent.totalSize === "number"
                        ? `${t("torrent_modal.files.on_disk")}: ${formatBytes(
                              Math.max(0, torrent.totalSize - missingBytes)
                          )}  •  ${t(
                              "torrent_modal.files.expected"
                          )}: ${formatBytes(torrent.totalSize)}`
                        : null;
                const onDownloadMissing = tableMeta?.onDownloadMissing;
                const onChangeLocation = tableMeta?.onChangeLocation;
                const onOpenFolder = tableMeta?.onOpenFolder;
                const onRetry = tableMeta?.onRetry;

                const primaryConfig = (() => {
                    const common = {
                        size: "md" as const,
                        variant: "shadow" as const,
                        color: "primary" as const,
                        className: "font-medium",
                    };
                    switch (classification.kind) {
                        case "pathLoss":
                            return {
                                ...common,
                                label: t("recovery.action_locate"),
                                onPress: () => onChangeLocation?.(torrent),
                                isDisabled: !onChangeLocation,
                            };
                        case "volumeLoss":
                            return {
                                ...common,
                                label: t("recovery.action_retry"),
                                onPress: () => onRetry?.(torrent),
                                isDisabled: !onRetry,
                            };
                        case "accessDenied":
                            return {
                                ...common,
                                label: t("recovery.action_locate"),
                                onPress: () => onChangeLocation?.(torrent),
                                isDisabled: !onChangeLocation,
                            };
                        default:
                            return {
                                ...common,
                                label: t("recovery.action_download"),
                                onPress: () => onDownloadMissing?.(torrent),
                                isDisabled: !onDownloadMissing,
                            };
                    }
                })();

                const secondaryConfig = (() => {
                    const common = {
                        size: "md" as const,
                        variant: "light" as const,
                        className: "font-medium text-foreground" as const,
                    };
                    switch (classification.kind) {
                        case "pathLoss":
                            return {
                                ...common,
                                label: t("recovery.action_recreate"),
                                onPress: () =>
                                    onDownloadMissing?.(torrent, {
                                        recreateFolder: true,
                                    }),
                                isDisabled: !onDownloadMissing,
                            };
                        case "volumeLoss":
                            return {
                                ...common,
                                label: t("recovery.action_locate"),
                                onPress: () => onChangeLocation?.(torrent),
                                isDisabled: !onChangeLocation,
                            };
                        case "accessDenied":
                            return {
                                ...common,
                                label: t("recovery.action.open_folder"),
                                onPress: () => onOpenFolder?.(torrent),
                                isDisabled: !onOpenFolder,
                            };
                        default:
                            return {
                                ...common,
                                label: t("recovery.action.open_folder"),
                                onPress: () => onOpenFolder?.(torrent),
                                isDisabled: !onOpenFolder,
                            };
                    }
                })();

                return (
                    <div className="min-w-0 w-full flex items-center justify-center h-full">
                        <div className="flex flex-wrap items-center gap-tools min-w-0">
                            <div className="surface-layer-1 rounded-panel p-panel flex-1 min-w-0 flex items-center gap-tight">
                                <AlertTriangle className="toolbar-icon-size-md text-warning" />
                                <div className="flex flex-col gap-tight min-w-0">
                                    <span
                                        className="text-scaled font-semibold text-foreground truncate"
                                        title={statusText}
                                    >
                                        {statusText}
                                    </span>
                                    {sizeHint && (
                                        <span className="text-label font-mono text-foreground/70 truncate">
                                            {sizeHint}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-tools">
                                <Button
                                    variant={primaryConfig.variant}
                                    color={primaryConfig.color}
                                    size={primaryConfig.size}
                                    className={cn("ml-tight font-medium", primaryConfig.className)}
                                    isDisabled={primaryConfig.isDisabled}
                                    onPress={primaryConfig.onPress}
                                >
                                    {primaryConfig.label}
                                </Button>
                                <Button
                                    variant={secondaryConfig.variant}
                                    size={secondaryConfig.size}
                                    className={secondaryConfig.className}
                                    isDisabled={secondaryConfig.isDisabled}
                                    onPress={secondaryConfig.onPress}
                                >
                                    {secondaryConfig.label}
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            }

            return (
                <div className="min-w-0 w-full flex items-center justify-center h-full">
                    <Chip
                        size="md"
                        variant="flat"
                        color={conf.color}
                        style={STATUS_CHIP_STYLE}
                        classNames={{
                            base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
                            content:
                                "font-bold text-scaled  tracking-wider  whitespace-nowrap text-foreground",
                        }}
                    >
                        <div className="flex items-center justify-center gap-tools">
                            <StatusIcon
                                Icon={Icon}
                                size="md"
                                strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                className="text-current"
                            />
                            <span className="truncate" title={tooltip}>
                                {statusLabel}
                            </span>
                        </div>
                    </Chip>
                </div>
            );
        },
    },

    queue: {
        id: "queue",
        labelKey: "table.header_queue",
        width: 80,
        align: "center",
        sortable: true,
        rpcField: "queuePosition",
        descriptionKey: "table.column_desc_queue",
        sortAccessor: (torrent) =>
            torrent.queuePosition ?? Number.MAX_SAFE_INTEGER,
        headerIcon: ListOrdered,
        render: ({ torrent }) => (
            <span className={cn("text-foreground/60 min-w-0", DENSE_NUMERIC)}>
                {formatQueueOrdinal(torrent.queuePosition)}
            </span>
        ),
    },

    eta: {
        id: "eta",
        labelKey: "table.header_eta",
        width: 110,
        sortable: true,
        rpcField: "eta",
        descriptionKey: "table.column_desc_eta",
        sortAccessor: (torrent) =>
            torrent.eta < 0 ? Number.MAX_SAFE_INTEGER : torrent.eta,
        headerIcon: Timer,
        render: ({ torrent, t }) => {
            const relativeLabel =
                torrent.eta < 0
                    ? t("table.eta_unknown")
                    : formatTime(torrent.eta);
            const absoluteLabel =
                torrent.eta < 0 ? "-" : formatEtaAbsolute(torrent.eta);
            const tooltip =
                torrent.eta < 0
                    ? relativeLabel
                    : t("table.eta", { time: relativeLabel });
            return (
                <span
                    className={cn("text-foreground/70 min-w-0", DENSE_NUMERIC)}
                    title={tooltip}
                >
                    {absoluteLabel}
                </span>
            );
        },
    },

    speed: {
        id: "speed",
        labelKey: "table.header_speed",
        width: 180,
        minSize: 160,
        align: "end",
        sortable: true,
        defaultVisible: true,
        descriptionKey: "table.column_desc_speed",
        sortAccessor: (torrent) =>
            torrent.state === STATUS.torrent.SEEDING
                ? torrent.speed.up
                : torrent.speed.down,
        headerIcon: Gauge,
        render: (ctx) => <SpeedColumnCell {...ctx} />,
    },

    peers: {
        id: "peers",
        labelKey: "table.header_peers",
        width: 100,
        align: "end",
        sortable: true,
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.peerSummary.connected,
        headerIcon: Network,
        render: ({ torrent }) => (
            <div
                className={cn(
                    "flex items-center justify-end gap-tight text-foreground/60 min-w-0",
                    DENSE_NUMERIC
                )}
            >
                <StatusIcon
                    Icon={Users}
                    size="md"
                    strokeWidth={ICON_STROKE_WIDTH_DENSE}
                    className="opacity-50 text-current"
                />
                <span>{torrent.peerSummary.connected}</span>
                <span className="opacity-30">/</span>
                <span className="opacity-50">
                    {torrent.peerSummary.seeds ?? "-"}
                </span>
            </div>
        ),
    },

    size: {
        id: "size",
        labelKey: "table.header_size",
        width: 100,
        align: "end",
        sortable: true,
        rpcField: "totalSize",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.totalSize,
        headerIcon: HardDrive,
        render: ({ torrent }) => (
            <span className={cn("text-foreground/50 min-w-0", DENSE_NUMERIC)}>
                {formatBytes(torrent.totalSize)}
            </span>
        ),
    },

    ratio: {
        id: "ratio",
        labelKey: "table.header_ratio",
        width: 90,
        align: "end",
        sortable: true,
        rpcField: "ratio",
        descriptionKey: "table.column_desc_ratio",
        sortAccessor: (torrent) => ratioValue(torrent),
        headerIcon: TrendingUp,
        render: ({ torrent }) => (
            <span className={cn("text-foreground/60 min-w-0", DENSE_NUMERIC)}>
                {ratioValue(torrent).toFixed(2)}
            </span>
        ),
    },

    added: {
        id: "added",
        labelKey: "table.header_added",
        width: 100,
        align: "end",
        sortable: true,
        rpcField: "added",
        descriptionKey: "table.column_desc_added",
        sortAccessor: (torrent) => torrent.added,
        headerIcon: Clock,
        render: ({ torrent }) => (
            <span
                className={cn("text-foreground/50 min-w-0", DENSE_NUMERIC)}
                title={formatDate(torrent.added)}
            >
                {formatRelativeTime(torrent.added)}
            </span>
        ),
    },
};

export const DEFAULT_COLUMN_ORDER: ColumnId[] = [
    "name",
    "progress",
    "status",
    "queue",
    "eta",
    "speed",
    "peers",
    "size",
    "ratio",
    "added",
];

export const DEFAULT_VISIBLE_COLUMN_IDS: ColumnId[] = [
    "name",
    "progress",
    "status",
    "queue",
    "speed",
    "peers",
    "size",
];

export const ALL_COLUMN_IDS: ColumnId[] = Object.keys(
    TORRENTTABLE_COLUMN_DEFS
) as ColumnId[];
