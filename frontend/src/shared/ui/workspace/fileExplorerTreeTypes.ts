import type {
    LibtorrentPriority,
    TorrentFileEntity,
} from "@/services/rpc/entities";

export type FileExplorerEntry = TorrentFileEntity;

export type FileExplorerContextAction =
    | "priority_high"
    | "priority_normal"
    | "priority_low"
    | "open_file"
    | "open_folder";

export type FileExplorerToggleOutcome =
    | { status: "success" }
    | {
          status: "unsupported";
          reason: "missing_handler" | "action_not_supported";
      }
    | { status: "failed"; reason: "execution_failed" };

export type FileExplorerToggleCommand = (
    indexes: number[],
    wanted: boolean,
) => Promise<FileExplorerToggleOutcome> | FileExplorerToggleOutcome;

export interface FileExplorerTreeViewModel {
    files: FileExplorerEntry[];
    wantedByIndex?: ReadonlyMap<number, boolean>;
    priorityByIndex?: ReadonlyMap<number, LibtorrentPriority>;
    emptyMessage?: string;
    onFilesToggle: FileExplorerToggleCommand;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry,
    ) => void;
}

export type FileExplorerFilterMode = "all" | "video" | "audio";

export interface FileNode {
    id: string;
    name: string;
    path: string;
    isFolder: boolean;
    depth: number;
    fileIndex?: number;
    fileEntry?: FileExplorerEntry;
    children: FileNode[];
    descendantIndexes: number[];
    totalSize: number;
    bytesCompleted: number;
}

export interface FileNodeRowViewModel {
    node: FileNode;
    isExpanded: boolean;
    isSelected: boolean;
    isIndeterminate: boolean;
    isWanted: boolean;
    priority: LibtorrentPriority;
}
