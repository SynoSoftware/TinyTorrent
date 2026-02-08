import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { useMissingFilesProbe } from "@/services/recovery/missingFilesStore";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { formatMissingFileDetails } from "@/modules/dashboard/utils/missingFiles";
import { extractDriveLabel } from "@/shared/utils/recoveryFormat";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import STATUS from "@/shared/status";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";

type UseTorrentDetailsGeneralViewModelParams = {
    torrent: TorrentDetail;
    downloadDir: string;
    isRecoveryBlocked?: boolean;
    t: TFunction;
};

export type UseTorrentDetailsGeneralViewModelResult = {
    showInlineEditor: boolean;
    generalIsBusy: boolean;
    generalIsVerifying: boolean;
    generalCaption: string;
    generalStatusMessage?: string;
    inlineSetLocationState: ReturnType<typeof useRecoveryContext>["inlineSetLocationState"];
    showMissingFilesError: boolean;
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
    onSetLocation: () => void;
    onDownloadMissing: () => void;
    onOpenFolder: () => void;
    onInlineChange: (value: string) => void;
    // TODO(section 20.2/20.5): replace boolean submit result with typed inline outcome variants.
    onInlineSubmit: () => Promise<boolean>;
    onInlineCancel: () => void;
};

const getTorrentKey = (
    entry?: { id?: string | number; hash?: string } | null
) => entry?.id?.toString() ?? entry?.hash ?? "";

export function useTorrentDetailsGeneralViewModel({
    torrent,
    downloadDir,
    isRecoveryBlocked,
    t,
}: UseTorrentDetailsGeneralViewModelParams): UseTorrentDetailsGeneralViewModelResult {
    const {
        handleSetLocation,
        handleDownloadMissing,
        inlineSetLocationState,
        cancelInlineSetLocation,
        releaseInlineSetLocation,
        confirmInlineSetLocation,
        handleInlineLocationChange,
        setLocationCapability,
        canOpenFolder,
    } = useRecoveryContext();
    const { handleTorrentAction } = useTorrentCommands();
    const openFolder = useOpenTorrentFolder();

    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const currentTorrentKey = getTorrentKey(torrent);
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
                    drive:
                        classification.root ??
                        extractDriveLabel(classification.path ?? downloadDir) ??
                        t("labels.unknown"),
                });
            case "accessDenied":
                return t("recovery.status.access_denied");
            default:
                return t("recovery.generic_header");
        }
    }, [classification, downloadDir, t]);

    const effectiveState =
        torrent.errorEnvelope?.recoveryState &&
        torrent.errorEnvelope.recoveryState !== "ok"
            ? torrent.errorEnvelope.recoveryState
            : torrent.state;
    const showMissingFilesError = effectiveState === STATUS.torrent.MISSING_FILES;

    const currentPath = downloadDir ?? torrent.savePath ?? torrent.downloadDir ?? "";
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;

    const inlineEditorKey = inlineSetLocationState?.torrentKey ?? "";
    const showInlineEditor =
        inlineSetLocationState?.surface === "general-tab" &&
        inlineEditorKey.length > 0 &&
        inlineEditorKey === currentTorrentKey;
    const generalIsVerifying = inlineSetLocationState?.status === "verifying";
    const generalIsBusy = inlineSetLocationState?.status !== "idle";
    const generalCaption = t(getSurfaceCaptionKey("general-tab"));
    const generalStatusMessage = generalIsVerifying
        ? t("recovery.status.applying_location")
        : classification?.confidence === "unknown"
          ? t("recovery.inline_fallback")
          : undefined;

    const recoveryBlockedMessage = isRecoveryBlocked
        ? t("recovery.status.blocked")
        : null;

    useEffect(
        () => () => {
            releaseInlineSetLocation();
        },
        [releaseInlineSetLocation]
    );

    const isActive =
        torrent.state === STATUS.torrent.DOWNLOADING ||
        torrent.state === STATUS.torrent.SEEDING;
    const mainActionLabel = isActive ? t("toolbar.pause") : t("toolbar.resume");

    const onToggleStartStop = useCallback(() => {
        const action = isActive ? "pause" : "resume";
        void handleTorrentAction(action, torrent);
    }, [handleTorrentAction, isActive, torrent]);

    const onSetLocation = useCallback(() => {
        void handleSetLocation(torrent, {
            surface: "general-tab",
            mode: "manual",
        });
    }, [handleSetLocation, torrent]);

    const onDownloadMissing = useCallback(() => {
        void handleDownloadMissing(torrent);
    }, [handleDownloadMissing, torrent]);

    const onOpenFolder = useCallback(() => {
        if (!currentPath) return;
        void openFolder(currentPath);
    }, [currentPath, openFolder]);

    const onConfirmRemove = useCallback(
        async (deleteData: boolean): Promise<TorrentCommandOutcome> => {
            const action = deleteData ? "remove-with-data" : "remove";
            const outcome = await handleTorrentAction(action, torrent);
            if (outcome.status === "success" || outcome.status === "canceled") {
                setShowRemoveModal(false);
            }
            return outcome;
        },
        [handleTorrentAction, torrent]
    );

    const openRemoveModal = useCallback(() => {
        setShowRemoveModal(true);
    }, []);

    const closeRemoveModal = useCallback(() => {
        setShowRemoveModal(false);
    }, []);

    return {
        showInlineEditor,
        generalIsBusy,
        generalIsVerifying,
        generalCaption,
        generalStatusMessage,
        inlineSetLocationState,
        showMissingFilesError,
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
        onSetLocation,
        onDownloadMissing,
        onOpenFolder,
        onInlineChange: handleInlineLocationChange,
        onInlineSubmit: confirmInlineSetLocation,
        onInlineCancel: cancelInlineSetLocation,
    };
}

