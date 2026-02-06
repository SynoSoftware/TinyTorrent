import { Chip } from "@heroui/react";
import { type LucideIcon } from "lucide-react";
import { type TFunction } from "i18next";
import type {
    RecoveryState,
    TorrentStatus,
} from "@/services/rpc/entities";
import {
    formatRecoveryStatus,
    formatRecoveryStatusFromClassification,
    formatRecoveryTooltip,
} from "@/shared/utils/recoveryFormat";
import { ICON_STROKE_WIDTH_DENSE } from "@/config/logic";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import StatusIcon from "@/shared/ui/components/StatusIcon";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { TorrentTable_MissingFilesStatusCell } from "@/modules/dashboard/components/TorrentTable_MissingFilesStatusCell";
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
    downloading: {
        color: "success",
        icon: ArrowDown,
        labelKey: "table.status_dl",
    },
    seeding: {
        color: "primary",
        icon: ArrowUp,
        labelKey: "table.status_seed",
    },
    paused: {
        color: "warning",
        icon: Pause,
        labelKey: "table.status_pause",
    },
    checking: {
        color: "warning",
        icon: RefreshCw,
        labelKey: "table.status_checking",
    },
    queued: {
        color: "secondary",
        icon: ListStart,
        labelKey: "table.status_queued",
    },
    stalled: {
        color: "secondary",
        icon: WifiOff,
        labelKey: "table.status_stalled",
    },
    error: {
        color: "danger",
        icon: Bug,
        labelKey: "table.status_error",
    },
    missing_files: {
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

interface TorrentTableStatusColumnCellProps {
    torrent: Torrent;
    t: TFunction;
    openFolder?: (path?: string | null) => void;
}

export function TorrentTable_StatusColumnCell({
    torrent,
    t,
    openFolder,
}: TorrentTableStatusColumnCellProps) {
    const { handleRetry, handleDownloadMissing, handleSetLocation } =
        useRecoveryContext();
    const classification = useResolvedRecoveryClassification(torrent);

    const effectiveState =
        torrent.errorEnvelope &&
        torrent.errorEnvelope.recoveryState &&
        torrent.errorEnvelope.recoveryState !== "ok"
            ? torrent.errorEnvelope.recoveryState
            : torrent.state;

    const isMissingFilesCell =
        effectiveState === "missing_files" ||
        classification?.kind === "pathLoss" ||
        classification?.kind === "volumeLoss" ||
        classification?.kind === "accessDenied";
    const conf = statusMap[effectiveState] ?? statusMap.paused;
    const Icon = conf.icon;

    const statusLabel = classification
        ? formatRecoveryStatusFromClassification(classification, t)
        : formatRecoveryStatus(
              torrent.errorEnvelope,
              t,
              torrent.state,
              conf.labelKey
          );

    const tooltip =
        (classification
            ? formatRecoveryStatusFromClassification(classification, t)
            : formatRecoveryTooltip(
                  torrent.errorEnvelope,
                  t,
                  torrent.state,
                  conf.labelKey
              )) || t(conf.labelKey);

    if (isMissingFilesCell) {
        return (
            <TorrentTable_MissingFilesStatusCell
                torrent={torrent}
                t={t}
                handleRetry={handleRetry}
                handleDownloadMissing={handleDownloadMissing}
                handleSetLocation={handleSetLocation}
                openFolder={openFolder}
            />
        );
    }

    return (
        <div className="min-w-0 w-full flex items-center justify-center h-full">
            <Chip
                size="md"
                variant="flat"
                color={conf.color}
                style={STATUS_CHIP_STYLE}
                classNames={{
                    base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
                    content:
                        "font-bold text-scaled tracking-wider whitespace-nowrap text-foreground",
                }}
            >
                <div className="flex items-center justify-center gap-tools">
                    <StatusIcon
                        Icon={Icon}
                        size="md"
                        strokeWidth={ICON_STROKE_WIDTH_DENSE}
                        className="text-current"
                    />
                    <span className="truncate" title={tooltip}>
                        {statusLabel}
                    </span>
                </div>
            </Chip>
        </div>
    );
}
