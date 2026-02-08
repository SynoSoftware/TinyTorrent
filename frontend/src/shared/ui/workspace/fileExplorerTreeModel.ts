import type {
    FileExplorerEntry,
    FileExplorerFilterMode,
    FileNode,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";

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
            node.bytesCompleted += entry.bytesCompleted || 0;
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
