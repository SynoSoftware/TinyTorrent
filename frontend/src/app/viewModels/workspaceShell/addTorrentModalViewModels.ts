import { useMemo } from "react";
import type {
    AddTorrentModalProps,
} from "@/modules/torrent-add/components/AddTorrentModal";
import type { AddTorrentSource } from "@/modules/torrent-add/types";
import type { AddMagnetModalProps } from "@/modules/torrent-add/components/AddMagnetModal";
import type {
    AddTorrentCommandOutcome,
    UseAddTorrentControllerResult,
} from "@/app/orchestrators/useAddTorrentController";

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
    onCancel: () => void;
    onConfirm: UseAddTorrentControllerResult["handleTorrentWindowConfirm"];
}

export function useAddTorrentModalProps({
    addSource,
    addTorrentDefaults,
    onCancel,
    onConfirm,
}: AddTorrentModalPropsDeps): AddTorrentModalProps | null {
    return useMemo(() => {
        if (!addSource) return null;
        return {
            isOpen: true,
            source: addSource,
            downloadDir: addTorrentDefaults.downloadDir,
            commitMode: addTorrentDefaults.commitMode,
            sequentialDownload: addTorrentDefaults.sequentialDownload,
            skipHashCheck: addTorrentDefaults.skipHashCheck,
            onDownloadDirChange: addTorrentDefaults.setDownloadDir,
            onCommitModeChange: addTorrentDefaults.setCommitMode,
            onSequentialDownloadChange:
                addTorrentDefaults.setSequentialDownload,
            onSkipHashCheckChange: addTorrentDefaults.setSkipHashCheck,
            onCancel,
            onConfirm,
        };
    }, [
        addSource,
        addTorrentDefaults,
        onCancel,
        onConfirm,
    ]);
}
