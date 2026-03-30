import { useMemo, useCallback } from "react";
import {
    FileExplorerTree,
    type FileExplorerTreeViewModel,
    type FileExplorerToggleOutcome,
} from "@/shared/ui/workspace/FileExplorerTree";
import {
    fileExplorerPriorityValues,
    getFileExplorerPriorityKey,
} from "@/shared/ui/workspace/fileExplorerTreeModel";
import type {
    TorrentFileEntity,
    LibtorrentPriority,
} from "@/services/rpc/entities";
import type {
    FilePriority,
} from "@/modules/torrent-add/services/fileSelection";
import { modal } from "@/shared/ui/layout/glass-surface";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";

export const AddTorrentFileTable = () => {
    const { fileTable } = useAddTorrentModalContext();
    const {
        files,
        onRowSelectionChange,
        onSetPriority,
        priorities,
        rowSelection,
    } = fileTable;

    const treeFiles: TorrentFileEntity[] = useMemo(
        () =>
            files.map((file) => ({
                index: file.index,
                name: file.path,
                length: file.length,
                bytesCompleted: 0,
                progress: 0,
                priority: fileExplorerPriorityValues.normal,
                wanted: true,
            })),
        [files],
    );

    const wantedByIndex = useMemo(() => {
        const next = new Map<number, boolean>();
        for (const [indexKey, wanted] of Object.entries(rowSelection)) {
            if (!wanted) continue;
            const index = Number(indexKey);
            if (Number.isFinite(index)) {
                next.set(index, true);
            }
        }
        return next;
    }, [rowSelection]);

    const priorityByIndex = useMemo(() => {
        const next = new Map<number, LibtorrentPriority>();
        for (const [index, priority] of priorities.entries()) {
            next.set(index, fileExplorerPriorityValues[priority]);
        }
        return next;
    }, [priorities]);

    const handleFilesToggle = useCallback(
        (indexes: number[], wanted: boolean): FileExplorerToggleOutcome => {
            onRowSelectionChange((prev) => {
                const next = { ...prev };
                for (const idx of indexes) {
                    if (wanted) {
                        next[idx] = true;
                    } else {
                        delete next[idx];
                    }
                }
                return next;
            });
            return { status: "success" };
        },
        [onRowSelectionChange],
    );

    const handleSetPriority = useCallback(
        (indexes: number[], priority: LibtorrentPriority) => {
            const nextPriority = getFileExplorerPriorityKey(priority, true) as FilePriority;
            indexes.forEach((index) => {
                onSetPriority(index, nextPriority);
            });
        },
        [onSetPriority],
    );

    const viewModel: FileExplorerTreeViewModel = useMemo(
        () => ({
            files: treeFiles,
            wantedByIndex,
            priorityByIndex,
            showProgress: false,
            onFilesToggle: handleFilesToggle,
            onSetPriority: handleSetPriority,
        }),
        [
            treeFiles,
            wantedByIndex,
            priorityByIndex,
            handleFilesToggle,
            handleSetPriority,
        ],
    );

    return (
        <div className={modal.workflow.fileTableShell}>
            <FileExplorerTree viewModel={viewModel} />
        </div>
    );
};
