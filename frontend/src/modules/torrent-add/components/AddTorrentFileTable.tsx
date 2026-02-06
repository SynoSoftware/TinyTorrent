import React, { useMemo, useCallback } from "react";
import {
    FileExplorerTree,
    type FileExplorerTreeViewModel,
    type FileExplorerContextAction,
    type FileExplorerEntry,
} from "@/shared/ui/workspace/FileExplorerTree";
import type {
    TorrentFileEntity,
    LibtorrentPriority,
} from "@/services/rpc/entities";
import type {
    FileRow,
    FilePriority,
    SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";
import type { RowSelectionState } from "@tanstack/react-table";

// Adapter types to match the legacy table props without breaking parent
export interface AddTorrentFileTableProps {
    layoutEnabled: boolean;
    state: {
        files: FileRow[];
        filteredFiles: FileRow[]; // Ignored in favor of tree's internal search
        priorities: Map<number, FilePriority>;
        resolvedState: "pending" | "ready" | "error";
        rowHeight: number;
        selectedCount: number;
        selectedSize: number;
    };
    actions: {
        onCyclePriority: (index: number) => void;
        onRowClick: (index: number, shiftKey: boolean) => void;
        onRowSelectionChange: (
            next:
                | RowSelectionState
                | ((prev: RowSelectionState) => RowSelectionState),
        ) => void;
        onSetPriority: (index: number, value: FilePriority) => void;
        onSmartSelect: (command: SmartSelectCommand) => void;
    };
    rowSelection: RowSelectionState;
}

const PRIORITY_MAP: Record<FilePriority, LibtorrentPriority> = {
    low: 1,
    normal: 4, // Assuming 4 is normal default in libtorrent/app
    high: 7,
};

export const AddTorrentFileTable = ({
    state,
    actions,
    rowSelection,
}: AddTorrentFileTableProps) => {
    const { files, priorities } = state;

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
        (indexes: number[], wanted: boolean) => {
            actions.onRowSelectionChange((prev) => {
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
        },
        [actions],
    );

    // 3. Adapt Context Menu / Priority Actions
    const handleFileContextAction = useCallback(
        (action: FileExplorerContextAction, entry: FileExplorerEntry) => {
            switch (action) {
                case "priority_high":
                    actions.onSetPriority(entry.index, "high");
                    break;
                case "priority_normal":
                    actions.onSetPriority(entry.index, "normal");
                    break;
                case "priority_low":
                    actions.onSetPriority(entry.index, "low");
                    break;
                default:
                    break;
            }
        },
        [actions],
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
    // We wrap in a nice container.
    // Note: We ignore 'filteredFiles' and 'layoutEnabled' as the Tree handles its own virtualization and filtering.
    // The parent (AddTorrentModal) search input will have no effect on this component now,
    // but the component has its own internal search.
    return (
        <div className="h-full w-full min-h-0  rounded-xl overflow-hidden shadow-inner">
            <FileExplorerTree viewModel={viewModel} />
        </div>
    );
};
