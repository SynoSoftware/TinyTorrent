import { Checkbox } from "@heroui/react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import {
    type KeyboardEvent,
    type MouseEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
    useMemo,
    useRef,
} from "react";

import { useTranslation } from "react-i18next";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { ICON_STROKE_WIDTH } from "@/config/logic";
import { formatBytes } from "@/shared/utils/format";
import { useVirtualizer } from "@tanstack/react-virtual";

import type {
    LibtorrentPriority,
    TorrentFileEntity,
} from "@/services/rpc/entities";
// FileExplorerEntry is a mapped type for TorrentFileEntity, re-declare here for clarity
export type FileExplorerEntry = TorrentFileEntity;

// FileExplorerTreeProps interface (redeclare for local use)
interface FileExplorerTreeProps {
    files: FileExplorerEntry[];
    emptyMessage?: string;
    onFilesToggle?: (indexes: number[], wanted: boolean) => void;
    onFileContextAction?: (
        action: FileExplorerContextAction,
        entry: FileExplorerEntry
    ) => void;
}

export type FileExplorerContextAction =
    | "priority_high"
    | "priority_normal"
    | "priority_low"
    | "open_file"
    | "open_folder";

type FileContextMenuState = {
    file: FileExplorerEntry;
    rawX: number;
    rawY: number;
    x: number;
    y: number;
};

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

// priority badge base classes (visuals) - font size & padding come from CSS tokens
const PRIORITY_BADGE_BASE = "font-semibold uppercase rounded-full";
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

// Row height is driven by CSS token `--tt-row-h` (fallback to 32)
// We read the token inside the component to provide a numeric estimate to the virtualizer.

