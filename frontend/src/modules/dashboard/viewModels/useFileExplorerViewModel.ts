import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import {
    type FileExplorerEntry,
    type FileExplorerToggleCommand,
} from "@/shared/ui/workspace/FileExplorerTree";

export interface FileExplorerViewModel {
    files: FileExplorerEntry[];
    toggle: FileExplorerToggleCommand;
    isEmpty: boolean;
}

export function useFileExplorerViewModel(
    files: TorrentFileEntity[] | undefined,
    onFilesToggle: FileExplorerToggleCommand,
): FileExplorerViewModel {
    const { t } = useTranslation();
    const { showFeedback } = useActionFeedback();
    const fileEntries = useMemo<FileExplorerEntry[]>(() => files ?? [], [files]);

    const toggle = useCallback<FileExplorerToggleCommand>(
        async (indexes: number[], wanted: boolean) => {
            const outcome = await onFilesToggle(indexes, wanted);
            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
                return {
                    status: "unsupported",
                    reason: outcome.reason,
                } as const;
            }
            if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
            return outcome;
        },
        [onFilesToggle, showFeedback, t],
    );

    return {
        files: fileEntries,
        toggle,
        isEmpty: !files || files.length === 0,
    };
}
