import { Chip } from "@heroui/react";
import type { Table } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";
import { type TFunction } from "i18next";
import type { TorrentStatus } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import { getTorrentStatusPresentation } from "@/modules/dashboard/utils/torrentStatus";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import { ArrowDown, ArrowUp, Bug, WifiOff, ListStart, Pause, RefreshCw, FolderSync } from "lucide-react";
const { visuals } = registry;

type StatusColor = "success" | "default" | "primary" | "secondary" | "warning" | "danger";

type StatusMeta = {
    color: StatusColor;
    icon: LucideIcon;
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

const statusMap: Record<TorrentStatus, StatusMeta> = {
    [status.torrent.downloading]: {
        color: "success",
        icon: ArrowDown,
    },
    [status.torrent.seeding]: {
        color: "primary",
        icon: ArrowUp,
    },
    [status.torrent.paused]: {
        color: "warning",
        icon: Pause,
    },
    [status.torrent.checking]: {
        color: "warning",
        icon: RefreshCw,
    },
    [status.torrent.queued]: {
        color: "secondary",
        icon: ListStart,
    },
    [status.torrent.stalled]: {
        color: "secondary",
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
    const renderChip = (icon: LucideIcon, color: StatusColor, label: string, tooltip: string) => {
        return (
            <div className={FORM_CONTROL.statusChipContainer}>
                <Chip
                    size="md"
                    variant="flat"
                    color={color}
                    style={STATUS_CHIP_STYLE}
                    classNames={FORM_CONTROL.statusChipClassNames}
                >
                    <div className={FORM_CONTROL.statusChipContent}>
                        <StatusIcon
                            Icon={icon}
                            size="md"
                            strokeWidth={visuals.icon.strokeWidthDense}
                            className={FORM_CONTROL.statusChipCurrentIcon}
                        />
                        <span className={FORM_CONTROL.statusChipLabel} title={tooltip}>
                            {label}
                        </span>
                    </div>
                </Chip>
            </div>
        );
    };

    const meta = table?.options.meta as StatusTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];
    const sanitizedHistory = rawHistory.filter(
        (value): value is number => Number.isFinite(value),
    );
    const speedHistory =
        torrent.state === status.torrent.seeding
            ? { down: [], up: sanitizedHistory }
            : { down: sanitizedHistory, up: [] };
    const presentation = getTorrentStatusPresentation(
        torrent,
        t,
        optimisticStatus,
        speedHistory,
    );

    if (presentation.isOptimisticMoving && presentation.label) {
        return renderChip(
            FolderSync,
            "primary",
            presentation.label,
            presentation.tooltip ?? presentation.label,
        );
    }

    const label = presentation.label ?? t("table.status_error");
    const tooltip = presentation.tooltip ?? label;
    const conf =
        (presentation.visualState
            ? statusMap[presentation.visualState]
            : undefined) ?? UNKNOWN_STATUS_META;
    const Icon = conf.icon;

    return renderChip(Icon, conf.color, label, tooltip);
}



