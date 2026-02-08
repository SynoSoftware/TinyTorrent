import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { useOptimisticToggle } from "@/shared/hooks/useOptimisticToggle";
import type { OptimisticToggleCommitOutcome } from "@/shared/hooks/useOptimisticToggle";
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
    // 1. Transform raw RPC file entities into flat explorer entries
    const fileEntries = useMemo<FileExplorerEntry[]>(() => {
        if (!files) return [];
        return files.map(({ name, index, length, progress, wanted, priority }) => ({
            name,
            index,
            length,
            progress,
            wanted,
            priority,
        }));
    }, [files]);

    const commitFileToggle = useCallback(
        async (
            indexes: number[],
            wanted: boolean,
        ): Promise<OptimisticToggleCommitOutcome> => {
            const outcome = await onFilesToggle(indexes, wanted);
            if (outcome.status === "success") {
                return { status: "applied" };
            }
            if (outcome.status === "unsupported") {
                showFeedback(t("torrent_modal.controls.not_supported"), "warning");
                return {
                    status: "unsupported",
                    reason:
                        outcome.reason === "missing_handler"
                            ? "missing_handler"
                            : "action_not_supported",
                };
            }
            showFeedback(t("toolbar.feedback.failed"), "danger");
            return { status: "failed", reason: "execution_failed" };
        },
        [onFilesToggle, showFeedback, t],
    );

    // 2. Manage local optimistic state for checkboxes (instant UI response)
    const { optimisticState, toggle: optimisticToggle } =
        useOptimisticToggle(commitFileToggle);

    const toggle = useCallback<FileExplorerToggleCommand>(
        async (indexes: number[], wanted: boolean) => {
            const outcome = await optimisticToggle(indexes, wanted);
            if (outcome.status === "applied") return { status: "success" } as const;
            if (outcome.status === "unsupported") {
                return {
                    status: "unsupported",
                    reason: outcome.reason,
                } as const;
            }
            return { status: "failed", reason: "execution_failed" } as const;
        },
        [optimisticToggle],
    );

    // 3. Merge base data with optimistic overrides
    const displayFiles = useMemo(() => {
        // Optimization: if no overrides, return the cached array
        if (!Object.keys(optimisticState).length) return fileEntries;

        return fileEntries.map((entry) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    optimisticState,
                    entry.index,
                )
            ) {
                return { ...entry, wanted: optimisticState[entry.index] };
            }
            return entry;
        });
    }, [fileEntries, optimisticState]);

    return {
        files: displayFiles,
        toggle,
        isEmpty: !files || files.length === 0,
    };
}
