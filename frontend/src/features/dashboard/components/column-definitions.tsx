import { Button, Checkbox, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Progress, cn } from "@heroui/react";
import { ArrowDown, ArrowUp, CheckCircle2, MoreVertical, Pause, PauseCircle, PlayCircle, Trash2, Users } from "lucide-react";
import { type TFunction } from "i18next";
import { formatBytes, formatDate, formatSpeed, formatTime } from "../../../shared/utils/format";
import type { Torrent } from "../types/torrent";
import type { ReactNode } from "react";

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
  | "added"
  | "actions";

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
}

type StatusColor = "success" | "default" | "primary" | "secondary" | "warning" | "danger";

const ratioValue = (torrent: Torrent) => {
  if (typeof torrent.ratio === "number") return torrent.ratio;
  if (torrent.downloaded > 0) return torrent.uploaded / torrent.downloaded;
  return torrent.uploaded === 0 ? 0 : torrent.uploaded;
};

const statusMap: Record<Torrent["state"], { color: StatusColor; icon: typeof ArrowDown | typeof ArrowUp | typeof Pause; labelKey: string }> = {
  downloading: { color: "success", icon: ArrowDown, labelKey: "table.status_dl" },
  seeding: { color: "primary", icon: ArrowUp, labelKey: "table.status_seed" },
  paused: { color: "warning", icon: Pause, labelKey: "table.status_pause" },
  checking: { color: "warning", icon: Pause, labelKey: "torrent_modal.statuses.status_checking" },
  queued: { color: "warning", icon: Pause, labelKey: "table.status_queued" },
  error: { color: "danger", icon: Pause, labelKey: "torrent_modal.statuses.status_error" },
};

export const COLUMN_DEFINITIONS: Record<ColumnId, ColumnDefinition> = {
  selection: {
    id: "selection",
    width: 40,
    align: "center",
    labelKey: "table.column_selection",
    isRequired: true,
    render: ({ isSelected, toggleSelection }) => (
      <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
        <Checkbox isSelected={isSelected} onValueChange={toggleSelection} classNames={{ wrapper: "m-0" }} />
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
    render: ({ torrent, t }) => (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={cn("font-medium text-sm truncate max-w-md transition-colors", torrent.state === "paused" && "text-foreground/50")}>
          {torrent.name}
        </span>
        {torrent.state === "downloading" && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-foreground/50 tracking-tight">
            <span className="text-success">{formatSpeed(torrent.speed.down)}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-foreground/30" />
            <span>{t("table.eta", { time: formatTime(torrent.eta) })}</span>
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
    render: ({ torrent }) => (
      <div className="flex flex-col gap-1.5 w-full min-w-0">
        <div className="flex justify-between items-end text-[10px] font-mono font-medium opacity-80 tabular-nums">
          <span>{(torrent.progress * 100).toFixed(1)}%</span>
          <span className="text-foreground/40">{formatBytes(torrent.totalSize * torrent.progress)}</span>
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
    render: ({ torrent, t }) => {
      const conf = statusMap[torrent.state] ?? { color: "default", icon: Pause, labelKey: "torrent_modal.statuses.status_error" };
      const Icon = conf.icon;
      return (
        <div className="min-w-0">
          <Chip
            size="sm"
            variant="flat"
            color={conf.color}
            startContent={<Icon size={10} />}
            classNames={{
              base: "h-5 px-2",
              content: "font-bold text-[9px] uppercase tracking-wider",
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
    sortAccessor: (torrent) => (torrent.queuePosition ?? Number.MAX_SAFE_INTEGER),
    render: ({ torrent }) => (
      <span className="font-mono text-xs text-foreground/60 tabular-nums min-w-0">
        {torrent.queuePosition !== undefined ? torrent.queuePosition : "-"}
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
    sortAccessor: (torrent) => (torrent.eta < 0 ? Number.MAX_SAFE_INTEGER : torrent.eta),
    render: ({ torrent, t }) => (
      <span className="text-xs font-mono text-foreground/70 tabular-nums min-w-0">
        {torrent.eta < 0 ? t("table.eta_unknown") : formatTime(torrent.eta)}
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
    sortAccessor: (torrent) => (torrent.state === "seeding" ? torrent.speed.up : torrent.speed.down),
    render: ({ torrent }) => (
      <div className="font-mono text-xs tabular-nums text-right min-w-0">
        {torrent.state === "downloading" ? (
          <span className="text-success font-medium">{formatSpeed(torrent.speed.down)}</span>
        ) : torrent.state === "seeding" ? (
          <span className="text-primary font-medium">{formatSpeed(torrent.speed.up)}</span>
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
    render: ({ torrent }) => (
      <div className="flex items-center justify-end gap-1 font-mono text-xs text-foreground/60 tabular-nums min-w-0">
        <Users size={12} className="opacity-50" />
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
    render: ({ torrent }) => <span className="font-mono text-xs text-foreground/50 tabular-nums min-w-0">{formatBytes(torrent.totalSize)}</span>,
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
    render: ({ torrent }) => <span className="font-mono text-xs text-foreground/60 tabular-nums min-w-0">{ratioValue(torrent).toFixed(2)}</span>,
  },
  hash: {
    id: "hash",
    labelKey: "table.header_hash",
    width: 160,
    sortable: false,
    rpcField: "hash",
    descriptionKey: "table.column_desc_hash",
    render: ({ torrent }) => <span className="text-xs font-mono text-foreground/50 tracking-tight min-w-0">{torrent.hash.slice(0, 10)}</span>,
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
    render: ({ torrent }) => <span className="text-xs font-mono text-foreground/50 min-w-0">{formatDate(torrent.added)}</span>,
  },
  actions: {
    id: "actions",
    width: 50,
    align: "end",
    labelKey: "table.column_actions",
    isRequired: true,
    render: ({ t }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              radius="full"
              className="text-foreground/30 hover:text-foreground min-w-0"
              aria-label={t("table.column_actions")}
              title={t("table.column_actions")}
            >
              <MoreVertical size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Actions" variant="faded">
            <DropdownItem key="pause" startContent={<PauseCircle size={14} />}>
              {t("table.actions.pause")}
            </DropdownItem>
            <DropdownItem key="resume" startContent={<PlayCircle size={14} />}>
              {t("table.actions.resume")}
            </DropdownItem>
            <DropdownItem key="recheck" showDivider startContent={<CheckCircle2 size={14} />}>
              {t("table.actions.recheck")}
            </DropdownItem>
            <DropdownItem key="delete" className="text-danger" color="danger" startContent={<Trash2 size={14} />}>
              {t("table.actions.remove")}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
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
  "actions",
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
  "actions",
];

export const REQUIRED_COLUMN_IDS: ColumnId[] = ["selection", "actions"];

export const ALL_COLUMN_IDS: ColumnId[] = Object.keys(COLUMN_DEFINITIONS) as ColumnId[];
