import { useMemo, useCallback } from "react";
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
import { MODAL } from "@/shared/ui/layout/glass-surface";
import { useAddTorrentModalContext } from "@/modules/torrent-add/components/AddTorrentModalContext";

const PRIORITY_MAP: Record<FilePriority, LibtorrentPriority> = {
    low: 1,
    normal: 4,
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

    const treeFiles: TorrentFileEntity[] = useMemo(
        () =>
            files.map((file) => ({
                index: file.index,
                name: file.path,
                length: file.length,
                completed: 0,
                progress: 0,
                priority: PRIORITY_MAP.normal,
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
            next.set(index, PRIORITY_MAP[priority]);
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

    const handleFileContextAction = useCallback(
        (action: FileExplorerContextAction, entry: FileExplorerEntry) => {
            if (action === "priority_high") {
                onSetPriority(entry.index, "high");
                return;
            }
            if (action === "priority_normal") {
                onSetPriority(entry.index, "normal");
                return;
            }
            if (action === "priority_low") {
                onSetPriority(entry.index, "low");
            }
        },
        [onSetPriority],
    );

    const viewModel: FileExplorerTreeViewModel = useMemo(
        () => ({
            files: treeFiles,
            wantedByIndex,
            priorityByIndex,
            onFilesToggle: handleFilesToggle,
            onFileContextAction: handleFileContextAction,
        }),
        [
            treeFiles,
            wantedByIndex,
            priorityByIndex,
            handleFilesToggle,
            handleFileContextAction,
        ],
    );

    return (
        <div className={MODAL.workflow.fileTableShell}>
            <FileExplorerTree viewModel={viewModel} />
        </div>
    );
};