export function FileExplorerTree({
    files,
    emptyMessage,
    onFilesToggle,
    onFileContextAction,
}: FileExplorerTreeProps) {
    const [search, setSearch] = useState("");
    const [extensionFilter, setExtensionFilter] = useState("");
    const { t } = useTranslation();
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
        () => new Set()
    );
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
        null
    );
    const [fileContextMenu, setFileContextMenu] =
        useState<FileContextMenuState | null>(null);
    const selectionMap = useMemo(() => {
        const map = new Map<number, boolean>();
        files.forEach((file) => {
            map.set(file.index, file.wanted ?? true);
        });
        return map;
    }, [files]);

    // Filter files by search and extension
    const filteredFiles = useMemo(() => {
        let result = files;
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            result = result.filter((f) => f.name.toLowerCase().includes(s));
        }
        if (extensionFilter) {
            result = result.filter((f) =>
                f.name.toLowerCase().endsWith(extensionFilter)
            );
        }
        return result;
    }, [files, search, extensionFilter]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    useEffect(() => {
        setSelectedIndexes(new Set());
        setLastSelectedIndex(null);
        setFileContextMenu(null);
    }, [files]);
    useEffect(() => {
        const handlePointerDown = () => setFileContextMenu(null);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, []);

    const toggleExpanded = useCallback((id: string) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const visibleNodes = useMemo(() => {
        const tree = buildFileTree(filteredFiles);
        return flattenVisibleNodes(tree, expanded);
    }, [filteredFiles, expanded]);
    const visibleFileIndexes = useMemo(() => {
        return visibleNodes
            .filter(({ node }) => !node.isFolder && node.file)
            .map(({ node }) => node.file!.index);
    }, [visibleNodes]);
    const visibleIndexPositions = useMemo(() => {
        const map = new Map<number, number>();
        visibleFileIndexes.forEach((index, position) => {
            map.set(index, position);
        });
        return map;
    }, [visibleFileIndexes]);

    const handleFileToggle = useCallback(
        (indexes: number[], wanted: boolean) => {
            if (!indexes.length) return;
            onFilesToggle?.(indexes, wanted);
        },
        [onFilesToggle]
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const focusContainer = useCallback(() => {
        containerRef.current?.focus({ preventScroll: true });
    }, []);
    const {
        rowHeight,
        fileContextMenuWidth: contextMenuWidth,
        fileContextMenuMargin: contextMenuMargin,
    } = useLayoutMetrics();

    const clampContextMenuPosition = useCallback(
        (x: number, y: number, menuWidth = contextMenuWidth) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) {
                return { x, y };
            }
            const maxX = Math.max(
                rect.width - menuWidth - contextMenuMargin,
                contextMenuMargin
            );
            const maxY = Math.max(
                rect.height - contextMenuMargin,
                contextMenuMargin
            );
            return {
                x: Math.min(Math.max(x, contextMenuMargin), maxX),
                y: Math.min(Math.max(y, contextMenuMargin), maxY),
            };
        },
        [contextMenuMargin, contextMenuWidth]
    );
    const getRangeIndexes = useCallback(
        (targetIndex: number, anchorIndex: number | null) => {
            if (anchorIndex === null) {
                return [targetIndex];
            }
            const anchorPos = visibleIndexPositions.get(anchorIndex);
            const targetPos = visibleIndexPositions.get(targetIndex);
            if (anchorPos === undefined || targetPos === undefined) {
                return [targetIndex];
            }
            const [start, end] =
                anchorPos < targetPos
                    ? [anchorPos, targetPos]
                    : [targetPos, anchorPos];
            return visibleFileIndexes.slice(start, end + 1);
        },
        [visibleFileIndexes, visibleIndexPositions]
    );
    const handleRowSelection = useCallback(
        (event: MouseEvent<HTMLDivElement>, index: number) => {
            const rangeSelection = event.shiftKey && lastSelectedIndex !== null;
            const additiveSelection = event.metaKey || event.ctrlKey;
            if (rangeSelection) {
                const nextSelection = getRangeIndexes(index, lastSelectedIndex);
                setSelectedIndexes(new Set(nextSelection));
            } else if (additiveSelection) {
                setSelectedIndexes((prev) => {
                    const next = new Set(prev);
                    if (next.has(index)) {
                        next.delete(index);
                    } else {
                        next.add(index);
                    }
                    return next;
                });
            } else {
                setSelectedIndexes(new Set([index]));
            }
            setLastSelectedIndex(index);
            focusContainer();
        },
        [focusContainer, getRangeIndexes, lastSelectedIndex]
    );
    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Escape") {
                setFileContextMenu(null);
                return;
            }
            if (event.code !== "Space" && event.key !== " ") return;
            if (!selectedIndexes.size) return;
            event.preventDefault();
            const selectedArray = Array.from(selectedIndexes);
            const allSelectedWanted = selectedArray.every((index) =>
                selectionMap.get(index)
            );
            handleFileToggle(selectedArray, !allSelectedWanted);
        },
        [handleFileToggle, selectedIndexes, selectionMap]
    );
    const fileContextMenuItems = useMemo(
        () => [
            {
                key: "open_file" as const,
                label: t("torrent_modal.context_menu.files.open_file"),
            },
            {
                key: "open_folder" as const,
                label: t("torrent_modal.context_menu.files.open_folder"),
            },
            {
                key: "priority_high" as const,
                label: t("torrent_modal.context_menu.files.priority_high"),
            },
            {
                key: "priority_normal" as const,
                label: t("torrent_modal.context_menu.files.priority_normal"),
            },
            {
                key: "priority_low" as const,
                label: t("torrent_modal.context_menu.files.priority_low"),
            },
        ],
        [t]
    );
    const menuRef = useRef<HTMLDivElement | null>(null);
    const handleFileContextMenu = useCallback(
        (event: MouseEvent<HTMLDivElement>, file: FileExplorerEntry) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = containerRef.current?.getBoundingClientRect();
            const offsetX = rect ? event.clientX - rect.left : event.clientX;
            const offsetY = rect ? event.clientY - rect.top : event.clientY;
            const { x, y } = clampContextMenuPosition(offsetX, offsetY);
            setFileContextMenu({
                file,
                rawX: offsetX,
                rawY: offsetY,
                x,
                y,
            });
            if (!selectedIndexes.has(file.index)) {
                setSelectedIndexes(new Set([file.index]));
                setLastSelectedIndex(file.index);
            }
        },
        [clampContextMenuPosition, selectedIndexes]
    );
    const handleFileContextAction = useCallback(
        (action: FileExplorerContextAction) => {
            if (!fileContextMenu) return;
            onFileContextAction?.(action, fileContextMenu.file);
            setFileContextMenu(null);
        },
        [fileContextMenu, onFileContextAction]
    );

    useLayoutEffect(() => {
        if (!fileContextMenu || !menuRef.current) return;
        const rect = menuRef.current.getBoundingClientRect();
        const clamped = clampContextMenuPosition(
            fileContextMenu.rawX,
            fileContextMenu.rawY,
            rect.width
        );
        if (
            clamped.x === fileContextMenu.x &&
            clamped.y === fileContextMenu.y
        ) {
            return;
        }
        setFileContextMenu((prev) =>
            prev ? { ...prev, x: clamped.x, y: clamped.y } : prev
        );
    }, [clampContextMenuPosition, fileContextMenu]);

    const handleFolderToggle = useCallback(
        (node: FileExplorerNode) => {
            const indexes = node.indexes ?? [];
            if (!indexes.length) return;
            const allSelected = indexes.every((index) =>
                selectionMap.get(index)
            );
            handleFileToggle(indexes, !allSelected);
        },
        [handleFileToggle, selectionMap]
    );

    // React Compiler warning: do not memoize or pass rowVirtualizer to children
    const rowVirtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => rowHeight,
        overscan: 6,
        getItemKey: (index) => visibleNodes[index]?.id ?? index,
    });

    if (!files.length) {
        return (
            <div className="rounded-xl border border-content1/20 bg-content1/15 p-4 text-xs text-foreground/50 text-center">
                {emptyMessage ?? t("torrent_modal.files_empty")}
            </div>
        );
    }

    // Gather all unique file extensions for the select-by-extension tool
    const allExtensions = useMemo(() => {
        const set = new Set<string>();
        files.forEach((f) => {
            const match = f.name.match(/\.([a-z0-9]+)$/i);
            if (match) set.add(match[0].toLowerCase());
        });
        return Array.from(set).sort();
    }, [files]);

    // Bulk select by extension
    const handleSelectByExtension = (ext: string) => {
        const indexes = files
            .filter((f) => f.name.toLowerCase().endsWith(ext))
            .map((f) => f.index);
        if (indexes.length) {
            onFilesToggle?.(indexes, true);
        }
    };

    if (!visibleNodes.length) {
        return (
            <div className="rounded-xl border border-content1/20 bg-content1/15 p-4 text-xs text-foreground/50 text-center">
                {emptyMessage ?? t("torrent_modal.files_empty")}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 p-2 sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-content1/10">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("torrent_modal.files_search_placeholder", {
                        defaultValue: "Search files...",
                    })}
                    className="flex-1 px-2 py-1 rounded bg-content1/20 text-foreground outline-none"
                    style={{ minWidth: 0 }}
                />
                {allExtensions.length > 0 && (
                    <select
                        value={extensionFilter}
                        onChange={(e) => {
                            setExtensionFilter(e.target.value);
                            if (e.target.value)
                                handleSelectByExtension(e.target.value);
                        }}
                        className="px-2 py-1 rounded bg-content1/20 text-foreground outline-none"
                    >
                        <option value="">
                            {t("torrent_modal.files_select_extension", {
                                defaultValue: "Select by extension...",
                            })}
                        </option>
                        {allExtensions.map((ext) => (
                            <option key={ext} value={ext}>
                                {ext}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            <div
                ref={containerRef}
                className="relative h-full overflow-y-auto"
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        position: "relative",
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const { node, depth } = visibleNodes[virtualRow.index];
                        const paddingLeft = `calc(var(--tt-file-depth-indent) * ${depth} + var(--tt-file-row-padding-left))`;
                        const isFolder = node.isFolder;
                        const rowKey = `${node.id}-${virtualRow.index}`;
                        if (isFolder) {
                            const indexes = node.indexes ?? [];
                            const count = indexes.length;
                            const allSelected =
                                count > 0 &&
                                indexes.every((index) =>
                                    selectionMap.get(index)
                                );
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
                                                (
                                                    event.target as Element
                                                ).closest("button")
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
                                                    strokeWidth={
                                                        ICON_STROKE_WIDTH
                                                    }
                                                    className="text-current"
                                                />
                                            ) : (
                                                <ChevronRight
                                                    size={16}
                                                    strokeWidth={
                                                        ICON_STROKE_WIDTH
                                                    }
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
                                            <span
                                                style={{
                                                    fontSize:
                                                        "var(--tt-font-size-base)",
                                                }}
                                                className="text-foreground/50"
                                            >
                                                {count} file
                                                {count === 1 ? "" : "s"}
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
                        const isRowSelected = selectedIndexes.has(
                            node.file.index
                        );
                        const rowClasses = `flex items-center gap-2 py-2 rounded cursor-pointer h-full transition-colors ${
                            isRowSelected
                                ? "bg-primary/10"
                                : "hover:bg-content1/10"
                        }`;
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
                                    className={rowClasses}
                                    style={{ paddingLeft }}
                                    onClick={(event) =>
                                        handleRowSelection(
                                            event,
                                            node.file!.index
                                        )
                                    }
                                    onContextMenu={(event) =>
                                        handleFileContextMenu(event, node.file!)
                                    }
                                    data-selected={isRowSelected}
                                >
                                    <div
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        <Checkbox
                                            isSelected={fileWanted}
                                            onValueChange={(value) =>
                                                handleFileToggle(
                                                    [node.file!.index],
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
                                            <span
                                                className={priorityBadgeClass}
                                                style={{
                                                    fontSize:
                                                        "var(--tt-priority-badge-font-size)",
                                                    padding:
                                                        "var(--tt-priority-badge-padding-y) var(--tt-priority-badge-padding-x)",
                                                    letterSpacing:
                                                        "var(--tt-tracking-wide)",
                                                }}
                                            >
                                                {priorityLabel}
                                            </span>
                                        )}
                                    </div>
                                    {typeof node.file.length === "number" &&
                                        node.file.length > 0 && (
                                            <span
                                                style={{
                                                    fontSize:
                                                        "var(--tt-font-size-base)",
                                                }}
                                                className="font-mono text-foreground/50"
                                            >
                                                {formatBytes(node.file.length)}
                                            </span>
                                        )}
                                    {typeof node.file.progress === "number" && (
                                        <span
                                            style={{
                                                fontSize:
                                                    "var(--tt-font-size-base)",
                                            }}
                                            className="font-mono text-foreground/40"
                                        >
                                            {(node.file.progress * 100).toFixed(
                                                0
                                            )}
                                            %
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {fileContextMenu && (
                    <div
                        ref={menuRef}
                        className="pointer-events-auto absolute z-50 rounded-2xl border border-content1/40 bg-content1/80 p-1 backdrop-blur-3xl shadow-[0_20px_45px_rgba(0,0,0,0.35)]"
                        style={{
                            top: fileContextMenu.y,
                            left: fileContextMenu.x,
                            minWidth: contextMenuWidth,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.preventDefault()}
                    >
                        {fileContextMenuItems.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors data-[hover=true]:bg-content2/70 data-[pressed=true]:bg-content2/80 hover:text-foreground"
                                onClick={() =>
                                    handleFileContextAction(item.key)
                                }
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
