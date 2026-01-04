// FILE: src/modules/dashboard/components/ColumnDefinitions.tsx

import { Chip, cn } from "@heroui/react";
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
} from "lucide-react";

import { type TorrentStatus } from "@/services/rpc/entities";
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
    speedHistoryRef: RefObject<Record<string, number[]>>;
    optimisticStatuses: OptimisticStatusMap;
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
        case "checking":
            return clamp01(torrent.verificationProgress ?? 0);

        case "missing_files":
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
    const { tick } = useUiClock();
    void tick;

    const isDownloading = torrent.state === "downloading";
    const isSeeding = torrent.state === "seeding";

    const speedValue = isDownloading
        ? torrent.speed.down
        : isSeeding
        ? torrent.speed.up
        : null;

    const meta = table.options.meta as DashboardTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];

    const sanitizedHistory = rawHistory.map((v) =>
        Number.isFinite(v) ? v : 0
    );
    const current = Number.isFinite(speedValue as number)
        ? (speedValue as number)
        : 0;

    const sparklineHistory =
        sanitizedHistory.length > 0
            ? [...sanitizedHistory, current]
            : [current, 0];

    const maxHistorySpeed = Math.max(...sparklineHistory, 0);
    const maxSpeed = Math.max(current, maxHistorySpeed, 1);

    const { rowHeight } = useLayoutMetrics();
    const resolvedRow = Number.isFinite(rowHeight)
        ? rowHeight
        : DEFAULT_SPARKLINE_HEIGHT * 2.5;

    const SPARKLINE_WIDTH = Math.max(24, Math.round(resolvedRow * 2.3));
    const SPARKLINE_HEIGHT = Math.max(6, Math.round(resolvedRow * 0.45));
    const sparklineHeight = SPARKLINE_HEIGHT - 1;

    const path = buildSplinePath(
        sparklineHistory,
        SPARKLINE_WIDTH,
        sparklineHeight,
        maxSpeed
    );

    return (
        <div className="flex items-center justify-end gap-tools min-w-0">
            <span
                className={cn(
                    "shrink-0 text-right min-w-0",
                    DENSE_NUMERIC,
                    "font-medium",
                    isDownloading
                        ? "text-success"
                        : isSeeding
                        ? "text-primary"
                        : "text-foreground/30"
                )}
            >
                {speedValue !== null ? formatSpeed(speedValue) : "-"}
            </span>
            <svg
                viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
                className={cn(
                    "h-sep w-sparkline flex-none overflow-visible",
                    isDownloading
                        ? "text-success"
                        : isSeeding
                        ? "text-primary"
                        : "text-foreground/40"
                )}
                preserveAspectRatio="none"
            >
                <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
};

const statusMap: Record<TorrentStatus, StatusMeta> = {
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
        labelKey: "torrent_modal.statuses.checking",
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
        labelKey: "torrent_modal.statuses.error",
    },
    missing_files: {
        color: "warning",
        icon: FileWarning,
        labelKey: "torrent_modal.statuses.missing_files",
    },
};

export const COLUMN_DEFINITIONS: Record<ColumnId, ColumnDefinition> = {
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
                        torrent.errorString ? torrent.errorString : undefined
                    }
                    className={cn(
                        "font-medium truncate max-w-full transition-colors cap-height-text",
                        TABLE_LAYOUT.fontSize,
                        torrent.state === "paused" && "text-foreground/50"
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
                            torrent.state === "paused"
                                ? "bg-gradient-to-r from-warning/50 to-warning"
                                : torrent.state === "seeding"
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
        render: ({ torrent, t }) => {
            // IMPORTANT: No "errorString => error" override here.
            // State is derived once in the RPC normalizer.
            const conf = statusMap[torrent.state] ?? statusMap.paused;
            const Icon = conf.icon;

            const tooltip =
                typeof torrent.errorString === "string" &&
                torrent.errorString.trim()
                    ? torrent.errorString
                    : t(conf.labelKey);

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
                                {t(conf.labelKey)}
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
            torrent.state === "seeding" ? torrent.speed.up : torrent.speed.down,
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
    COLUMN_DEFINITIONS
) as ColumnId[];
