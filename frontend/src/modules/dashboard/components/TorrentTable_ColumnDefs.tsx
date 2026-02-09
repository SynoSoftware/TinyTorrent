/* eslint-disable react-refresh/only-export-components */
// FILE: src/modules/dashboard/components/ColumnDefinitions.tsx

import { cn } from "@heroui/react";
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
    Users,
} from "lucide-react";

import STATUS from "@/shared/status";
import { type TFunction } from "i18next";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { type ReactNode, type RefObject } from "react";
import { TABLE_LAYOUT, ICON_STROKE_WIDTH_DENSE } from "@/config/logic";
import { SmoothProgressBar } from "@/shared/ui/components/SmoothProgressBar";
import {
    formatBytes,
    formatDate,
    formatEtaAbsolute,
    formatRelativeTime,
    formatTime,
} from "@/shared/utils/format";
import type { Table } from "@tanstack/react-table";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/optimistic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { TorrentTable_SpeedCell } from "@/modules/dashboard/components/TorrentTable_SpeedColumnCell";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";

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

const ratioValue = (torrent: Torrent) => {
    if (typeof torrent.ratio === "number") return torrent.ratio;
    if (torrent.downloaded > 0) return torrent.uploaded / torrent.downloaded;
    return torrent.uploaded === 0 ? 0 : torrent.uploaded;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const getEffectiveProgress = (torrent: Torrent) => {
    const normalizedProgress = clamp01(
        torrent.progress ?? torrent.verificationProgress ?? 0,
    );
    if (torrent.state === STATUS.torrent.MISSING_FILES) {
        return 0;
    }

    if (torrent.state === STATUS.torrent.CHECKING) {
        return clamp01(torrent.verificationProgress ?? normalizedProgress);
    }

    return normalizedProgress;
};

const DENSE_TEXT = `${TABLE_LAYOUT.fontSize} ${TABLE_LAYOUT.fontMono} leading-none cap-height-text`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;

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
                            "text-foreground/50",
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
                            DENSE_NUMERIC,
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
                                  : "bg-gradient-to-r from-success/50 to-success",
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
        render: ({ torrent, t }) => (
            <TorrentTable_StatusCell torrent={torrent} t={t} />
        ),
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
            const isChecking = torrent.state === STATUS.torrent.CHECKING;
            if (isChecking) {
                return (
                    <span
                        className={cn(
                            "text-foreground/70 min-w-0",
                            DENSE_NUMERIC,
                        )}
                        title={t("labels.status.torrent.checking")}
                    >
                        -
                    </span>
                );
            }
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
        render: ({ torrent, table }) => (
            <TorrentTable_SpeedCell torrent={torrent} table={table} />
        ),
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
                    DENSE_NUMERIC,
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
    TORRENTTABLE_COLUMN_DEFS,
) as ColumnId[];
