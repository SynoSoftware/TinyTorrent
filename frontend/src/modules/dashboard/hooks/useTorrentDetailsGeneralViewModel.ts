import { useCallback, useState } from "react";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import STATUS from "@/shared/status";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSetDownloadLocationFlow } from "@/modules/dashboard/hooks/useSetDownloadLocationFlow";

type UseTorrentDetailsGeneralViewModelParams = {
    torrent: TorrentDetail;
};

export type UseTorrentDetailsGeneralViewModelResult = {
    transmissionError: string | null;
    displayDownloadPath: string;
    verificationPercent: number;
    canSetLocation: boolean;
    canPickDirectory: boolean;
    currentPath: string;
    mainActionLabelKey: "toolbar.pause" | "toolbar.resume";
    setDownloadLocationActionLabelKey: "table.actions.set_download_path" | "table.actions.locate_files";
    setDownloadLocationModalTitleKey: "modals.set_download_location.title" | "modals.locate_files.title";
    allowCreateSetLocationPath: boolean;
    isActive: boolean;
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
};

export function useTorrentDetailsGeneralViewModel({ torrent }: UseTorrentDetailsGeneralViewModelParams): UseTorrentDetailsGeneralViewModelResult {
    const { handleTorrentAction } = useTorrentCommands();
    const torrentClient = useTorrentClient();

    const [showSetDownloadPathModal, setShowSetDownloadPathModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);

    const transmissionError =
        typeof torrent.errorString === "string" &&
        torrent.errorString.trim().length > 0
            ? torrent.errorString
            : null;

    const setLocationFlow = useSetDownloadLocationFlow({
        torrent,
    });
    const currentPath = setLocationFlow.currentPath;
    const displayDownloadPath = currentPath;
    const verificationProgress = torrent.verificationProgress ?? 0;
    const verificationPercent =
        verificationProgress > 1
            ? verificationProgress
            : verificationProgress * 100;
    const canSetLocation = typeof torrentClient.setTorrentLocation === "function";
    const isActive =
        torrent.state === STATUS.torrent.DOWNLOADING ||
        torrent.state === STATUS.torrent.SEEDING ||
        torrent.state === STATUS.torrent.CHECKING;
    const mainActionLabelKey = isActive ? "toolbar.pause" : "toolbar.resume";

    const onToggleStartStop = useCallback(() => {
        const action = isActive ? "pause" : "resume";
        void handleTorrentAction(action, torrent);
    }, [handleTorrentAction, isActive, torrent]);

    const onStartNow = useCallback(() => {
        void handleTorrentAction("resume-now", torrent);
    }, [handleTorrentAction, torrent]);

    const openSetDownloadPathModal = useCallback(() => {
        if (!canSetLocation) {
            return;
        }
        setShowSetDownloadPathModal(true);
    }, [canSetLocation]);

    const closeSetDownloadPathModal = useCallback(() => {
        setShowSetDownloadPathModal(false);
    }, []);

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
        displayDownloadPath,
        verificationPercent,
        canSetLocation,
        canPickDirectory: setLocationFlow.canPickDirectory,
        currentPath,
        mainActionLabelKey,
        setDownloadLocationActionLabelKey: setLocationFlow.policy.actionLabelKey,
        setDownloadLocationModalTitleKey: setLocationFlow.policy.modalTitleKey,
        allowCreateSetLocationPath: setLocationFlow.policy.allowCreatePath,
        isActive,
        showSetDownloadPathModal,
        showRemoveModal,
        openSetDownloadPathModal,
        closeSetDownloadPathModal,
        pickDirectoryForSetDownloadPath:
            setLocationFlow.pickDirectoryForSetDownloadPath,
        applySetDownloadPath: setLocationFlow.applySetDownloadPath,
        openRemoveModal,
        closeRemoveModal,
        onConfirmRemove,
        onToggleStartStop,
        onStartNow,
    };
}
