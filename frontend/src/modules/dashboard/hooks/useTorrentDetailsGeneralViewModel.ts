import { useCallback, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { useMissingFilesProbe } from "@/services/recovery/missingFilesStore";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { formatMissingFileDetails } from "@/modules/dashboard/utils/missingFiles";
import { extractDriveLabel } from "@/shared/utils/recoveryFormat";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { isOpenFolderSuccess } from "@/app/types/openFolder";
import STATUS from "@/shared/status";
import { canTriggerDownloadMissingAction } from "@/modules/dashboard/utils/recoveryEligibility";
import { getEffectiveRecoveryState } from "@/modules/dashboard/utils/recoveryState";

type UseTorrentDetailsGeneralViewModelParams = {
    torrent: TorrentDetail;
    downloadDir: string;
    isRecoveryBlocked?: boolean;
    t: TFunction;
};

export type UseTorrentDetailsGeneralViewModelResult = {
    showMissingFilesError: boolean;
    transmissionError: string | null;
    canDownloadMissing: boolean;
    isDownloadMissingInFlight: boolean;
    probeLines: string[];
    classificationLabel: string | null;
    recoveryBlockedMessage: string | null;
    canSetLocation: boolean;
    canOpenFolder: boolean;
    currentPath: string;
    isActive: boolean;
    mainActionLabel: string;
    showRemoveModal: boolean;
    openRemoveModal: () => void;
    closeRemoveModal: () => void;
    onConfirmRemove: (deleteData: boolean) => Promise<TorrentCommandOutcome>;
    onToggleStartStop: () => void;
    onStartNow: () => void;
    onSetLocation: () => void;
    onDownloadMissing: () => void;
    onOpenFolder: () => void;
};

export function useTorrentDetailsGeneralViewModel({ torrent, downloadDir, isRecoveryBlocked, t }: UseTorrentDetailsGeneralViewModelParams): UseTorrentDetailsGeneralViewModelResult {
    const { handleSetLocation: openDownloadPath, handleDownloadMissing, isDownloadMissingInFlight, setLocationCapability: downloadPathCapability, canOpenFolder, handleOpenFolder } = useRecoveryContext();
    const { handleTorrentAction } = useTorrentCommands();

    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const probe = useMissingFilesProbe(torrent.id);
    const probeLines = useMemo(() => formatMissingFileDetails(t, probe), [probe, t]);

    const classification = useResolvedRecoveryClassification(torrent);
    const classificationLabel = useMemo(() => {
        if (!classification) return null;
        if (classification.confidence === "unknown") {
            return t("recovery.inline_fallback");
        }
        switch (classification.kind) {
            case "pathLoss":
                return t("recovery.status.folder_not_found", {
                    path: classification.path ?? downloadDir ?? t("labels.unknown"),
                });
            case "volumeLoss":
                return t("recovery.status.drive_disconnected", {
                    drive: classification.root ?? extractDriveLabel(classification.path ?? downloadDir) ?? t("labels.unknown"),
                });
            case "accessDenied":
                return t("recovery.status.access_denied");
            default:
                return t("recovery.generic_header");
        }
    }, [classification, downloadDir, t]);

    const effectiveState = getEffectiveRecoveryState(torrent);
    const showMissingFilesError = effectiveState === STATUS.torrent.MISSING_FILES;
    const transmissionError =
        typeof torrent.errorString === "string" &&
        torrent.errorString.trim().length > 0
            ? torrent.errorString
            : null;
    const canDownloadMissing = canTriggerDownloadMissingAction(
        torrent,
        classification,
    );
    const downloadMissingBusy = isDownloadMissingInFlight(torrent);

    const currentPath = downloadDir ?? torrent.savePath ?? torrent.downloadDir ?? "";
    const canSetLocation = downloadPathCapability.canBrowse || downloadPathCapability.supportsManual;

    const recoveryBlockedMessage =
        isRecoveryBlocked || effectiveState === "blocked"
            ? t("recovery.status.blocked")
            : null;

    const isActive =
        torrent.state === STATUS.torrent.DOWNLOADING ||
        torrent.state === STATUS.torrent.SEEDING ||
        torrent.state === STATUS.torrent.CHECKING;
    const mainActionLabel = isActive ? t("toolbar.pause") : t("toolbar.resume");

    const onToggleStartStop = useCallback(() => {
        const action = isActive ? "pause" : "resume";
        void handleTorrentAction(action, torrent);
    }, [handleTorrentAction, isActive, torrent]);

    const onStartNow = useCallback(() => {
        void handleTorrentAction("resume-now", torrent);
    }, [handleTorrentAction, torrent]);

    const onSetLocation = useCallback(() => {
        void openDownloadPath(torrent, {
            surface: "general-tab",
        });
    }, [openDownloadPath, torrent]);

    const onDownloadMissing = useCallback(() => {
        if (downloadMissingBusy) {
            return;
        }
        void handleDownloadMissing(torrent);
    }, [downloadMissingBusy, handleDownloadMissing, torrent]);

    const onOpenFolder = useCallback(() => {
        if (!currentPath) return;
        void handleOpenFolder(currentPath).then((outcome) => {
            if (isOpenFolderSuccess(outcome)) {
                return;
            }
            if (outcome.status === "unsupported" || outcome.status === "missing_path" || outcome.status === "failed") {
                return;
            }
        });
    }, [currentPath, handleOpenFolder]);

    const onConfirmRemove = useCallback(
        async (deleteData: boolean): Promise<TorrentCommandOutcome> => {
            const action = deleteData ? "remove-with-data" : "remove";
            const outcome = await handleTorrentAction(action, torrent);
            if (outcome.status === "success" || outcome.status === "canceled") {
                setShowRemoveModal(false);
            }
            return outcome;
        },
        [handleTorrentAction, torrent],
    );

    const openRemoveModal = useCallback(() => {
        setShowRemoveModal(true);
    }, []);

    const closeRemoveModal = useCallback(() => {
        setShowRemoveModal(false);
    }, []);

    return {
        showMissingFilesError,
        transmissionError,
        canDownloadMissing,
        isDownloadMissingInFlight: downloadMissingBusy,
        probeLines,
        classificationLabel,
        recoveryBlockedMessage,
        canSetLocation,
        canOpenFolder,
        currentPath,
        isActive,
        mainActionLabel,
        showRemoveModal,
        openRemoveModal,
        closeRemoveModal,
        onConfirmRemove,
        onToggleStartStop,
        onStartNow,
        onSetLocation,
        onDownloadMissing,
        onOpenFolder,
    };
}
