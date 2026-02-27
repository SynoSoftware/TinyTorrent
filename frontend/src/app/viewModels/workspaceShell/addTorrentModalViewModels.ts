import { useMemo } from "react";
import type {
    AddTorrentModalProps,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddTorrentSource } from "@/modules/torrent-add/types";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import type { SettingsConfig } from "@/modules/settings/data/config";
import type {
    AddTorrentCommandOutcome,
    UseAddTorrentControllerResult,
} from "@/app/orchestrators/useAddTorrentController";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";

export interface AddMagnetModalPropsDeps {
    isOpen: boolean;
    initialValue: string;
    onClose: () => void;
    onSubmit: (value: string) => Promise<AddTorrentCommandOutcome>;
}

export function useAddMagnetModalProps({
    isOpen,
    initialValue,
    onClose,
    onSubmit,
}: AddMagnetModalPropsDeps): AddMagnetModalProps {
    return useMemo(
        () => ({
            isOpen,
            initialValue,
            onClose,
            onSubmit,
        }),
        [isOpen, initialValue, onClose, onSubmit],
    );
}

export interface AddTorrentModalPropsDeps {
    addSource: AddTorrentSource | null;
    addTorrentDefaults: UseAddTorrentControllerResult["addTorrentDefaults"];
    settingsConfig: SettingsConfig;
    isAddingTorrent: boolean;
    isFinalizingExisting: boolean;
    onCancel: () => void;
    onConfirm: UseAddTorrentControllerResult["handleTorrentWindowConfirm"];
    torrentClient: EngineAdapter;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
}

export function useAddTorrentModalProps({
    addSource,
    addTorrentDefaults,
    settingsConfig,
    isAddingTorrent,
    isFinalizingExisting,
    onCancel,
    onConfirm,
    torrentClient,
    checkFreeSpace: checkFreeSpaceOverride,
}: AddTorrentModalPropsDeps): AddTorrentModalProps | null {
    const checkFreeSpace = useMemo(
        () =>
            checkFreeSpaceOverride ??
            torrentClient.checkFreeSpace?.bind(torrentClient),
        [checkFreeSpaceOverride, torrentClient],
    );

    return useMemo(() => {
        if (!addSource) return null;
        return {
            isOpen: true,
            source: addSource,
            downloadDir:
                addTorrentDefaults.downloadDir ||
                settingsConfig.download_dir,
            commitMode: addTorrentDefaults.commitMode,
            sequentialDownload: addTorrentDefaults.sequentialDownload,
            skipHashCheck: addTorrentDefaults.skipHashCheck,
            onDownloadDirChange: addTorrentDefaults.setDownloadDir,
            onCommitModeChange: addTorrentDefaults.setCommitMode,
            onSequentialDownloadChange:
                addTorrentDefaults.setSequentialDownload,
            onSkipHashCheckChange: addTorrentDefaults.setSkipHashCheck,
            isSubmitting: isAddingTorrent || isFinalizingExisting,
            onCancel,
            onConfirm,
            checkFreeSpace,
        };
    }, [
        addSource,
        addTorrentDefaults,
        settingsConfig.download_dir,
        isAddingTorrent,
        isFinalizingExisting,
        onCancel,
        onConfirm,
        checkFreeSpace,
    ]);
}
