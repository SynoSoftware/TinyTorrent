import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useTorrentCommands, useRequiredTorrentActions } from "@/app/context/AppCommandContext";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import { isOpenFolderSuccess } from "@/app/types/openFolder";
import STATUS from "@/shared/status";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { useOpenTorrentFolder } from "@/app/hooks/useOpenTorrentFolder";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useDirectoryPicker } from "@/app/hooks/useDirectoryPicker";
import {
    applySetDownloadLocation,
    pickSetDownloadLocationDirectory,
} from "@/modules/dashboard/utils/applySetDownloadLocation";
import {
    getSetDownloadLocationUiTextKeys,
} from "@/modules/dashboard/domain/torrentRelocation";

type UseTorrentDetailsGeneralViewModelParams = {
    torrent: TorrentDetail;
    downloadDir: string;
    t: TFunction;
};

export type UseTorrentDetailsGeneralViewModelResult = {
    transmissionError: string | null;
    canSetLocation: boolean;
    canPickDirectory: boolean;
    canOpenFolder: boolean;
    currentPath: string;
    setDownloadLocationActionLabelKey: "table.actions.set_download_path" | "table.actions.locate_files";
    setDownloadLocationModalTitleKey: "modals.set_download_location.title" | "modals.locate_files.title";
    isActive: boolean;
    mainActionLabel: string;
    showSetDownloadPathModal: boolean;
    showRemoveModal: boolean;
    openSetDownloadPathModal: () => void;
    closeSetDownloadPathModal: () => void;
    pickDirectoryForSetDownloadPath: (currentPath: string) => Promise<string | null>;
    applySetDownloadPath: (params: { path: string }) => Promise<void>;
    openRemoveModal: () => void;
    closeRemoveModal: () => void;
    onConfirmRemove: (deleteData: boolean) => Promise<TorrentCommandOutcome>;
    onToggleStartStop: () => void;
    onStartNow: () => void;
    onOpenFolder: () => void;
};

export function useTorrentDetailsGeneralViewModel({ torrent, downloadDir, t }: UseTorrentDetailsGeneralViewModelParams): UseTorrentDetailsGeneralViewModelResult {
    const { handleTorrentAction, setDownloadLocation } = useTorrentCommands();
    const { dispatch } = useRequiredTorrentActions();
    const { canOpenFolder } = useUiModeCapabilities();
    const { canPickDirectory, pickDirectory } = useDirectoryPicker();
    const torrentClient = useTorrentClient();
    const openFolder = useOpenTorrentFolder();

    const [showSetDownloadPathModal, setShowSetDownloadPathModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const transmissionError =
        typeof torrent.errorString === "string" &&
        torrent.errorString.trim().length > 0
            ? torrent.errorString
            : null;

    const currentPath = downloadDir ?? torrent.savePath ?? torrent.downloadDir ?? "";
    const canSetLocation = typeof torrentClient.setTorrentLocation === "function";
    const setDownloadLocationUiTextKeys = getSetDownloadLocationUiTextKeys(torrent);

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

    const pickDirectoryForSetDownloadPath = useCallback(
        async (currentInput: string): Promise<string | null> => {
            return pickSetDownloadLocationDirectory({
                currentPath: currentInput,
                torrent,
                canPickDirectory,
                pickDirectory,
            });
        },
        [canPickDirectory, pickDirectory, torrent],
    );

    const openSetDownloadPathModal = useCallback(() => {
        if (!canSetLocation) {
            return;
        }
        setShowSetDownloadPathModal(true);
    }, [canSetLocation]);

    const closeSetDownloadPathModal = useCallback(() => {
        setShowSetDownloadPathModal(false);
    }, []);

    const applySetDownloadPath = useCallback(
        async ({ path }: { path: string }) => {
            await applySetDownloadLocation({
                torrent,
                path,
                client: torrentClient,
                setDownloadLocation,
                dispatchEnsureActive: dispatch,
                t,
            });
        },
        [
            dispatch,
            setDownloadLocation,
            t,
            torrent,
            torrentClient,
        ],
    );

    const onOpenFolder = useCallback(() => {
        if (!currentPath) return;
        void openFolder(currentPath).then((outcome) => {
            if (isOpenFolderSuccess(outcome)) {
                return;
            }
            if (outcome.status === "unsupported" || outcome.status === "missing_path" || outcome.status === "failed") {
                return;
            }
        });
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
        [handleTorrentAction, torrent],
    );

    const openRemoveModal = useCallback(() => {
        setShowRemoveModal(true);
    }, []);

    const closeRemoveModal = useCallback(() => {
        setShowRemoveModal(false);
    }, []);

    return {
        transmissionError,
        canSetLocation,
        canPickDirectory,
        canOpenFolder,
        currentPath,
        setDownloadLocationActionLabelKey: setDownloadLocationUiTextKeys.actionLabelKey,
        setDownloadLocationModalTitleKey: setDownloadLocationUiTextKeys.modalTitleKey,
        isActive,
        mainActionLabel,
        showSetDownloadPathModal,
        showRemoveModal,
        openSetDownloadPathModal,
        closeSetDownloadPathModal,
        pickDirectoryForSetDownloadPath,
        applySetDownloadPath,
        openRemoveModal,
        closeRemoveModal,
        onConfirmRemove,
        onToggleStartStop,
        onStartNow,
        onOpenFolder,
    };
}
