import type { EngineAdapter } from "./engine-adapter";
import type {
    DirectoryBrowseResult,
    DirectoryNode,
    TransmissionFreeSpace,
} from "./types";

const GB = 1024 * 1024 * 1024;

export type DirectoryNodeType = DirectoryNode["type"];

const MOCK_DIRECTORY_TREE: DirectoryNode[] = [
    {
        name: "System (C:)",
        path: "C:/",
        type: "drive",
        totalBytes: 512 * GB,
        freeBytes: 138 * GB,
        children: [
            {
                name: "Downloads",
                path: "C:/Downloads",
                type: "folder",
                children: [
                    {
                        name: "Torrents",
                        path: "C:/Downloads/Torrents",
                        type: "folder",
                    },
                    {
                        name: "Incoming",
                        path: "C:/Downloads/Incoming",
                        type: "folder",
                    },
                ],
            },
            {
                name: "Program Files",
                path: "C:/Program Files",
                type: "folder",
            },
            {
                name: "Users",
                path: "C:/Users",
                type: "folder",
                children: [
                    {
                        name: "Public",
                        path: "C:/Users/Public",
                        type: "folder",
                    },
                ],
            },
        ],
    },
    {
        name: "Media (D:)",
        path: "D:/",
        type: "drive",
        totalBytes: 1024 * GB,
        freeBytes: 472 * GB,
        children: [
            {
                name: "Movies",
                path: "D:/Movies",
                type: "folder",
                children: [
                    {
                        name: "4K",
                        path: "D:/Movies/4K",
                        type: "folder",
                    },
                    {
                        name: "BluRay",
                        path: "D:/Movies/BluRay",
                        type: "folder",
                    },
                ],
            },
            {
                name: "Music",
                path: "D:/Music",
                type: "folder",
            },
        ],
    },
];

const normalizePath = (value?: string) => {
    if (!value) return "";
    let normalized = value.replace(/\\/g, "/");
    normalized = normalized.replace(/\/+/g, "/");
    if (normalized.match(/^[A-Za-z]:$/)) {
        normalized = `${normalized}/`;
    }
    const isDriveRoot = Boolean(normalized.match(/^[A-Za-z]:\/$/));
    if (
        normalized.length > 0 &&
        normalized[normalized.length - 1] === "/" &&
        !isDriveRoot
    ) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
};

const getParentPath = (path: string) => {
    const normalized = normalizePath(path);
    if (!normalized) return "";
    if (normalized.match(/^[A-Za-z]:\/?$/)) {
        return "";
    }
    const segments = normalized.split("/");
    segments.pop(); // drop current segment
    while (segments.length && segments[segments.length - 1] === "") {
        segments.pop();
    }
    if (!segments.length) return "";
    const parent = segments.join("/");
    if (parent.match(/^[A-Za-z]:$/)) {
        return `${parent}/`;
    }
    return parent;
};

const findNodeByPath = (
    path: string,
    nodes: DirectoryNode[]
): DirectoryNode | null => {
    for (const node of nodes) {
        if (normalizePath(node.path) === path) {
            return node;
        }
        if (node.children) {
            const match = findNodeByPath(path, node.children);
            if (match) {
                return match;
            }
        }
    }
    return null;
};

const findClosestNode = (path: string): DirectoryNode | null => {
    if (!path) return null;
    let current = path;
    while (current) {
        const node = findNodeByPath(current, MOCK_DIRECTORY_TREE);
        if (node) return node;
        current = getParentPath(current);
    }
    return null;
};

const simulateResponse = <T,>(value: T): Promise<T> => {
    const delay = 80 + Math.random() * 120;
    return new Promise((resolve) => {
        window.setTimeout(() => resolve(value), delay);
    });
};

const buildDirectoryBrowseResult = (
    node: DirectoryNode | null
): DirectoryBrowseResult => ({
    path: node?.path ?? "",
    parentPath: node ? getParentPath(node.path) : "",
    separator: "/",
    entries: node?.children ?? MOCK_DIRECTORY_TREE,
});

export async function browseDirectories(
    client: EngineAdapter | null,
    targetPath?: string,
    options?: { useExtension?: boolean; allowMock?: boolean }
): Promise<DirectoryBrowseResult> {
    const normalized = normalizePath(targetPath);
    const useExtension = options?.useExtension ?? true;
    const allowMock = options?.allowMock ?? false;
    if (useExtension && client?.browseDirectory) {
        try {
            return await client.browseDirectory(
                normalized.length > 0 ? normalized : undefined
            );
        } catch (error) {
            console.error("[tiny-torrent][fs-browse]", error);
        }
    }
    if (!allowMock) {
        throw new Error("fs-browse is unavailable without Extension Mode");
    }
    const node = findClosestNode(normalized);
    return simulateResponse(buildDirectoryBrowseResult(node));
}

export async function getDriveSpace(
    client: EngineAdapter | null,
    path: string,
    options?: { useExtension?: boolean; allowMock?: boolean }
): Promise<TransmissionFreeSpace> {
    const useExtension = options?.useExtension ?? true;
    const allowMock = options?.allowMock ?? false;
    if (useExtension && client?.checkFreeSpace) {
        try {
            return await client.checkFreeSpace(path);
        } catch (error) {
            console.error("[tiny-torrent][free-space]", error);
        }
    }
    if (!allowMock) {
        throw new Error("free-space is unavailable without Extension Mode");
    }
    const normalized = normalizePath(path);
    const node = findClosestNode(normalized);
    const total = node?.totalBytes ?? 250 * GB;
    const free = Math.max((node?.freeBytes ?? total * 0.45), 0);
    return simulateResponse({
        path: node?.path ?? normalized,
        sizeBytes: free,
        totalSize: total,
    });
}
