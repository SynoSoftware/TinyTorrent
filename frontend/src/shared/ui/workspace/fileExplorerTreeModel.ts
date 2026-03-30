import type {
    FileExplorerEntry,
    FileExplorerFilterMode,
    FileNode,
    FileExplorerPrioritySelectKey,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";
import type { LibtorrentPriority } from "@/services/rpc/entities";

export const fileExplorerPriorityValues = {
    high: 7 as LibtorrentPriority,
    normal: 4 as LibtorrentPriority,
    low: 1 as LibtorrentPriority,
} as const;

const fileExplorerSelectablePriorityKeys = {
    file: ["high", "normal", "low", "skip"],
    folder: ["high", "normal", "low"],
} as const satisfies Record<string, readonly FileExplorerPrioritySelectKey[]>;

const fileExplorerPriorityThresholds = {
    high: 6,
    low: 2,
} as const;

export const getFileExplorerPriorityKey = (
    priority: LibtorrentPriority,
    isWanted: boolean,
): FileExplorerPrioritySelectKey => {
    if (!isWanted) return "skip";
    if (priority >= fileExplorerPriorityThresholds.high) return "high";
    if (priority <= fileExplorerPriorityThresholds.low) return "low";
    return "normal";
};

export const getFileExplorerSelectablePriorityKeys = (
    isFolder: boolean,
): readonly FileExplorerPrioritySelectKey[] =>
    isFolder
        ? fileExplorerSelectablePriorityKeys.folder
        : fileExplorerSelectablePriorityKeys.file;

export const getFileExplorerPrioritySelection = (
    indexes: readonly number[],
    priorityByIndex: ReadonlyMap<number, LibtorrentPriority>,
    wantedByIndex: ReadonlyMap<number, boolean>,
    allowsSkipPriority: boolean,
): Set<FileExplorerPrioritySelectKey> => {
    const keys = new Set<FileExplorerPrioritySelectKey>();
    for (const index of indexes) {
        const priority = priorityByIndex.get(index) ?? fileExplorerPriorityValues.normal;
        const key = getFileExplorerPriorityKey(priority, Boolean(wantedByIndex.get(index)));
        keys.add(key);
        if (keys.size > 1) {
            return new Set<FileExplorerPrioritySelectKey>();
        }
    }

    if (!keys.size) {
        return new Set<FileExplorerPrioritySelectKey>();
    }

    const [key] = keys;
    if (!allowsSkipPriority && key === "skip") {
        return new Set<FileExplorerPrioritySelectKey>();
    }

    return new Set<FileExplorerPrioritySelectKey>([key]);
};

const VIDEO_FILE_PATTERN = /\.(mp4|mkv|avi|mov|wmv)$/i;
const AUDIO_FILE_PATTERN = /\.(mp3|aac|flac|wav)$/i;

const matchesFilterMode = (
    entry: FileExplorerEntry,
    filterMode: FileExplorerFilterMode,
): boolean => {
    if (filterMode === "video") {
        return VIDEO_FILE_PATTERN.test(entry.name);
    }
    if (filterMode === "audio") {
        return AUDIO_FILE_PATTERN.test(entry.name);
    }
    return true;
};

export const filterEntries = (
    entries: FileExplorerEntry[],
    searchQuery: string,
    filterMode: FileExplorerFilterMode,
): FileExplorerEntry[] => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
        if (
            normalizedQuery &&
            !entry.name.toLowerCase().includes(normalizedQuery)
        ) {
            return false;
        }
        return matchesFilterMode(entry, filterMode);
    });
};

export const buildTree = (entries: FileExplorerEntry[]): FileNode[] => {
    const rootNodes: FileNode[] = [];
    const nodeByPath = new Map<string, FileNode>();

    entries.forEach((entry) => {
        const normalizedPath = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
        const pathParts = normalizedPath.split("/").filter(Boolean);

        let currentPath = "";
        for (let index = 0; index < pathParts.length; index += 1) {
            const part = pathParts[index];
            const isLeaf = index === pathParts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            let node = nodeByPath.get(currentPath);
            if (!node) {
                node = {
                    id: currentPath,
                    name: part,
                    path: currentPath,
                    isFolder: !isLeaf,
                    depth: index,
                    fileIndex: isLeaf ? entry.index : undefined,
                    fileEntry: isLeaf ? entry : undefined,
                    children: [],
                    descendantIndexes: [],
                    totalSize: 0,
                    bytesCompleted: 0,
                    progress: 0,
                };
                nodeByPath.set(currentPath, node);

                if (index === 0) {
                    rootNodes.push(node);
                } else {
                    const parentPath = pathParts.slice(0, index).join("/");
                    const parentNode = nodeByPath.get(parentPath);
                    if (parentNode) {
                        parentNode.children.push(node);
                    }
                }
            }

            node.totalSize += entry.length || 0;
            const entryBytesCompleted =
                typeof entry.bytesCompleted === "number"
                    ? entry.bytesCompleted
                    : typeof entry.progress === "number" && typeof entry.length === "number"
                      ? Math.min(Math.max(entry.progress, 0), 1) * entry.length
                      : 0;
            node.bytesCompleted += entryBytesCompleted;
            node.descendantIndexes.push(entry.index);
        }
    });

    const sortNodes = (nodes: FileNode[]) => {
        nodes.sort((a, b) => {
            if (a.isFolder !== b.isFolder) {
                return a.isFolder ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        nodes.forEach((node) => {
            if (node.children.length > 0) {
                sortNodes(node.children);
            }
        });
    };

    sortNodes(rootNodes);

    const annotateProgress = (nodes: FileNode[]) => {
        nodes.forEach((node) => {
            node.progress =
                node.totalSize > 0
                    ? Math.min((node.bytesCompleted / node.totalSize) * 100, 100)
                    : 0;
            if (node.children.length > 0) {
                annotateProgress(node.children);
            }
        });
    };

    annotateProgress(rootNodes);

    return rootNodes;
};

export const flattenTree = (
    nodes: FileNode[],
    expandedIds: Set<string>,
    visibleNodes: FileNode[] = [],
): FileNode[] => {
    nodes.forEach((node) => {
        visibleNodes.push(node);
        if (node.isFolder && expandedIds.has(node.id)) {
            flattenTree(node.children, expandedIds, visibleNodes);
        }
    });
    return visibleNodes;
};

export const collectFolderIds = (nodes: FileNode[]): Set<string> => {
    const ids = new Set<string>();
    const traverse = (items: FileNode[]) => {
        items.forEach((node) => {
            if (!node.isFolder) return;
            ids.add(node.id);
            traverse(node.children);
        });
    };
    traverse(nodes);
    return ids;
};
