import { useMemo } from "react";
import type { TorrentFileEntity } from "@/services/rpc/entities";
import { useFileTree } from "@/shared/hooks/useFileTree";
import { useOptimisticToggle } from "@/shared/hooks/useOptimisticToggle";
import { type FileExplorerEntry } from "@/shared/ui/workspace/FileExplorerTree";

export interface FileExplorerViewModel {
    files: FileExplorerEntry[];
    toggle: (indexes: number[], wanted: boolean) => void;
    isEmpty: boolean;
}

const NOOP_FILE_TOGGLE = async () => {
    /* no-op */
};

export function useFileExplorerViewModel(
    files: TorrentFileEntity[] | undefined,
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean,
    ) => Promise<void> | void,
): FileExplorerViewModel {
    // 1. Transform raw RPC file entities into flat explorer entries
    const fileEntries = useFileTree(files);

    // 2. Manage local optimistic state for checkboxes (instant UI response)
    const { optimisticState, toggle } = useOptimisticToggle(
        onFilesToggle ?? NOOP_FILE_TOGGLE,
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
