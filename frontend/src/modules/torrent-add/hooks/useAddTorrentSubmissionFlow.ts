import { useCallback } from "react";
import {
    buildSelectionCommit,
    type FilePriority,
    type FileRow,
} from "@/modules/torrent-add/services/fileSelection";
import type {
    AddTorrentCommitMode,
    AddTorrentSelection,
} from "@/modules/torrent-add/types";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";

interface UseAddTorrentSubmissionFlowParams {
    canSubmit: boolean;
    destinationPath: string;
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    files: FileRow[];
    selectedIndexes: Set<number>;
    priorities: Map<number, FilePriority>;
    sequentialDownload: boolean;
    skipHashCheck: boolean;
    onConfirm: (
        selection: AddTorrentSelection,
    ) => Promise<AddTorrentCommandOutcome>;
    onDownloadDirChange: (value: string) => void;
    onSubmitSuccess: (path: string) => void;
}

export interface UseAddTorrentSubmissionFlowResult {
    submit: () => Promise<void>;
}

export function useAddTorrentSubmissionFlow({
    canSubmit,
    destinationPath,
    downloadDir,
    commitMode,
    files,
    selectedIndexes,
    priorities,
    sequentialDownload,
    skipHashCheck,
    onConfirm,
    onDownloadDirChange,
    onSubmitSuccess,
}: UseAddTorrentSubmissionFlowParams): UseAddTorrentSubmissionFlowResult {
    const submit = useCallback(async () => {
        if (!canSubmit) return;

        const submitDir = destinationPath.trim();
        if (submitDir && submitDir !== downloadDir) {
            onDownloadDirChange(submitDir);
        }

        const { filesUnwanted, priorityHigh, priorityLow, priorityNormal } =
            buildSelectionCommit({
                files,
                selected: selectedIndexes,
                priorities,
            });

        try {
            const outcome = await onConfirm({
                downloadDir: submitDir,
                commitMode,
                filesUnwanted,
                priorityHigh,
                priorityNormal,
                priorityLow,
                options: {
                    sequential: sequentialDownload,
                    skipHashCheck,
                },
            });
            if (
                outcome.status !== "invalid_input" &&
                outcome.status !== "cancelled" &&
                outcome.status !== "blocked_pending_delete" &&
                outcome.status !== "blocked_in_flight" &&
                outcome.status !== "failed"
            ) {
                onSubmitSuccess(submitDir);
            }
        } catch {
            // no-op: command layer owns user-facing error feedback
        }
    }, [
        canSubmit,
        commitMode,
        destinationPath,
        downloadDir,
        files,
        onConfirm,
        onDownloadDirChange,
        onSubmitSuccess,
        priorities,
        selectedIndexes,
        sequentialDownload,
        skipHashCheck,
    ]);

    return {
        submit,
    };
}
