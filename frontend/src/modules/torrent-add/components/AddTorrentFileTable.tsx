import React, { useMemo, useCallback } from "react";
import {
    FileExplorerTree,
    type FileExplorerTreeViewModel,
    type FileExplorerContextAction,
    type FileExplorerEntry,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import type {
    TorrentFileEntity,
    LibtorrentPriority,
} from "@/services/rpc/entities";
import type {
    FilePriority,
} from "@/modules/torrent-add/services/fileSelection";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";

const PRIORITY_MAP: Record<FilePriority, LibtorrentPriority> = {
    low: 1,
    normal: 4, // Assuming 4 is normal default in libtorrent/app
    high: 7,
};

export const AddTorrentFileTable = () => {
    const { fileTable } = useAddTorrentModalContext();
    const {
        files,
        onRowSelectionChange,
        onSetPriority,
        priorities,
        rowSelection,
    } = fileTable;

    // 1. Adapt flat files to TorrentFileEntity for the Tree
    // We memoize this to prevent tree rebuilding on every render unless data changes
    const treeFiles: TorrentFileEntity[] = useMemo(() => {
        return files.map((f) => {
            // Determine "wanted" state from rowSelection
            // In TanStack table, selection usually means "checked"
            const isSelected = !!rowSelection[f.index];

            // Determine priority
            const filePriority = priorities.get(f.index) ?? "normal";
            const libPriority = PRIORITY_MAP[filePriority] ?? 0; // Default to 0? Or 1?

            return {
                index: f.index,
                name: f.path, // Tree expects full path in 'name' (e.g. "dir/file.mkv") to build structure
                length: f.length,
                completed: 0,
                progress: 0,
                priority: libPriority,
                wanted: isSelected,
            };
        });
    }, [files, rowSelection, priorities]);

    // 2. Adapt Toggle Action
    // Tree calls: (indexes, wanted)
    // Table expects: setRowSelection(old => new)
    const handleFilesToggle = useCallback(
        (indexes: number[], wanted: boolean): FileExplorerToggleOutcome => {
            onRowSelectionChange((prev) => {
                const next = { ...prev };
                indexes.forEach((idx) => {
                    if (wanted) {
                        next[idx] = true;
                    } else {
                        delete next[idx];
                    }
                });
                return next;
            });
            return { status: "success" };
        },
        [onRowSelectionChange],
    );

    // 3. Adapt Context Menu / Priority Actions
    const handleFileContextAction = useCallback(
        (action: FileExplorerContextAction, entry: FileExplorerEntry) => {
            switch (action) {
                case "priority_high":
                    onSetPriority(entry.index, "high");
                    break;
                case "priority_normal":
                    onSetPriority(entry.index, "normal");
                    break;
                case "priority_low":
                    onSetPriority(entry.index, "low");
                    break;
                default:
                    break;
            }
        },
        [onSetPriority],
    );

    // 4. Construct ViewModel
    const viewModel: FileExplorerTreeViewModel = useMemo(() => {
        return {
            files: treeFiles,
            onFilesToggle: handleFilesToggle,
            onFileContextAction: handleFileContextAction,
        };
    }, [treeFiles, handleFilesToggle, handleFileContextAction]);

    // 5. Render
    return (
        <div className="h-full w-full min-h-0  rounded-xl overflow-hidden shadow-inner">
            <FileExplorerTree viewModel={viewModel} />
        </div>
    );
};
