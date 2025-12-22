// FILE: src/modules/dashboard/components/ColumnDefinitions.tsx

import {
    Button,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    cn,
} from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import {
    ArrowDown,
    ArrowDownCircle,
    ArrowUp,
    ArrowUpCircle,
    Box,
    CalendarClock,
    CheckCircle2,
    Clock3,
    Gauge,
    Hash,
    ListChecks,
    MoreVertical,
    Pause,
    PauseCircle,
    PlayCircle,
    Scale,
    Trash2,
    Users,
} from "lucide-react";
import { type TFunction } from "i18next";
import {
    formatBytes,
    formatDate,
    formatEtaAbsolute,
    formatRelativeTime,
    formatSpeed,
    formatTime,
} from "../../../shared/utils/format";
import { buildSplinePath } from "../../../shared/utils/spline";
import type { Torrent } from "../types/torrent";
import { type CSSProperties, type ReactNode } from "react";
import {
    TABLE_LAYOUT,
    ICON_STROKE_WIDTH_DENSE,
    LAYOUT_METRICS,
} from "../../../config/logic";
import { GLASS_MENU_SURFACE } from "../../../shared/ui/layout/glass-surface";
import { SmoothProgressBar } from "../../../shared/ui/components/SmoothProgressBar";
import type { Table } from "@tanstack/react-table";
import type { OptimisticStatusMap } from "./TorrentTable";

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
    | "hash"
    | "added";

// We define what we expect in table.options.meta
export interface DashboardTableMeta {
    speedHistory: Record<string, number[]>;
    optimisticStatuses: OptimisticStatusMap;
}

export interface ColumnRendererProps {
    torrent: Torrent;
    t: TFunction;
    isSelected: boolean;
    table: Table<Torrent>; // Added table instance access
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

const ratioValue = (torrent: Torrent) => {
    if (typeof torrent.ratio === "number") return torrent.ratio;
    if (torrent.downloaded > 0) return torrent.uploaded / torrent.downloaded;
    return torrent.uploaded === 0 ? 0 : torrent.uploaded;
};
const getEffectiveProgress = (torrent: Torrent) => {
    const rawProgress =
        torrent.state === "checking"
            ? torrent.verificationProgress ?? torrent.progress
            : torrent.progress;
    const normalized = rawProgress ?? 0;
    return Math.max(Math.min(normalized, 1), 0);
};

const DENSE_TEXT = `${TABLE_LAYOUT.fontSize} ${TABLE_LAYOUT.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;
const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 12;
const STATUS_CHIP_GAP = Math.max(2, LAYOUT_METRICS.panelGap);
const STATUS_CHIP_RADIUS = Math.max(
    2,
    Math.round(LAYOUT_METRICS.innerRadius / 2)
);
const STATUS_CHIP_STYLE: CSSProperties = {
    gap: `${STATUS_CHIP_GAP}px`,
    borderRadius: `${STATUS_CHIP_RADIUS}px`,
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
    const isDownloading = torrent.state === "downloading";
    const isSeeding = torrent.state === "seeding";
    const speedValue = isDownloading
        ? torrent.speed.down
        : isSeeding
        ? torrent.speed.up
        : null;

    const meta = table.options.meta as DashboardTableMeta | undefined;
    const history = meta?.speedHistory?.[torrent.id] ?? [];
    const sparklineHistory = history.length > 0 ? history : [0, 0];

    const maxHistorySpeed = Math.max(...sparklineHistory);
    const maxSpeed = Math.max(speedValue ?? 0, maxHistorySpeed, 1);
    const sparklineHeight = SPARKLINE_HEIGHT - 1;
    const path = buildSplinePath(
        sparklineHistory,
        SPARKLINE_WIDTH,
        sparklineHeight,
        maxSpeed
    );

    return (
        <div className="flex items-center justify-end gap-2 min-w-0">
            <span
                className={cn(
                    "flex-shrink-0 text-right min-w-0",
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
                    "h-3 w-16 flex-none overflow-visible",
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

const statusMap: Record<
    Torrent["state"],
    {
        color: StatusColor;
        icon: typeof ArrowDown | typeof ArrowUp | typeof Pause;
        labelKey: string;
    }
> = {
    downloading: {
        color: "success",
        icon: ArrowDown,
        labelKey: "table.status_dl",
    },
    seeding: { color: "primary", icon: ArrowUp, labelKey: "table.status_seed" },
    paused: { color: "warning", icon: Pause, labelKey: "table.status_pause" },
    checking: {
        color: "warning",
        icon: Pause,
        labelKey: "torrent_modal.statuses.checking",
    },
    queued: { color: "warning", icon: Pause, labelKey: "table.status_queued" },
    error: {
        color: "danger",
        icon: Pause,
        labelKey: "torrent_modal.statuses.error",
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
        headerIcon: ListChecks,
        render: ({ torrent }) => (
            <div className="flex min-w-0 items-center h-full">
                <span
                    className={cn(
                        "font-medium truncate max-w-md transition-colors cap-height-text",
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
        headerIcon: Gauge,
        render: ({ torrent }) => {
            const displayProgress = getEffectiveProgress(torrent);
            return (
                <div className="flex flex-col gap-1.5 w-full min-w-0">
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
                        className="h-1"
                        trackClassName="h-1 bg-content1/20"
                        indicatorClassName={cn(
                            "h-full",
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
        headerIcon: PauseCircle,
        render: ({ torrent, t }) => {
            const conf = statusMap[torrent.state] ?? {
                color: "default",
                icon: Pause,
                labelKey: "torrent_modal.statuses.error",
            };
            const Icon = conf.icon;
            return (
                <div className="min-w-0">
                    <Chip
                        size="sm"
                        variant="flat"
                        color={conf.color}
                        startContent={
                            <Icon
                                size={TABLE_LAYOUT.iconSize}
                                strokeWidth={ICON_STROKE_WIDTH_DENSE}
                                className="text-current"
                            />
                        }
                        style={STATUS_CHIP_STYLE}
                        classNames={{
                            base: "h-5 px-2 inline-flex items-center whitespace-nowrap flex-nowrap",
                            content:
                                "font-bold text-[9px] uppercase tracking-wider leading-none whitespace-nowrap",
                        }}
                    >
                        <span className="truncate" title={t(conf.labelKey)}>
                            {t(conf.labelKey)}
                        </span>
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
        headerIcon: ArrowDownCircle,
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
        headerIcon: Clock3,
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
        headerIcon: ArrowUpCircle,
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
        headerIcon: Users,
        render: ({ torrent }) => (
            <div
                className={cn(
                    "flex items-center justify-end gap-1 text-foreground/60 min-w-0",
                    DENSE_NUMERIC
                )}
            >
                <Users
                    size={TABLE_LAYOUT.iconSize}
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
        headerIcon: Box,
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
        headerIcon: Scale,
        render: ({ torrent }) => (
            <span className={cn("text-foreground/60 min-w-0", DENSE_NUMERIC)}>
                {ratioValue(torrent).toFixed(2)}
            </span>
        ),
    },
    hash: {
        id: "hash",
        labelKey: "table.header_hash",
        width: 160,
        sortable: true,
        rpcField: "hash",
        descriptionKey: "table.column_desc_hash",
        headerIcon: Hash,
        sortAccessor: (torrent) => torrent.hash,
        render: ({ torrent }) => (
            <span
                className={cn(
                    "text-foreground/50 tracking-tight min-w-0",
                    DENSE_NUMERIC
                )}
            >
                {torrent.hash.slice(0, 10)}
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
        headerIcon: CalendarClock,
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
    "hash",
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
