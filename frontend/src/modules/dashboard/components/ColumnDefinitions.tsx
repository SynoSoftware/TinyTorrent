import {
    Button,
    Checkbox,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Progress,
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
    formatSpeed,
    formatTime,
} from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";
import type { ReactNode } from "react";
import { TABLE_LAYOUT } from "../config/layout";
import { GLASS_MENU_SURFACE } from "../../../shared/ui/layout/glass-surface";

export type ColumnId =
    | "selection"
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

export interface ColumnRendererProps {
    torrent: Torrent;
    t: TFunction;
    isSelected: boolean;
    toggleSelection: (value?: unknown) => void;
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

const DENSE_TEXT = `${TABLE_LAYOUT.fontSize} ${TABLE_LAYOUT.fontMono} leading-tight`;
const DENSE_NUMERIC = `${DENSE_TEXT} tabular-nums`;

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
    selection: {
        id: "selection",
        width: 40,
        align: "center",
        labelKey: "table.column_selection",
        isRequired: true,
        render: ({ isSelected, toggleSelection }) => (
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex justify-center"
            >
                <Checkbox
                    isSelected={isSelected}
                    onValueChange={toggleSelection}
                    classNames={{ wrapper: "m-0" }}
                />
            </div>
        ),
    },
    name: {
        id: "name",
        labelKey: "table.header_name",
        minSize: 90,
        sortable: true,
        rpcField: "name",
        defaultVisible: true,
        sortAccessor: (torrent) => torrent.name,
        headerIcon: ListChecks,
        render: ({ torrent, t }) => (
            <div className="flex flex-col gap-0.5 min-w-0">
                <span
                    className={cn(
                        "font-medium truncate max-w-md transition-colors",
                        TABLE_LAYOUT.fontSize,
                        torrent.state === "paused" && "text-foreground/50"
                    )}
                >
                    {torrent.name}
                </span>
                {torrent.state === "downloading" && (
                    <div
                        className={cn(
                            "flex items-center gap-2 tracking-tight text-foreground/50",
                            DENSE_TEXT
                        )}
                    >
                        <span className="text-success">
                            {formatSpeed(torrent.speed.down)}
                        </span>
                        <span className="w-0.5 h-0.5 rounded-full bg-foreground/30" />
                        <span>
                            {t("table.eta", { time: formatTime(torrent.eta) })}
                        </span>
                    </div>
                )}
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
        sortAccessor: (torrent) => torrent.progress,
        headerIcon: Gauge,
        render: ({ torrent }) => (
            <div className="flex flex-col gap-1.5 w-full min-w-0">
                <div
                    className={cn(
                        "flex justify-between items-end font-medium opacity-80",
                        DENSE_NUMERIC
                    )}
                >
                    <span>{(torrent.progress * 100).toFixed(1)}%</span>
                    <span className="text-foreground/40">
                        {formatBytes(torrent.totalSize * torrent.progress)}
                    </span>
                </div>
                <Progress
                    size="sm"
                    radius="full"
                    value={torrent.progress * 100}
                    classNames={{
                        track: "h-1 bg-content1/20",
                        indicator: cn(
                            "h-1",
                            torrent.state === "paused"
                                ? "bg-gradient-to-r from-warning/50 to-warning"
                                : torrent.state === "seeding"
                                ? "bg-gradient-to-r from-primary/50 to-primary"
                                : "bg-gradient-to-r from-success/50 to-success"
                        ),
                    }}
                />
            </div>
        ),
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
                        startContent={<Icon size={TABLE_LAYOUT.iconSize} />}
                        classNames={{
                            base: "h-5 px-2",
                            content:
                                "font-bold text-[9px] uppercase tracking-wider",
                        }}
                    >
                        {t(conf.labelKey)}
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
                {torrent.queuePosition !== undefined
                    ? torrent.queuePosition
                    : "-"}
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
        render: ({ torrent, t }) => (
            <span className={cn("text-foreground/70 min-w-0", DENSE_NUMERIC)}>
                {torrent.eta < 0
                    ? t("table.eta_unknown")
                    : formatTime(torrent.eta)}
            </span>
        ),
    },
    speed: {
        id: "speed",
        labelKey: "table.header_speed",
        width: 120,
        align: "end",
        sortable: true,
        defaultVisible: true,
        descriptionKey: "table.column_desc_speed",
        sortAccessor: (torrent) =>
            torrent.state === "seeding" ? torrent.speed.up : torrent.speed.down,
        headerIcon: ArrowUpCircle,
        render: ({ torrent }) => (
            <div className={cn("text-right min-w-0", DENSE_NUMERIC)}>
                {torrent.state === "downloading" ? (
                    <span className="text-success font-medium">
                        {formatSpeed(torrent.speed.down)}
                    </span>
                ) : torrent.state === "seeding" ? (
                    <span className="text-primary font-medium">
                        {formatSpeed(torrent.speed.up)}
                    </span>
                ) : (
                    <span className="text-foreground/30">-</span>
                )}
            </div>
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
        headerIcon: Users,
        render: ({ torrent }) => (
            <div
                className={cn(
                    "flex items-center justify-end gap-1 text-foreground/60 min-w-0",
                    DENSE_NUMERIC
                )}
            >
                <Users size={TABLE_LAYOUT.iconSize} className="opacity-50" />
                <span>{torrent.peerSummary.connected}</span>
                <span className="opacity-30">/</span>
                <span className="opacity-50">{torrent.peerSummary.seeds}</span>
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
        sortable: false,
        rpcField: "hash",
        descriptionKey: "table.column_desc_hash",
        headerIcon: Hash,
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
            <span className={cn("text-foreground/50 min-w-0", DENSE_NUMERIC)}>
                {formatDate(torrent.added)}
            </span>
        ),
    },
};

export const DEFAULT_COLUMN_ORDER: ColumnId[] = [
    "selection",
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
    "selection",
    "name",
    "progress",
    "status",
    "queue",
    "speed",
    "peers",
    "size",
];

export const REQUIRED_COLUMN_IDS: ColumnId[] = ["selection"];

export const ALL_COLUMN_IDS: ColumnId[] = Object.keys(
    COLUMN_DEFINITIONS
) as ColumnId[];
