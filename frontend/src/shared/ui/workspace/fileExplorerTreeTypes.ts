import type {
    TransmissionPriority,
    TorrentFileEntity,
} from "@/services/rpc/entities";

export type FileExplorerEntry = TorrentFileEntity;

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
    priorityByIndex?: ReadonlyMap<number, TransmissionPriority>;
    initialExpandedIds?: readonly string[];
    onExpandedIdsChange?: (expandedIds: readonly string[]) => void;
    showProgress?: boolean;
    search?: {
        value: string;
        onChange: (value: string) => void;
    };
    emptyMessage?: string;
    onFilesToggle: FileExplorerToggleCommand;
    onSetPriority?: (
        indexes: number[],
        priority: TransmissionPriority,
    ) => Promise<void> | void;
}

export type FileExplorerFilterMode = "all" | "video" | "audio";
export type FileExplorerPrioritySelectKey = "high" | "normal" | "low";

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
    progress: number;
}

export interface FileNodeRowViewModel {
    node: FileNode;
    isExpanded: boolean;
    isWanted: boolean;
    isIndeterminate: boolean;
    prioritySelection: ReadonlySet<FileExplorerPrioritySelectKey>;
    priorityTargetIndexes: readonly number[];
    isPriorityEnabled: boolean;
}
