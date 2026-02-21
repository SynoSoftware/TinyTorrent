import { Chip } from "@heroui/react";
import { type LucideIcon } from "lucide-react";
import { type TFunction } from "i18next";
import type { RecoveryState, TorrentStatus } from "@/services/rpc/entities";
import {
    formatRecoveryStatus,
    formatRecoveryStatusFromClassification,
    formatRecoveryTooltip,
} from "@/shared/utils/recoveryFormat";
import { ICON_STROKE_WIDTH_DENSE } from "@/config/logic";
import { STATUS } from "@/shared/status";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { OptimisticStatusEntry } from "@/modules/dashboard/types/optimistic";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { TorrentTable_MissingFilesStatusCell } from "@/modules/dashboard/components/TorrentTable_MissingFilesStatusCell";
import { FORM_CONTROL } from "@/shared/ui/layout/glass-surface";
import {
    ArrowDown,
    ArrowUp,
    Bug,
    WifiOff,
    FileWarning,
    ListStart,
    Pause,
    RefreshCw,
    CheckCircle,
    Hourglass,
    AlertCircle,
    Lock,
    Search,
} from "lucide-react";

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

const STATUS_CHIP_STYLE = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
} as const;

// Allow both canonical TorrentStatus keys and RecoveryState keys.
const statusMap: Record<TorrentStatus | RecoveryState, StatusMeta> = {
    [STATUS.torrent.DOWNLOADING]: {
        color: "success",
        icon: ArrowDown,
        labelKey: "table.status_dl",
    },
    [STATUS.torrent.SEEDING]: {
        color: "primary",
        icon: ArrowUp,
        labelKey: "table.status_seed",
    },
    [STATUS.torrent.PAUSED]: {
        color: "warning",
        icon: Pause,
        labelKey: "table.status_pause",
    },
    [STATUS.torrent.CHECKING]: {
        color: "warning",
        icon: RefreshCw,
        labelKey: "table.status_checking",
    },
    [STATUS.torrent.QUEUED]: {
        color: "secondary",
        icon: ListStart,
        labelKey: "table.status_queued",
    },
    [STATUS.torrent.STALLED]: {
        color: "secondary",
        icon: WifiOff,
        labelKey: "table.status_stalled",
    },
    [STATUS.torrent.ERROR]: {
        color: "danger",
        icon: Bug,
        labelKey: "table.status_error",
    },
    [STATUS.torrent.MISSING_FILES]: {
        color: "warning",
        icon: FileWarning,
        labelKey: "table.status_missing_files",
    },
    ok: {
        color: "success",
        icon: CheckCircle,
        labelKey: "recovery.status.ok",
    },
    transientWaiting: {
        color: "secondary",
        icon: Hourglass,
        labelKey: "recovery.status.transientWaiting",
    },
    needsUserAction: {
        color: "warning",
        icon: AlertCircle,
        labelKey: "recovery.status.needsUserAction",
    },
    needsUserConfirmation: {
        color: "warning",
        icon: AlertCircle,
        labelKey: "recovery.status.needsUserConfirmation",
    },
    blocked: {
        color: "danger",
        icon: Lock,
        labelKey: "recovery.status.blocked",
    },
    verifying: {
        color: "warning",
        icon: Search,
        labelKey: "recovery.status.verifying",
    },
};

const RELOCATING_STATUS_META: StatusMeta = {
    color: "secondary",
    icon: Hourglass,
    labelKey: "table.status_relocating",
};

interface TorrentTableStatusColumnCellProps {
    torrent: Torrent;
    t: TFunction;
    optimisticStatus?: OptimisticStatusEntry;
}

export function TorrentTable_StatusCell({
    torrent,
    t,
    optimisticStatus,
}: TorrentTableStatusColumnCellProps) {
    const classification = useResolvedRecoveryClassification(torrent);

    if (optimisticStatus?.operation === STATUS.torrentOperation.RELOCATING) {
        const Icon = RELOCATING_STATUS_META.icon;
        const tooltip = t(RELOCATING_STATUS_META.labelKey);
        return (
            <div className={FORM_CONTROL.statusChipContainer}>
                <Chip
                    size="md"
                    variant="flat"
                    color={RELOCATING_STATUS_META.color}
                    style={STATUS_CHIP_STYLE}
                    classNames={FORM_CONTROL.statusChipClassNames}
                >
                    <div className={FORM_CONTROL.statusChipContent}>
                        <StatusIcon
                            Icon={Icon}
                            size="md"
                            strokeWidth={ICON_STROKE_WIDTH_DENSE}
                            className={FORM_CONTROL.statusChipCurrentIcon}
                        />
                        <span
                            className={FORM_CONTROL.statusChipLabel}
                            title={tooltip}
                        >
                            {tooltip}
                        </span>
                    </div>
                </Chip>
            </div>
        );
    }

    const effectiveState =
        torrent.errorEnvelope &&
        torrent.errorEnvelope.recoveryState &&
        torrent.errorEnvelope.recoveryState !== "ok"
            ? torrent.errorEnvelope.recoveryState
            : torrent.state;

    const isMissingFilesCell =
        effectiveState === STATUS.torrent.MISSING_FILES ||
        classification?.kind === "pathLoss" ||
        classification?.kind === "volumeLoss" ||
        classification?.kind === "accessDenied";
    const conf = statusMap[effectiveState] ?? statusMap[STATUS.torrent.PAUSED];
    const Icon = conf.icon;

    const statusLabel = classification
        ? formatRecoveryStatusFromClassification(classification, t)
        : formatRecoveryStatus(
              torrent.errorEnvelope,
              t,
              torrent.state,
              conf.labelKey,
          );

    const tooltip =
        (classification
            ? formatRecoveryStatusFromClassification(classification, t)
            : formatRecoveryTooltip(
                  torrent.errorEnvelope,
                  t,
                  torrent.state,
                  conf.labelKey,
              )) || t(conf.labelKey);

    if (isMissingFilesCell) {
        return <TorrentTable_MissingFilesStatusCell torrent={torrent} t={t} />;
    }

    return (
        <div className={FORM_CONTROL.statusChipContainer}>
            <Chip
                size="md"
                variant="flat"
                color={conf.color}
                style={STATUS_CHIP_STYLE}
                classNames={FORM_CONTROL.statusChipClassNames}
            >
                <div className={FORM_CONTROL.statusChipContent}>
                    <StatusIcon
                        Icon={Icon}
                        size="md"
                        strokeWidth={ICON_STROKE_WIDTH_DENSE}
                        className={FORM_CONTROL.statusChipCurrentIcon}
                    />
                    <span className={FORM_CONTROL.statusChipLabel} title={tooltip}>
                        {statusLabel}
                    </span>
                </div>
            </Chip>
        </div>
    );
}
