import {
    Button,
    ButtonGroup,
    Checkbox,
    Chip,
    cn,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Progress,
} from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    File as FileIcon,
    FileAudio,
    FileImage,
    FileText,
    FileVideo,
    Filter,
    Folder,
    Minus,
    Search,
    X,
} from "lucide-react";
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";

import type {
    LibtorrentPriority,
    TorrentFileEntity,
} from "@/services/rpc/entities";
import { formatBytes } from "@/shared/utils/format";

// -- TYPES --

// Re-export for compatibility
export type FileExplorerEntry = TorrentFileEntity;

export type FileExplorerContextAction =
    | "priority_high"
    | "priority_normal"
    | "priority_low"
    | "open_file"
    | "open_folder";

export interface FileExplorerTreeViewModel {
    files: FileExplorerEntry[];
    emptyMessage?: string;
    onFilesToggle?: (indexes: number[], wanted: boolean) => void;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry,
    ) => void;
}

interface FileExplorerTreeProps {
    viewModel: FileExplorerTreeViewModel;
}

// Internal Node Structure
type FileNode = {
    id: string; // Path-based unique ID
    name: string;
    path: string;
    isFolder: boolean;
    depth: number;
    // For leaf nodes:
    fileIndex?: number;
    fileEntry?: FileExplorerEntry;
    // For folder nodes:
    children: FileNode[];
    descendantIndexes: number[]; // All file indexes under this folder
    totalSize: number;
    bytesCompleted: number;
};

// -- HELPERS --

const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext || ""))
        return <FileVideo className="w-4 h-4 text-primary" />;
    if (["mp3", "wav", "flac", "aac"].includes(ext || ""))
        return <FileAudio className="w-4 h-4 text-warning" />;
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || ""))
        return <FileImage className="w-4 h-4 text-success" />;
    if (["txt", "md", "pdf", "doc", "docx"].includes(ext || ""))
        return <FileText className="w-4 h-4 text-default-500" />;
    return <FileIcon className="w-4 h-4 text-default-400" />;
};

const buildTreeRecursive = (entries: FileExplorerEntry[]): FileNode[] => {
    const rootNodes: FileNode[] = [];
    const levelMap = new Map<string, FileNode>();

    entries.forEach((entry) => {
        const path = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
        const parts = path.split("/").filter(Boolean);

        let currentPath = "";

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLeaf = i === parts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            let node = levelMap.get(currentPath);

            if (!node) {
                node = {
                    id: currentPath,
                    name: part,
                    path: currentPath,
                    isFolder: !isLeaf,
                    depth: i, // 0-based depth
                    children: [],
                    descendantIndexes: [],
                    totalSize: 0,
                    bytesCompleted: 0,
                    fileIndex: isLeaf ? entry.index : undefined,
                    fileEntry: isLeaf ? entry : undefined,
                };
                levelMap.set(currentPath, node);

                // Add to parent
                if (i === 0) {
                    rootNodes.push(node);
                } else {
                    const parentPath = parts.slice(0, i).join("/");
                    const parent = levelMap.get(parentPath);
                    if (parent) {
                        parent.children.push(node);
                    }
                }
            }

            // Updates
            if (entry.length) node.totalSize += entry.length;
            if (entry.bytesCompleted)
                node.bytesCompleted += entry.bytesCompleted;
            node.descendantIndexes.push(entry.index);
        }
    });

    // Sort: Folders first, then files (A-Z)
    const sortNodes = (nodes: FileNode[]) => {
        nodes.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        nodes.forEach((n) => {
            if (n.children.length > 0) sortNodes(n.children);
        });
    };
    sortNodes(rootNodes);

    return rootNodes;
};

const flattenTree = (
    nodes: FileNode[],
    expandedIds: Set<string>,
    visibleNodes: FileNode[] = [],
) => {
    for (const node of nodes) {
        visibleNodes.push(node);
        if (node.isFolder && expandedIds.has(node.id)) {
            flattenTree(node.children, expandedIds, visibleNodes);
        }
    }
    return visibleNodes;
};

// -- COMPONENT --

