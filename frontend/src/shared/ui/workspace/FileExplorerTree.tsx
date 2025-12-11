import { Checkbox } from "@heroui/react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { useMemo, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../utils/format";
import type { LibtorrentPriority } from "../../../services/rpc/entities";
import { ICON_STROKE_WIDTH } from "../../../config/logic";

export interface FileExplorerEntry {
    name: string;
    index: number;
    length?: number;
    progress?: number;
    wanted?: boolean;
    priority?: LibtorrentPriority;
}

interface FileExplorerTreeProps {
    files: FileExplorerEntry[];
    emptyMessage?: string;
    onFilesToggle?: (
        indexes: number[],
        wanted: boolean
    ) => void | Promise<void>;
}

type FileExplorerNode = {
    id: string;
    name: string;
    isFolder: boolean;
    children?: FileExplorerNode[];
    indexes?: number[];
    file?: FileExplorerEntry;
};

const buildFileTree = (entries: FileExplorerEntry[]): FileExplorerNode[] => {
    if (!entries.length) return [];
    const root: FileExplorerNode[] = [];
    entries.forEach((entry) => {
        const normalizedPath = entry.name
            .replace(/\\/g, "/")
            .replace(/^\/+/, "");
        const segments = normalizedPath.split("/").filter(Boolean);
        if (!segments.length) return;
        let currentList = root;
        let currentPath = "";
        segments.forEach((segment, idx) => {
            const isLeaf = idx === segments.length - 1;
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            let node = currentList.find(
                (candidate) =>
                    candidate.name === segment && candidate.isFolder === !isLeaf
            );
            if (!node) {
                node = {
                    id: currentPath,
                    name: segment,
                    isFolder: !isLeaf,
                    children: !isLeaf ? [] : undefined,
                    indexes: !isLeaf ? [] : undefined,
                    file: isLeaf ? entry : undefined,
                };
                currentList.push(node);
            }
            if (!isLeaf) {
                node.indexes?.push(entry.index);
                currentList = node.children!;
            }
        });
    });
    return root;
};

const PRIORITY_BADGE_BASE =
    "text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full";
const PRIORITY_LABELS: Record<LibtorrentPriority, string> = {
    0: "Do Not Download",
    1: "Low Priority",
    2: "Priority 2",
    3: "Priority 3",
    4: "Default",
    5: "Priority 5",
    6: "Priority 6",
    7: "Top Priority",
};
const PRIORITY_BADGE_CLASSES: Record<LibtorrentPriority, string> = {
    0: "bg-danger/10 text-danger border border-danger/40",
    1: "bg-foreground/5 text-foreground/70 border border-content1/20",
    2: "bg-foreground/5 text-foreground/70 border border-content1/20",
    3: "bg-warning/10 text-warning",
    4: "bg-foreground/10 text-foreground/80 border border-content1/20",
    5: "bg-primary/10 text-primary",
    6: "bg-primary/20 text-primary",
    7: "bg-success/10 text-success",
};

type VisibleNode = {
    id: string;
    depth: number;
    node: FileExplorerNode;
};

const flattenVisibleNodes = (
    nodes: FileExplorerNode[],
    expanded: Record<string, boolean>,
    depth = 0
): VisibleNode[] => {
    const result: VisibleNode[] = [];
    nodes.forEach((node) => {
        result.push({ id: node.id, depth, node });
        if (node.isFolder && expanded[node.id] && node.children?.length) {
            result.push(
                ...flattenVisibleNodes(node.children, expanded, depth + 1)
            );
        }
    });
    return result;
};

const ROW_HEIGHT = 32;

