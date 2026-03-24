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
import {
    deriveTorrentDisplayHealth,
    type TorrentHealthState,
} from "@/modules/dashboard/utils/torrentSwarm";
import type { DashboardTableMeta } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import {
    ArrowDown,
    AlertTriangle,
    ArrowUp,
    Bug,
    CheckCircle2,
    CircleOff,
    FolderSync,
    ListStart,
    Loader,
    Pause,
    RefreshCw,
    Search,
    WifiOff,
    type LucideIcon,
} from "lucide-react";
const { visuals } = registry;

type StatusColor = "success" | "default" | "primary" | "secondary" | "warning" | "danger";
type TorrentPresentationVisualState = TorrentStatus | "connecting";
type AvailabilityMeta = {
    icon: LucideIcon;
    summaryKey: string;
    detailKey?: string;
};

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

const AVAILABILITY_META: Record<TorrentHealthState, AvailabilityMeta> = {
    healthy: {
        icon: CheckCircle2,
        summaryKey: "table.status_tooltip.availability.fully_available",
    },
    degraded: {
        icon: AlertTriangle,
        summaryKey: "table.status_tooltip.availability.degraded",
        detailKey: "table.status_tooltip.detail.degraded",
    },
    unavailable: {
        icon: CircleOff,
        summaryKey: "table.status_tooltip.availability.unavailable",
        detailKey: "table.status_tooltip.detail.unavailable",
    },
    finding_peers: {
        icon: Search,
        summaryKey: "table.status_tooltip.availability.finding_peers",
        detailKey: "table.status_tooltip.detail.finding_peers",
    },
    metadata: {
        icon: Search,
        summaryKey: "table.status_tooltip.availability.metadata",
        detailKey: "table.status_tooltip.detail.metadata",
    },
    error: {
        icon: Bug,
        summaryKey: "table.status_tooltip.availability.error",
        detailKey: "table.status_tooltip.detail.error",
    },
};

const STATUS_CHIP_STYLE = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "calc(var(--tt-h-row) - (var(--spacing-tight) * 2))",
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

const formatStatusTooltip = ({
    primary,
    secondary,
    detail,
}: {
    primary: string;
    secondary: string;
    detail: string | null;
}) => [primary, secondary, ...(detail ? ["", detail] : [])].join("\n");

const getStatusTooltip = ({
    torrent,
    presentation,
    statusLabel,
    healthState,
    t,
}: {
    torrent: Torrent;
    presentation: ReturnType<typeof getTorrentStatusPresentation>;
    statusLabel: string;
    healthState: TorrentHealthState;
    t: TFunction;
}) => {
    const availability = AVAILABILITY_META[healthState];
    const secondary = presentation.isOptimisticMoving
        ? t("table.status_tooltip.availability.moving")
        : t(availability.summaryKey);
    let detail: string | null = availability.detailKey
        ? t(availability.detailKey)
        : null;

    if (presentation.isOptimisticMoving) {
        detail = t("table.status_tooltip.detail.moving");
    } else if (presentation.startupGrace) {
        detail = t("table.status_tooltip.detail.connecting");
    } else if (presentation.visualState === status.torrent.stalled) {
        detail =
            torrent.peerSummary.connected > 0
                ? t("table.status_tooltip.detail.stalled_connected")
                : t("table.status_tooltip.detail.stalled_disconnected");
    } else if (presentation.isIdleSeeding) {
        detail =
            torrent.peerSummary.connected > 0
                ? t("table.status_tooltip.detail.idle_seeding_connected")
                : t("table.status_tooltip.detail.idle_seeding_disconnected");
    } else if (
        presentation.transportState === status.torrent.error &&
        torrent.errorString?.trim()
    ) {
        detail = torrent.errorString;
    }

    return formatStatusTooltip({
        primary: statusLabel,
        secondary,
        detail,
    });
};

interface TorrentTableStatusColumnCellProps {
    torrent: Torrent;
    table?: Table<Torrent>;
    t: TFunction;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentTable_StatusCell({ torrent, table, t, optimisticStatus }: TorrentTableStatusColumnCellProps) {
    const renderChip = (
        icon: LucideIcon,
        color: StatusColor,
        label: string,
        tooltip: string,
        classNames?: StatusMeta["classNames"],
        trailingIcon?: {
            icon: LucideIcon;
            className?: string;
        },
    ) => {
        return (
            <AppTooltip content={tooltip} dense placement="top" native>
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
                        {trailingIcon ? (
                            <StatusIcon
                                Icon={trailingIcon.icon}
                                size="sm"
                                strokeWidth={visuals.icon.strokeWidthDense}
                                className={trailingIcon.className}
                            />
                        ) : null}
                    </div>
                </Chip>
            </AppTooltip>
        );
    };

    const meta = table?.options?.meta as DashboardTableMeta | undefined;
    const rawHistory = meta?.speedHistoryRef?.current?.[torrent.id] ?? [];
    const speedHistory = getStatusSpeedHistory(torrent, rawHistory);
    const presentation = getTorrentStatusPresentation(torrent, t, optimisticStatus, speedHistory);
    const healthState = deriveTorrentDisplayHealth(
        torrent,
        optimisticStatus,
        speedHistory,
    ).healthState;
    const availabilityMeta = AVAILABILITY_META[healthState];
    const healthIconClassName = cn(
        FORM_CONTROL.statusChipWarningIcon,
        visuals.status.chip.healthTone[healthState],
    );

    if (presentation.isOptimisticMoving && presentation.label) {
        return renderChip(
            FolderSync,
            "primary",
            presentation.label,
            getStatusTooltip({
                torrent,
                presentation,
                statusLabel: presentation.label,
                healthState,
                t,
            }),
            undefined,
            {
                icon: availabilityMeta.icon,
                className: healthIconClassName,
            },
        );
    }

    const label = presentation.label ?? t("table.status_error");
    const tooltip = getStatusTooltip({
        torrent,
        presentation,
        statusLabel: label,
        healthState,
        t,
    });
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
    return renderChip(
        Icon,
        conf.color,
        label,
        tooltip,
        conf.classNames,
        {
            icon: availabilityMeta.icon,
            className: healthIconClassName,
        },
    );
}
