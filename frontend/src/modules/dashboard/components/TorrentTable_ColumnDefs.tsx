/* eslint-disable react-refresh/only-export-components */
// FILE: src/modules/dashboard/components/ColumnDefinitions.tsx

import { Tooltip, cn } from "@heroui/react";
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
} from "lucide-react";

import { status } from "@/shared/status";
import { type TFunction } from "i18next";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { type ReactNode, type RefObject } from "react";
import { registry } from "@/config/logic";
import { formatBytes, formatDate, formatRelativeTime } from "@/shared/utils/format";
import type { Table } from "@tanstack/react-table";
import type { OptimisticStatusEntry, OptimisticStatusMap } from "@/modules/dashboard/types/contracts";
import { getTorrentEtaSortValue, getTorrentEtaTableDisplay } from "@/modules/dashboard/components/TorrentEtaDisplay";
import { TorrentTable_SpeedCell } from "@/modules/dashboard/components/TorrentTable_SpeedColumnCell";
import { TorrentTable_StatusCell } from "@/modules/dashboard/components/TorrentTable_StatusColumnCell";
import { getEffectiveProgress, TorrentProgressDisplay } from "@/modules/dashboard/components/TorrentProgressDisplay";
import { SURFACE, TABLE } from "@/shared/ui/layout/glass-surface";
import { torrentHeadlineFields } from "@/modules/dashboard/utils/torrentHeadlineFields";
const { layout } = registry;

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
    optimisticStatus?: OptimisticStatusEntry;
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

export const ratioValue = (torrent: Torrent) => {
    if (typeof torrent.ratio === "number") return torrent.ratio;
    if (torrent.downloaded > 0) return torrent.uploaded / torrent.downloaded;
    return torrent.uploaded === 0 ? 0 : torrent.uploaded;
};

const DENSE_TEXT = `${layout.table.fontSize} ${layout.table.fontMono} leading-none cap-height-text`;
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

export const formatQueueOrdinal = (queuePosition?: number) => {
    if (queuePosition === undefined || queuePosition === null) {
        return "-";
    }
    const displayValue = queuePosition + 1;
    return `${displayValue}${getOrdinalSuffix(displayValue)}`;
};

const renderTooltipLines = (lines: string[]) => (
    <div>
        {lines.map((line) => (
            <div key={line}>{line}</div>
        ))}
    </div>
);