export function FileExplorerTree({
    files,
    emptyMessage,
    onFilesToggle,
}: FileExplorerTreeProps) {
    const selectionMap = useMemo(() => {
        const map = new Map<number, boolean>();
        files.forEach((file) => {
            map.set(file.index, file.wanted ?? true);
        });
        return map;
    }, [files]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggleExpanded = useCallback((id: string) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const visibleNodes = useMemo(() => {
        const tree = buildFileTree(files);
        return flattenVisibleNodes(tree, expanded);
    }, [files, expanded]);

    const handleFileToggle = useCallback(
        (index: number, wanted: boolean) => {
            onFilesToggle?.([index], wanted);
        },
        [onFilesToggle]
    );

    const handleFolderToggle = useCallback(
        (node: FileExplorerNode) => {
            const indexes = node.indexes ?? [];
            if (!indexes.length) return;
            const allSelected = indexes.every((index) =>
                selectionMap.get(index)
            );
            onFilesToggle?.(indexes, !allSelected);
        },
        [onFilesToggle, selectionMap]
    );

    const containerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 6,
        getItemKey: (index) => visibleNodes[index]?.id ?? index,
    });

    if (!files.length) {
        return (
            <div className="rounded-xl border border-content1/20 bg-content1/15 p-4 text-xs text-foreground/50 text-center">
                {emptyMessage ?? "No files available."}
            </div>
        );
    }

    if (!visibleNodes.length) {
        return (
            <div className="rounded-xl border border-content1/20 bg-content1/15 p-4 text-xs text-foreground/50 text-center">
                {emptyMessage ?? "No files available."}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative h-full overflow-y-auto">
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const { node, depth } = visibleNodes[virtualRow.index];
                    const paddingLeft = depth * 16 + 8;
                    const isFolder = node.isFolder;
                    const rowKey = `${node.id}-${virtualRow.index}`;
                    if (isFolder) {
                        const indexes = node.indexes ?? [];
                        const count = indexes.length;
                        const allSelected =
                            count > 0 &&
                            indexes.every((index) => selectionMap.get(index));
                        const someSelected = indexes.some((index) =>
                            selectionMap.get(index)
                        );
                        const isExpanded = Boolean(expanded[node.id]);
                        return (
                            <div
                                key={rowKey}
                                className="absolute left-0 right-0"
                                style={{
                                    top: virtualRow.start,
                                    height: virtualRow.size,
                                }}
                            >
                                <div
                                    className="flex items-center gap-2 py-2 cursor-pointer hover:bg-content1/10 rounded pl-1 h-full"
                                    style={{ paddingLeft }}
                                    onClick={(event) => {
                                        if (
                                            (event.target as Element).closest(
                                                "button"
                                            )
                                        )
                                            return;
                                        handleFolderToggle(node);
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleExpanded(node.id);
                                        }}
                                        className="flex items-center justify-center rounded-full p-1 text-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                    >
                                        {isExpanded ? (
                                            <ChevronDown
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className="text-current"
                                            />
                                        ) : (
                                            <ChevronRight
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className="text-current"
                                            />
                                        )}
                                    </button>
                                    <div
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        <Checkbox
                                            isSelected={allSelected}
                                            isIndeterminate={
                                                someSelected && !allSelected
                                            }
                                            onValueChange={() =>
                                                handleFolderToggle(node)
                                            }
                                            classNames={{ wrapper: "m-0" }}
                                        />
                                    </div>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggleExpanded(node.id);
                                            }}
                                            className="flex items-center justify-center rounded-full p-1 text-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                        >
                                            <Folder
                                                size={16}
                                                strokeWidth={ICON_STROKE_WIDTH}
                                                className="text-current"
                                            />
                                        </button>
                                    <div className="flex flex-col text-sm font-medium text-foreground leading-tight">
                                        <span className="text-foreground">
                                            {node.name}
                                        </span>
                                        <span className="text-[11px] text-foreground/50">
                                            {count} file{count === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    if (!node.file) return null;
                    const fileWanted =
                        selectionMap.get(node.file.index) ?? true;
                    const priorityLabel =
                        node.file.priority !== undefined
                            ? PRIORITY_LABELS[node.file.priority]
                            : null;
                    const priorityBadgeClass =
                        node.file.priority !== undefined
                            ? `${PRIORITY_BADGE_BASE} ${
                                  PRIORITY_BADGE_CLASSES[node.file.priority]
                              }`
                            : "";
                    return (
                        <div
                            key={rowKey}
                            className="absolute left-0 right-0"
                            style={{
                                top: virtualRow.start,
                                height: virtualRow.size,
                            }}
                        >
                            <div
                                className="flex items-center gap-2 py-2 rounded hover:bg-content1/10 cursor-pointer h-full"
                                style={{ paddingLeft }}
                                onClick={() =>
                                    handleFileToggle(
                                        node.file!.index,
                                        !fileWanted
                                    )
                                }
                            >
                                <div
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <Checkbox
                                        isSelected={fileWanted}
                                        onValueChange={(value) =>
                                            handleFileToggle(
                                                node.file!.index,
                                                Boolean(value)
                                            )
                                        }
                                        classNames={{ wrapper: "m-0" }}
                                    />
                                </div>
                                <FileText
                                    size={16}
                                    strokeWidth={ICON_STROKE_WIDTH}
                                    className="text-foreground/50"
                                />
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <span className="text-sm font-medium text-foreground truncate">
                                        {node.name}
                                    </span>
                                    {priorityLabel && (
                                        <span className={priorityBadgeClass}>
                                            {priorityLabel}
                                        </span>
                                    )}
                                </div>
                                {typeof node.file.length === "number" &&
                                    node.file.length > 0 && (
                                        <span className="text-[11px] font-mono text-foreground/50">
                                            {formatBytes(node.file.length)}
                                        </span>
                                    )}
                                {typeof node.file.progress === "number" && (
                                    <span className="text-[11px] font-mono text-foreground/40">
                                        {(node.file.progress * 100).toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
