import { Chip, cn } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { type TFunction } from "i18next";
import type { TorrentStatus } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import {
    getTorrentStatusPresentation,
    getStatusSpeedHistory,
} from "@/modules/dashboard/utils/torrentStatus";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import {
    ArrowDown,
    ArrowUp,
    Bug,
    FolderSync,
    ListStart,
    Loader,
    Pause,
    RefreshCw,
    WifiOff,
    type LucideIcon,
} from "lucide-react";
const { visuals } = registry;

type StatusColor = "success" | "default" | "primary" | "secondary" | "warning" | "danger";
type TorrentPresentationVisualState = TorrentStatus | "connecting";

type StatusMeta = {
    color: StatusColor;
    icon: LucideIcon;
    classNames?: {
        base?: string;
        content?: string;
    };
};

const UNKNOWN_STATUS_META: StatusMeta = {
    color: "danger",
    icon: Bug,
};

const STATUS_CHIP_STYLE = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
} as const;

const statusMap: Record<TorrentPresentationVisualState, StatusMeta> = {
    connecting: {
        color: "primary",
        icon: Loader,
    },
    [status.torrent.downloading]: {
        color: "success",
        icon: ArrowDown,
    },
    [status.torrent.seeding]: {
        color: "primary",
        icon: ArrowUp,
    },
    [status.torrent.paused]: {
        color: "default",
        icon: Pause,
    },
    [status.torrent.checking]: {
        color: "warning",
        icon: RefreshCw,
    },
    [status.torrent.queued]: {
        color: "default",
        icon: ListStart,
    },
    [status.torrent.stalled]: {
        color: "warning",
        icon: WifiOff,
    },
    [status.torrent.error]: {
        color: "danger",
        icon: Bug,
    },
};

interface TorrentTableStatusColumnCellProps {
    torrent: Torrent;
    table?: Table<Torrent>;
    t: TFunction;
    optimisticStatus?: OptimisticStatusEntry;
}

type StatusTableMeta = {
    speedHistoryRef?: { current: Record<string, Array<number | null>> };
};

export function TorrentTable_StatusCell({ torrent, table, t, optimisticStatus }: TorrentTableStatusColumnCellProps) {
    const renderChip = (
        icon: LucideIcon,
        color: StatusColor,
        label: string,
        tooltip: string,
        classNames?: StatusMeta["classNames"],
    ) => {
        return (
            <AppTooltip content={tooltip} dense placement="top">
                <Chip
                    size="md"
                    variant="flat"
                    color={color}
                    style={STATUS_CHIP_STYLE}
                    classNames={{
                        base: cn(
                            FORM_CONTROL.statusChipClassNames.base,
                            classNames?.base,
                        ),
                        content: cn(
                            FORM_CONTROL.statusChipClassNames.content,
                            classNames?.content,
                        ),
                    }}
                >
                    <div className={FORM_CONTROL.statusChipContent}>
                        <StatusIcon
                            Icon={icon}
                            size="md"
                            strokeWidth={visuals.icon.strokeWidthDense}
                            className={FORM_CONTROL.statusChipCurrentIcon}
                        />
                        <span className={FORM_CONTROL.statusChipLabel}>
                            {label}
                        </span>
                    </div>
                </Chip>
            </AppTooltip>
        );
    };

    const meta = table?.options?.meta as StatusTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];
    const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
    const presentation = getTorrentStatusPresentation(torrent, t, optimisticStatus, speedHistory);

    if (presentation.isOptimisticMoving && presentation.label) {
        return renderChip(FolderSync, "primary", presentation.label, presentation.tooltip ?? presentation.label);
    }

    const label = presentation.label ?? t("table.status_error");
    const tooltip = presentation.tooltip ?? label;
    const seedingIdleMeta: StatusMeta | null =
        presentation.isIdleSeeding
            ? {
                  color: "default",
                  icon: Loader,
                  classNames: FORM_CONTROL.statusChipMutedPrimaryClassNames,
              }
            : null;
    const conf =
        (seedingIdleMeta ??
            (presentation.visualState
              ? statusMap[presentation.visualState]
              : undefined)) ?? UNKNOWN_STATUS_META;
    const Icon = conf.icon;
    return (
        <div className={FORM_CONTROL.statusChipContainer}>
            {renderChip(Icon, conf.color, label, tooltip, conf.classNames)}
        </div>
    );
}