export const TORRENTTABLE_COLUMN_DEFS: Record<ColumnId, ColumnDefinition> = {
    name: {
        id: "name",
        labelKey: torrentHeadlineFields.name.tableLabelKey,
        minSize: 90,
        sortable: true,
        rpcField: "name",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.name,
        headerIcon: FileText,
        render: ({ torrent }) => (
            <div className={TABLE.columnDefs.nameCell}>
                <span
                    title={torrent.errorString ? torrent.errorString : undefined}
                    className={cn(
                        TABLE.columnDefs.nameLabel,
                        layout.table.fontSize,
                        torrent.state === status.torrent.paused && TABLE.columnDefs.nameLabelPaused,
                    )}
                >
                    {torrent.name}
                </span>
            </div>
        ),
    },

    progress: {
        id: "progress",
        labelKey: torrentHeadlineFields.progress.tableLabelKey,
        width: 220,
        minSize: 110,
        sortable: true,
        rpcField: "progress",
        defaultVisible: true,
        sortAccessor: getEffectiveProgress,
        headerIcon: Percent,
        render: ({ torrent, optimisticStatus }) => (
            <TorrentProgressDisplay torrent={torrent} optimisticStatus={optimisticStatus} />
        ),
    },

    status: {
        id: "status",
        labelKey: torrentHeadlineFields.status.tableLabelKey,
        width: 110,
        minSize: 95,
        sortable: true,
        rpcField: "state",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.state,
        headerIcon: Activity,
        render: ({ torrent, t, optimisticStatus, table }) => (
            <TorrentTable_StatusCell
                torrent={torrent}
                table={table}
                t={t}
                optimisticStatus={optimisticStatus}
            />
        ),
    },

    queue: {
        id: "queue",
        labelKey: torrentHeadlineFields.queue.tableLabelKey,
        width: 80,
        align: "center",
        sortable: true,
        rpcField: "queuePosition",
        descriptionKey: "table.column_desc_queue",
        sortAccessor: (torrent) => torrent.queuePosition ?? Number.MAX_SAFE_INTEGER,
        headerIcon: ListOrdered,
        render: ({ torrent }) => (
            <span className={cn(TABLE.columnDefs.numericMuted, DENSE_NUMERIC)}>
                {formatQueueOrdinal(torrent.queuePosition)}
            </span>
        ),
    },

    eta: {
        id: "eta",
        labelKey: torrentHeadlineFields.eta.tableLabelKey,
        width: 110,
        sortable: true,
        rpcField: "eta",
        descriptionKey: "table.column_desc_eta",
        sortAccessor: getTorrentEtaSortValue,
        headerIcon: Timer,
        render: ({ torrent, t }) => {
            const eta = getTorrentEtaTableDisplay(torrent, t);
            return (
                <span className={cn(TABLE.columnDefs.numericSoft, DENSE_NUMERIC)} title={eta.tooltip}>
                    {eta.value}
                </span>
            );
        },
    },

    speed: {
        id: "speed",
        labelKey: torrentHeadlineFields.speed.tableLabelKey,
        width: 180,
        minSize: 160,
        align: "end",
        sortable: true,
        defaultVisible: true,
        descriptionKey: "table.column_desc_speed",
        sortAccessor: (torrent) => (torrent.state === status.torrent.seeding ? torrent.speed.up : torrent.speed.down),
        headerIcon: Gauge,
        render: ({ torrent, table }) => <TorrentTable_SpeedCell torrent={torrent} table={table} />,
    },

    peers: {
        id: "peers",
        labelKey: torrentHeadlineFields.peers.tableLabelKey,
        width: 88,
        align: "end",
        sortable: true,
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.peerSummary.connected,
        headerIcon: Network,
        render: ({ torrent, t }) => {
            const tooltipLines = [
                t("table.peers_tooltip_connected", {
                    connected: torrent.peerSummary.connected,
                }),
                t("table.peers_tooltip_downloading", {
                    downloading: torrent.peerSummary.getting ?? 0,
                }),
                t("table.peers_tooltip_uploading", {
                    uploading: torrent.peerSummary.sending ?? 0,
                }),
                ...(typeof torrent.peerSummary.seeds === "number"
                    ? [
                          t("table.peers_tooltip_connected_seeds", {
                              seeds: torrent.peerSummary.seeds,
                          }),
                      ]
                    : []),
            ];

            return (
                <Tooltip
                    content={renderTooltipLines(tooltipLines)}
                    classNames={SURFACE.tooltip}
                    delay={500}
                >
                    <span className={cn(TABLE.columnDefs.numericMuted, DENSE_NUMERIC)}>
                        {torrent.peerSummary.connected}
                    </span>
                </Tooltip>
            );
        },
    },

    size: {
        id: "size",
        labelKey: torrentHeadlineFields.size.tableLabelKey,
        width: 100,
        align: "end",
        sortable: true,
        rpcField: "totalSize",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.totalSize,
        headerIcon: HardDrive,
        render: ({ torrent }) => (
            <span className={cn(TABLE.columnDefs.numericDim, DENSE_NUMERIC)}>{formatBytes(torrent.totalSize)}</span>
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
            <span className={cn(TABLE.columnDefs.numericMuted, DENSE_NUMERIC)}>{ratioValue(torrent).toFixed(2)}</span>
        ),
    },

    added: {
        id: "added",
        labelKey: torrentHeadlineFields.added.tableLabelKey,
        width: 100,
        align: "end",
        sortable: true,
        rpcField: "added",
        descriptionKey: "table.column_desc_added",
        sortAccessor: (torrent) => torrent.added,
        headerIcon: Clock,
        render: ({ torrent }) => (
            <span className={cn(TABLE.columnDefs.numericDim, DENSE_NUMERIC)} title={formatDate(torrent.added)}>
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

export const DEFAULT_VISIBLE_COLUMN_IDS: ColumnId[] = ["name", "progress", "status", "queue", "speed", "peers", "size"];

export const ALL_COLUMN_IDS: ColumnId[] = Object.keys(TORRENTTABLE_COLUMN_DEFS) as ColumnId[];
