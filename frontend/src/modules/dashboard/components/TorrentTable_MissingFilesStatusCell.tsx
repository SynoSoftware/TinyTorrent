import { Chip, cn } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import type { TFunction } from "i18next";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { useMissingFilesProbe } from "@/services/recovery/missingFilesStore";
import { formatMissingFileDetails } from "@/modules/dashboard/utils/missingFiles";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import {
    formatPrimaryActionHintFromClassification,
    formatRecoveryStatusFromClassification,
} from "@/shared/utils/recoveryFormat";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";

type MissingFilesStatusCellProps = {
    torrent: Torrent;
    t: TFunction;
};

const STATUS_CHIP_STYLE = {
    width: "var(--tt-status-chip-w)",
    minWidth: "var(--tt-status-chip-w)",
    maxWidth: "var(--tt-status-chip-w)",
    height: "var(--tt-status-chip-h)",
    boxSizing: "border-box",
} as const;

export function TorrentTable_MissingFilesStatusCell({
    torrent,
    t,
}: MissingFilesStatusCellProps) {
    const { recoverySession, openRecoveryModal } = useRecoveryContext();
    const { showFeedback } = useActionFeedback();
    const classification = useResolvedRecoveryClassification(torrent);
    const probe = useMissingFilesProbe(torrent.id);
    const probeLines = formatMissingFileDetails(t, probe);
    const currentTorrentKey = getRecoveryFingerprint(torrent);
    const activeRecoveryKey = recoverySession
        ? getRecoveryFingerprint(recoverySession.torrent)
        : null;
    const isBusyWithOtherTorrent = Boolean(
        activeRecoveryKey && activeRecoveryKey !== currentTorrentKey,
    );

    if (!classification) {
        return (
            <div className="min-w-0 w-full flex items-center justify-center h-full">
                <Chip
                    size="md"
                    variant="flat"
                    color="warning"
                    style={STATUS_CHIP_STYLE}
                    classNames={{
                        base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
                        content:
                            "font-bold text-scaled tracking-wider whitespace-nowrap text-foreground",
                    }}
                >
                    <div className="flex items-center justify-center gap-tools">
                        <AlertTriangle className="toolbar-icon-size-md text-warning" />
                        <span>{t("recovery.generic_header")}</span>
                    </div>
                </Chip>
            </div>
        );
    }

    const statusText = formatRecoveryStatusFromClassification(
        classification,
        t,
    );
    const primaryHint = formatPrimaryActionHintFromClassification(
        classification,
        t,
    );
    const tooltip = [statusText, primaryHint, ...probeLines]
        .filter(Boolean)
        .join("\n");

    const handleOpenRecovery = () => {
        const outcome = openRecoveryModal(torrent);
        if (outcome.status === "requested" || outcome.status === "already_open") {
            return;
        }
        showFeedback(t("recovery.feedback.recovery_not_required"), "warning");
    };

    return (
        <div className="min-w-0 w-full flex items-center justify-center h-full">
            <button
                type="button"
                onClick={handleOpenRecovery}
                title={tooltip}
                className={cn(
                    "min-w-0 outline-none rounded-panel transition-opacity",
                    isBusyWithOtherTorrent
                        ? "cursor-pointer opacity-90 hover:opacity-90"
                        : "cursor-pointer hover:opacity-90",
                )}
            >
                <Chip
                    size="md"
                    variant="flat"
                    color="warning"
                    style={STATUS_CHIP_STYLE}
                    classNames={{
                        base: "h-status-chip px-tight inline-flex items-center justify-center gap-tools whitespace-nowrap",
                        content:
                            "font-bold text-scaled tracking-wider whitespace-nowrap text-foreground",
                    }}
                >
                    <div className="flex items-center justify-center gap-tools">
                        <AlertTriangle className="toolbar-icon-size-md text-warning" />
                        <span className="truncate max-w-full">{statusText}</span>
                    </div>
                </Chip>
            </button>
        </div>
    );
}
