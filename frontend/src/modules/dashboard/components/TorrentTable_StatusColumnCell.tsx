import { Chip } from "@heroui/react";
import { type LucideIcon } from "lucide-react";
import { type TFunction } from "i18next";
import type { TorrentStatus } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/contracts";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import { ArrowDown, ArrowUp, Bug, WifiOff, ListStart, Pause, RefreshCw, FolderSync } from "lucide-react";
const { layout, visuals, ui } = registry;

type StatusColor = "success" | "default" | "primary" | "secondary" | "warning" | "danger";

type StatusMeta = {
    color: StatusColor;
    icon: LucideIcon;
    labelKey: string;
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
        labelKey: "table.status_dl",
    },
    [status.torrent.seeding]: {
        color: "primary",
        icon: ArrowUp,
        labelKey: "table.status_seed",
    },
    [status.torrent.paused]: {
        color: "warning",
        icon: Pause,
        labelKey: "table.status_pause",
    },
    [status.torrent.checking]: {
        color: "warning",
        icon: RefreshCw,
        labelKey: "table.status_checking",
    },
    [status.torrent.queued]: {
        color: "secondary",
        icon: ListStart,
        labelKey: "table.status_queued",
    },
    [status.torrent.stalled]: {
        color: "secondary",
        icon: WifiOff,
        labelKey: "table.status_stalled",
    },
    [status.torrent.error]: {
        color: "danger",
        icon: Bug,
        labelKey: "table.status_error",
    },
};

interface TorrentTableStatusColumnCellProps {
    torrent: Torrent;
    t: TFunction;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentTable_StatusCell({ torrent, t, optimisticStatus }: TorrentTableStatusColumnCellProps) {
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

    const isMoving = optimisticStatus?.operation === "moving";
    if (isMoving) {
        const label = t("table.status_moving");
        return renderChip(FolderSync, "primary", label, label);
    }

    const conf = statusMap[torrent.state] ?? statusMap[status.torrent.paused];
    const Icon = conf.icon;
    const label = t(conf.labelKey);
    const tooltip = torrent.errorString && torrent.errorString.trim().length > 0 ? torrent.errorString : label;

    return renderChip(Icon, conf.color, label, tooltip);
}