export const FileExplorerTree = memo(function FileExplorerTree({
    viewModel,
}: FileExplorerTreeProps) {
    const { files, onFilesToggle, onFileContextAction } = viewModel;
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);

    // Filter Logic
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyFeatures, setShowOnlyFeatures] = useState<
        "all" | "video" | "audio"
    >("all");

    // Tree State
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const toggleExpand = useCallback((id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        const allIds = new Set<string>();
        const traverse = (nodes: FileNode[]) => {
            nodes.forEach((n) => {
                if (n.isFolder) {
                    allIds.add(n.id);
                    traverse(n.children);
                }
            });
        };
        // Re-build clean tree
        traverse(buildTreeRecursive(files));
        setExpandedIds(allIds);
    }, [files]);

    const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

    // Filtered Files -> Tree Calculation
    const { visibleNodes } = useMemo(() => {
        let filtered = files;

        // 1. Text Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter((f) => f.name.toLowerCase().includes(q));
        }

        // 2. Type Filter
        if (showOnlyFeatures === "video") {
            filtered = filtered.filter((f) =>
                /\.(mp4|mkv|avi|mov|wmv)$/i.test(f.name),
            );
        } else if (showOnlyFeatures === "audio") {
            filtered = filtered.filter((f) =>
                /\.(mp3|aac|flac|wav)$/i.test(f.name),
            );
        }

        // 3. Build Tree
        const roots = buildTreeRecursive(filtered);

        // 4. Flatten based on expansion
        // If searching, auto-expand
        if (searchQuery.trim() || showOnlyFeatures !== "all") {
            const allIds = new Set<string>();
            const traverse = (nodes: FileNode[]) => {
                nodes.forEach((n) => {
                    if (n.isFolder) {
                        allIds.add(n.id);
                        traverse(n.children);
                    }
                });
            };
            traverse(roots);
            const flat = flattenTree(roots, allIds);
            return { visibleNodes: flat };
        }

        const flat = flattenTree(roots, expandedIds);
        return { visibleNodes: flat };
    }, [files, searchQuery, showOnlyFeatures, expandedIds]);

    // Selection State
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
        new Set(),
    );

    // Map of fileIndex -> wanted status
    const fileWantedMap = useMemo(() => {
        const map = new Map<number, boolean>();
        files.forEach((f) => map.set(f.index, f.wanted ?? true));
        return map;
    }, [files]);

    useEffect(() => {
        const next = new Set<number>();
        fileWantedMap.forEach((wanted, index) => {
            if (wanted) next.add(index);
        });
        setSelectedIndexes(next);
    }, [fileWantedMap]);

    const filePriorityMap = useMemo(() => {
        const map = new Map<number, LibtorrentPriority>();
        files.forEach((f) => map.set(f.index, f.priority ?? 4)); // Default 4 (Normal)
        return map;
    }, [files]);

    const handleSelectionChange = useCallback(
        (indexes: number[], mode: "toggle" | "select" | "deselect") => {
            setSelectedIndexes((prev) => {
                const next = new Set(prev);
                indexes.forEach((idx) => {
                    if (mode === "toggle") {
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                    } else if (mode === "select") {
                        next.add(idx);
                    } else {
                        next.delete(idx);
                    }
                });
                return next;
            });
        },
        [],
    );

    const handleSelectAll = useCallback(
        (v: boolean) => {
            if (!v) {
                setSelectedIndexes(new Set());
                return;
            }
            const allIndexes = visibleNodes.flatMap((n) => n.descendantIndexes);
            setSelectedIndexes(new Set(allIndexes));
        },
        [visibleNodes],
    );

    // Actions
    const handleSetPriority = useCallback(
        (priority: LibtorrentPriority | "skip", targetIndexes?: number[]) => {
            const indexesToUpdate =
                targetIndexes ?? Array.from(selectedIndexes);
            if (indexesToUpdate.length === 0) return;

            if (priority === "skip") {
                // Needed: Unwanted
                onFilesToggle?.(indexesToUpdate, false);
            } else {
                // Needed: Wanted AND Priority
                // 1. Set wanted = true
                onFilesToggle?.(indexesToUpdate, true);

                // 2. Set priority
                const entryMap = new Map(files.map((f) => [f.index, f]));

                let action: FileExplorerContextAction = "priority_normal";
                if (priority >= 6) action = "priority_high";
                if (priority <= 2) action = "priority_low";

                indexesToUpdate.forEach((idx) => {
                    const entry = entryMap.get(idx);
                    if (entry) {
                        onFileContextAction?.(action, entry);
                    }
                });
            }
        },
        [selectedIndexes, files, onFilesToggle, onFileContextAction],
    );

    // Virtualization
    const virtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 36, // Compact Row Height
        overscan: 10,
    });

    // Header Selection State
    // All visible descendants selected?
    const allVisibleIndexes = useMemo(
        () => visibleNodes.flatMap((n) => n.descendantIndexes),
        [visibleNodes],
    );
    const isAllSelected =
        allVisibleIndexes.length > 0 &&
        allVisibleIndexes.every((idx) => selectedIndexes.has(idx));
    const isIndeterminate =
        !isAllSelected &&
        allVisibleIndexes.some((idx) => selectedIndexes.has(idx));

    return (
        <div className="flex flex-col h-full surface-layer-1 rounded-medium border border-default-200/50 overflow-hidden shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-2 border-b border-default-200/50 bg-content1/30">
                <Input
                    classNames={{
                        base: "max-w-[180px] lg:max-w-[240px]",
                        inputWrapper: "h-8 min-h-8 text-small",
                    }}
                    placeholder={t("actions.search")}
                    startContent={
                        <Search className="w-3.5 h-3.5 text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    isClearable
                    size="sm"
                    variant="bordered"
                />

                <Dropdown>
                    <DropdownTrigger>
                        <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            className="min-w-8 w-8 h-8"
                        >
                            <Filter className="w-3.5 h-3.5 text-default-600" />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        selectionMode="single"
                        selectedKeys={new Set([showOnlyFeatures])}
                        onSelectionChange={(k) =>
                            setShowOnlyFeatures(
                                Array.from(k)[0] as "all" | "video" | "audio",
                            )
                        }
                        disallowEmptySelection
                    >
                        <DropdownItem key="all">{t("status.all")}</DropdownItem>
                        <DropdownItem key="video">
                            {t("types.video")}
                        </DropdownItem>
                        <DropdownItem key="audio">
                            {t("types.audio")}
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>

                <div className="h-4 w-px bg-default-300 mx-1" />

                <ButtonGroup size="sm" variant="flat">
                    <Button
                        onPress={expandAll}
                        isIconOnly
                        aria-label={t("actions.expand_all")}
                        className="h-8 w-8 min-w-8"
                    >
                        <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        onPress={collapseAll}
                        isIconOnly
                        aria-label={t("actions.collapse_all")}
                        className="h-8 w-8 min-w-8"
                    >
                        <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                </ButtonGroup>

                <div className="flex-1" />

                <div
                    className={cn(
                        "flex items-center gap-2 transition-opacity duration-200",
                        selectedIndexes.size > 0
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none",
                    )}
                >
                    <span className="text-[10px] text-default-500 font-medium hidden sm:inline-block">
                        {selectedIndexes.size} selected
                    </span>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size="sm"
                                color="primary"
                                variant="flat"
                                endContent={<ChevronDown className="w-3 h-3" />}
                                className="h-8 text-small"
                            >
                                {t("fields.priority")}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            onAction={(k) => {
                                if (k === "high") handleSetPriority(7);
                                if (k === "normal") handleSetPriority(4);
                                if (k === "low") handleSetPriority(1);
                                if (k === "skip") handleSetPriority("skip");
                            }}
                        >
                            <DropdownItem
                                key="high"
                                startContent={
                                    <ArrowUp className="w-4 h-4 text-success" />
                                }
                            >
                                {t("priority.high")}
                            </DropdownItem>
                            <DropdownItem
                                key="normal"
                                startContent={
                                    <Minus className="w-4 h-4 text-primary" />
                                }
                            >
                                {t("priority.normal")}
                            </DropdownItem>
                            <DropdownItem
                                key="low"
                                startContent={
                                    <ArrowDown className="w-4 h-4 text-warning" />
                                }
                            >
                                {t("priority.low")}
                            </DropdownItem>
                            <DropdownItem
                                key="skip"
                                className="text-danger"
                                startContent={<X className="w-4 h-4" />}
                            >
                                {t("priority.dont_download")}
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </div>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[40px_1fr_90px_80px_100px] items-center px-4 py-2 border-b border-default-200/50 bg-default-100/50 text-[10px] font-bold uppercase tracking-wider text-default-500 z-10">
                <div className="flex items-center justify-center">
                    <Checkbox
                        size="sm"
                        isSelected={isAllSelected}
                        isIndeterminate={isIndeterminate}
                        onValueChange={handleSelectAll}
                        classNames={{ wrapper: "after:bg-primary" }}
                    />
                </div>
                <div>{t("fields.name")}</div>
                <div className="text-center">{t("fields.priority")}</div>
                <div className="text-center">{t("fields.progress")}</div>
                <div className="text-right">{t("fields.size")}</div>
            </div>

            {/* Body */}
            <div
                ref={parentRef}
                className="flex-1 overflow-auto min-h-0 relative scrollbar-hide"
            >
                <div
                    className="relative w-full"
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const node = visibleNodes[virtualRow.index];
                        const isNodeSelected = node.descendantIndexes.every(
                            (idx) => selectedIndexes.has(idx),
                        );
                        const isNodeIndeterminate =
                            !isNodeSelected &&
                            node.descendantIndexes.some((idx) =>
                                selectedIndexes.has(idx),
                            );

                        const areAllDescendantsWanted =
                            node.descendantIndexes.every((idx) =>
                                fileWantedMap.get(idx),
                            );
                        const firstIdx = node.descendantIndexes[0];
                        const priority = filePriorityMap.get(firstIdx) || 4;

                        return (
                            <div
                                key={virtualRow.key}
                                className="absolute top-0 left-0 w-full"
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <FileNodeRow
                                    node={node}
                                    depth={node.depth}
                                    isSelected={isNodeSelected}
                                    isIndeterminate={isNodeIndeterminate}
                                    isExpanded={expandedIds.has(node.id)}
                                    isWanted={!!areAllDescendantsWanted}
                                    priority={priority}
                                    onToggleExpand={() => toggleExpand(node.id)}
                                    onSelectionChange={(val) =>
                                        handleSelectionChange(
                                            node.descendantIndexes,
                                            val ? "select" : "deselect",
                                        )
                                    }
                                    onSetPriority={handleSetPriority}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>
                {visibleNodes.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-default-400 gap-2 absolute inset-0">
                        <Search className="w-10 h-10 opacity-20" />
                        <p className="text-small opacity-50">
                            {t("errors.no_results")}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
});

// -- SUB-COMPONENT: ROW --

interface FileNodeRowProps {
    node: FileNode;
    depth: number;
    isSelected: boolean;
    isIndeterminate: boolean;
    isExpanded: boolean;
    isWanted: boolean;
    priority: LibtorrentPriority;
    onToggleExpand: () => void;
    onSelectionChange: (selected: boolean) => void;
    onSetPriority: (p: LibtorrentPriority | "skip", indexes?: number[]) => void;
    t: (k: string) => string;
}

const FileNodeRow = memo(
    ({
        node,
        depth,
        isSelected,
        isIndeterminate,
        isExpanded,
        isWanted,
        priority,
        onToggleExpand,
        onSelectionChange,
        onSetPriority,
        t,
    }: FileNodeRowProps) => {
        // Indentation: clamp max indent to prevent tiny columns on deep nests
        const paddingLeft = `${Math.min(depth * 16, 200)}px`;

        const progress = (node.bytesCompleted / (node.totalSize || 1)) * 100;

        const getPriorityColor = (p: number) => {
            if (!isWanted) return "default";
            if (p >= 6) return "success";
            if (p <= 2) return "warning";
            return "primary";
        };

        const getPriorityLabel = (p: number) => {
            if (!isWanted) return t("priority.skip");
            if (p >= 6) return t("priority.high");
            if (p <= 2) return t("priority.low");
            return t("priority.normal");
        };

        return (
            <div
                className={cn(
                    "grid grid-cols-[40px_1fr_90px_80px_100px] items-center h-full px-4 w-full select-none",
                    "border-b border-default-100/50 hover:bg-default-100/60 transition-colors",
                    !isWanted && "opacity-60 grayscale-[0.5]",
                )}
            >
                {/* Checkbox */}
                <div className="flex items-center justify-center">
                    <Checkbox
                        size="sm"
                        radius="sm"
                        isSelected={isSelected}
                        isIndeterminate={isIndeterminate}
                        onValueChange={onSelectionChange}
                        classNames={{ wrapper: "after:bg-primary" }}
                    />
                </div>

                {/* Name & Tree Structure */}
                <div
                    className="flex items-center overflow-hidden min-w-0 pr-4"
                    style={{ paddingLeft }}
                >
                    {node.isFolder ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand();
                            }}
                            className="mr-1 p-0.5 text-default-400 hover:text-foreground rounded-full hover:bg-default-200/50 transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                        </button>
                    ) : (
                        <div className="w-6" />
                    )}

                    <div className="mr-2 text-default-500 shrink-0">
                        {node.isFolder ? (
                            <Folder className="w-4 h-4 fill-default-400/20" />
                        ) : (
                            getFileIcon(node.name)
                        )}
                    </div>

                    <span
                        className={cn(
                            "text-small truncate cursor-default",
                            node.isFolder
                                ? "font-medium text-foreground"
                                : "text-foreground/80",
                        )}
                        title={node.name}
                        onClick={node.isFolder ? onToggleExpand : undefined}
                    >
                        {node.name}
                    </span>
                </div>

                {/* Priority Actions */}
                <div className="flex justify-center">
                    <Dropdown>
                        <DropdownTrigger>
                            <Chip
                                size="sm"
                                variant="flat"
                                color={getPriorityColor(priority)}
                                className="h-6 gap-1 px-1 min-w-16 cursor-pointer hover:opacity-80 transition-opacity"
                                classNames={{
                                    content:
                                        "text-[10px] font-semibold uppercase px-0",
                                }}
                            >
                                {getPriorityLabel(priority)}
                            </Chip>
                        </DropdownTrigger>
                        <DropdownMenu
                            onAction={(k) => {
                                const target = node.descendantIndexes;
                                if (k === "high") onSetPriority(7, target);
                                if (k === "normal") onSetPriority(4, target);
                                if (k === "low") onSetPriority(1, target);
                                if (k === "skip") onSetPriority("skip", target);
                            }}
                        >
                            <DropdownItem
                                key="high"
                                startContent={
                                    <ArrowUp className="w-4 h-4 text-success" />
                                }
                            >
                                {t("priority.high")}
                            </DropdownItem>
                            <DropdownItem
                                key="normal"
                                startContent={
                                    <Minus className="w-4 h-4 text-primary" />
                                }
                            >
                                {t("priority.normal")}
                            </DropdownItem>
                            <DropdownItem
                                key="low"
                                startContent={
                                    <ArrowDown className="w-4 h-4 text-warning" />
                                }
                            >
                                {t("priority.low")}
                            </DropdownItem>
                            <DropdownItem
                                key="skip"
                                className="text-danger"
                                startContent={<X className="w-4 h-4" />}
                            >
                                {t("priority.dont_download")}
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </div>

                {/* Progress */}
                <div className="flex flex-col justify-center px-1">
                    <Progress
                        size="sm"
                        value={progress}
                        color={progress === 100 ? "success" : "primary"}
                        classNames={{
                            track: "h-1",
                            indicator: "!transition-all h-1",
                        }}
                        aria-label="Download progress"
                    />
                </div>

                {/* Size */}
                <div className="text-right text-[11px] text-default-400 font-mono">
                    {formatBytes(node.totalSize)}
                </div>
            </div>
        );
    },
);
