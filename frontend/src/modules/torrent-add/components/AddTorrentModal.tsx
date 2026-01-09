import {
    Accordion,
    AccordionItem,
    Button,
    Checkbox,
    Chip,
    Divider,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Progress,
    Select,
    SelectItem,
    Spinner,
    cn,
    Tooltip,
} from "@heroui/react";
import {
    Panel,
    PanelGroup,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from "react-resizable-panels";
import {
    type DragEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { useVirtualizer } from "@tanstack/react-virtual";
import { KEY_SCOPE, INTERACTION_CONFIG } from "@/config/logic";
import {
    ArrowDown,
    ChevronDown,
    FolderOpen,
    HardDrive,
    Inbox,
    Sparkles,
    Wand2,
    X,
    GripVertical,
    FileVideo,
    FileText,
    File as FileIcon,
    AlertTriangle,
    CheckCircle2,
    PlayCircle,
    PauseCircle,
    Tag,
    Hash,
    ListOrdered,
    Maximize2,
    Minimize2,
    SidebarClose,
    SidebarOpen,
} from "lucide-react";

import { formatBytes } from "@/shared/utils/format";
import {
    GLASS_MODAL_SURFACE,
    GLASS_PANEL_SURFACE,
} from "@/shared/ui/layout/glass-surface";
import type { TorrentMetadata } from "@/shared/utils/torrent";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

// --- TYPES ---

export type AddTorrentSource =
    | {
          kind: "file";
          label: string;
          metadata: TorrentMetadata;
          file: File;
      }
    | {
          kind: "magnet";
          label: string;
          magnetLink: string;
          status: "resolving" | "ready" | "error";
          metadata?: TorrentMetadata;
          torrentId?: string;
          errorMessage?: string | null;
      };

export type AddTorrentCommitMode = "start" | "paused" | "top";

export type AddTorrentSelection = {
    downloadDir: string;
    name: string;
    commitMode: AddTorrentCommitMode;
    filesUnwanted: number[];
    priorityHigh: number[];
    priorityNormal: number[];
    priorityLow: number[];
    options: {
        category?: string | null;
        sequential: boolean;
        skipHashCheck: boolean;
    };
};

export interface AddTorrentModalProps {
    isOpen: boolean;
    source: AddTorrentSource | null;
    initialDownloadDir: string;
    isSubmitting: boolean;
    isResolvingSource?: boolean;
    onCancel: () => void;
    onConfirm: (selection: AddTorrentSelection) => void;
    onResolveMagnet?: () => void;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    onBrowseDirectory?: (
        currentPath: string
    ) => Promise<string | null | undefined>;
}

type FileRow = {
    index: number;
    path: string;
    length: number;
};

type SmartSelectCommand = "videos" | "largest" | "invert" | "all" | "none";

// --- CONSTANTS & HELPERS ---

const HISTORY_KEY = "tt-add-save-history";
const HISTORY_LIMIT = 6;

const FILE_GRID_TEMPLATE = "40px minmax(0, 1fr) 90px 110px";

const MODAL_CLASSES =
    "w-full overflow-hidden flex flex-col shadow-2xl border border-white/10 transition-all duration-300";
const PANE_SURFACE =
    "h-full flex flex-col min-h-0 bg-transparent transition-all";
const SECTION_LABEL =
    "text-[10px] font-bold tracking-widest text-foreground/40 uppercase mb-3 flex items-center gap-2";

function detectDriveKind(path: string): "SSD" | "HDD" | "Network" | "Unknown" {
    if (!path) return "Unknown";
    const normalized = path.replace(/\//g, "\\");
    if (normalized.startsWith("\\\\")) return "Network";
    const lower = normalized.toLowerCase();
    if (lower.includes("hdd")) return "HDD";
    if (lower.includes("ssd")) return "SSD";
    if (/^[a-zA-Z]:\\/i.test(normalized)) {
        return normalized[0]?.toUpperCase() >= "D" ? "HDD" : "SSD";
    }
    return "Unknown";
}

function buildFiles(metadata?: TorrentMetadata): FileRow[] {
    if (!metadata) return [];
    return metadata.files.map((file, index) => ({
        index,
        path: file.path,
        length: file.length,
    }));
}

function filterFiles(files: FileRow[], query: string): FileRow[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return files;
    return files.filter((file) => file.path.toLowerCase().includes(trimmed));
}

const VIDEO_EXTENSIONS = [
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".mpg",
    ".mpeg",
    ".ts",
    ".m4v",
];
const SUBTITLE_EXTENSIONS = [".srt", ".ass", ".vtt", ".sub"];

function classifyFile(path: string): "video" | "text" | "other" {
    const lower = path.toLowerCase();
    if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
    if (SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text";
    return "other";
}

function getFileIcon(type: "video" | "text" | "other") {
    switch (type) {
        case "video":
            return FileVideo;
        case "text":
            return FileText;
        default:
            return FileIcon;
    }
}

// --- COMPONENT ---

export function AddTorrentModal({
    isOpen,
    source,
    initialDownloadDir,
    isSubmitting,
    isResolvingSource = false,
    onCancel,
    onConfirm,
    onResolveMagnet,
    checkFreeSpace,
    onBrowseDirectory,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const { rowHeight } = useLayoutMetrics();

    // -- State --
    const [downloadDir, setDownloadDir] = useState(initialDownloadDir);
    const [name, setName] = useState(source?.metadata?.name ?? "");
    const [commitMode, setCommitMode] = useState<AddTorrentCommitMode>("start");
    const [filter, setFilter] = useState("");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [priorities, setPriorities] = useState<
        Map<number, "low" | "normal" | "high">
    >(new Map());
    const [category, setCategory] = useState<string | null>(null);
    const [sequential, setSequential] = useState(false);
    const [skipHashCheck, setSkipHashCheck] = useState(false);

    // View State (New)
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);

    // Free Space Logic
    const [freeSpace, setFreeSpace] = useState<TransmissionFreeSpace | null>(
        null
    );
    const [spaceError, setSpaceError] = useState<string | null>(null);
    const [isCheckingSpace, setIsCheckingSpace] = useState(false);
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);

    // UX State
    const [dropActive, setDropActive] = useState(false);
    const [recentPaths, setRecentPaths] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const raw = window.localStorage.getItem(HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const settingsPanelRef = useRef<ImperativePanelHandle>(null);

    // -- Keyboard Scope --
    const { activate: activateModal, deactivate: deactivateModal } =
        useKeyboardScope(KEY_SCOPE.Modal);
    const { activate: activateDashboard, deactivate: deactivateDashboard } =
        useKeyboardScope(KEY_SCOPE.Dashboard);

    useEffect(() => {
        deactivateDashboard();
        activateModal();
        return () => {
            deactivateModal();
            activateDashboard();
        };
    }, [
        activateDashboard,
        activateModal,
        deactivateDashboard,
        deactivateModal,
    ]);

    // -- Data Memoization --
    const files = useMemo(
        () => buildFiles(source?.metadata),
        [source?.metadata]
    );

    // Reset state when source/modal opens
    useEffect(() => {
        setName(source?.metadata?.name ?? source?.label ?? "");
        setFilter("");
        setPriorities(new Map());
        setSequential(false);
        setSkipHashCheck(false);
        setCategory(null);
        setSelected(new Set(files.map((f) => f.index)));

        // Reset View modes
        setIsFullscreen(false);
        setIsSettingsCollapsed(false);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                HISTORY_KEY,
                JSON.stringify(recentPaths)
            );
        }
    }, [source, files, isOpen, recentPaths]);

    useEffect(() => {
        setDownloadDir(initialDownloadDir);
    }, [initialDownloadDir, isOpen]);

    // -- Logic: Toggle Views --
    const toggleSettingsPanel = useCallback(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;

        if (isSettingsCollapsed) {
            panel.expand();
        } else {
            panel.collapse();
        }
        // State updates via onCollapse/onExpand callback in Panel component
    }, [isSettingsCollapsed]);

    // -- Logic: History & Drops --
    const pushRecentPath = useCallback((path: string) => {
        const trimmed = path.trim();
        if (!trimmed) return;
        setRecentPaths((prev) => {
            const next = [trimmed, ...prev.filter((item) => item !== trimmed)];
            return next.slice(0, HISTORY_LIMIT);
        });
    }, []);

    const applyDroppedPath = useCallback(
        (path?: string) => {
            if (!path) return;
            setDownloadDir(path);
            pushRecentPath(path);
        },
        [pushRecentPath]
    );

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDropActive(false);
            const files = Array.from(event.dataTransfer?.files ?? []);
            let path: string | undefined;
            if (files.length) {
                const file = files[0] as File & {
                    path?: string;
                    webkitRelativePath?: string;
                };
                path = file.path || file.webkitRelativePath || file.name;
            }
            if (!path) {
                path = event.dataTransfer?.getData("text/plain")?.trim();
            }
            applyDroppedPath(path);
        },
        [applyDroppedPath]
    );

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        setDropActive(true);
    }, []);
    const handleDragLeave = useCallback(() => setDropActive(false), []);

    // -- Logic: Browse --
    const handleBrowse = useCallback(async () => {
        if (!onBrowseDirectory) return;
        setIsTouchingDirectory(true);
        try {
            const next = await onBrowseDirectory(downloadDir);
            if (next) applyDroppedPath(next);
        } finally {
            setIsTouchingDirectory(false);
        }
    }, [downloadDir, onBrowseDirectory, applyDroppedPath]);

    // -- Logic: Files & Selection --
    const filteredFiles = useMemo(
        () => filterFiles(files, filter),
        [files, filter]
    );
    const selectedSize = useMemo(() => {
        return files.reduce(
            (sum, file) => (selected.has(file.index) ? sum + file.length : sum),
            0
        );
    }, [files, selected]);

    const handleSmartSelect = useCallback(
        (command: SmartSelectCommand) => {
            if (command === "all") {
                setSelected(new Set(files.map((f) => f.index)));
            } else if (command === "none") {
                setSelected(new Set());
            } else if (command === "invert") {
                setSelected((prev) => {
                    const next = new Set<number>();
                    files.forEach(
                        (f) => !prev.has(f.index) && next.add(f.index)
                    );
                    return next;
                });
            } else if (command === "videos") {
                const videoIndexes = files
                    .filter((f) => classifyFile(f.path) === "video")
                    .map((f) => f.index);
                setSelected(new Set(videoIndexes));
            } else if (command === "largest") {
                const largest = files.reduce(
                    (prev, current) =>
                        prev.length > current.length ? prev : current,
                    files[0]
                );
                if (largest) setSelected(new Set([largest.index]));
            }
        },
        [files]
    );

    const toggleSelection = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(index) ? next.delete(index) : next.add(index);
            return next;
        });
    }, []);

    const setPriority = useCallback(
        (index: number, value: "low" | "normal" | "high") => {
            setPriorities((prev) => {
                const next = new Map(prev);
                value === "normal"
                    ? next.delete(index)
                    : next.set(index, value);
                return next;
            });
        },
        []
    );

    const cyclePriority = useCallback((index: number) => {
        setPriorities((prev) => {
            const current = prev.get(index) ?? "normal";
            const nextMap = new Map(prev);
            if (current === "normal") nextMap.set(index, "high");
            else if (current === "high") nextMap.set(index, "low");
            else nextMap.delete(index);
            return nextMap;
        });
    }, []);

    // -- Logic: Free Space --
    useEffect(() => {
        if (!checkFreeSpace || !downloadDir.trim()) {
            setFreeSpace(null);
            return;
        }
        let active = true;
        setIsCheckingSpace(true);
        checkFreeSpace(downloadDir.trim())
            .then((space) => active && setFreeSpace(space))
            .catch(
                () =>
                    active &&
                    setSpaceError(t("modals.add_torrent.free_space_unknown"))
            )
            .finally(() => active && setIsCheckingSpace(false));
        return () => {
            active = false;
        };
    }, [checkFreeSpace, downloadDir, t]);

    // -- Validation & Logic --
    const resolvedState = useMemo(() => {
        if (source?.kind === "magnet" && !source.metadata) {
            if (source.status === "error") return "error";
            return "pending";
        }
        return files.length ? "ready" : "pending";
    }, [files.length, source]);

    const isDiskSpaceCritical = freeSpace
        ? selectedSize > freeSpace.sizeBytes
        : false;
    const isSelectionEmpty = selected.size === 0;
    const effectiveCommitMode = isDiskSpaceCritical ? "paused" : commitMode;
    const canConfirm =
        !isSelectionEmpty &&
        !!downloadDir.trim() &&
        !isSubmitting &&
        resolvedState === "ready";

    const virtualizer = useVirtualizer({
        count: filteredFiles.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => rowHeight,
        overscan: 10,
    });

    const handleFilesKeyDown = useCallback(
        (e: ReactKeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault();
                handleSmartSelect("all");
            } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
                e.preventDefault();
                handleSmartSelect("invert");
            }
        },
        [handleSmartSelect]
    );

    // -- Renderers --

    const renderFileRow = (file: FileRow) => {
        const priority = priorities.get(file.index) ?? "normal";
        const fileType = classifyFile(file.path);
        const Icon = getFileIcon(fileType);
        const isSelected = selected.has(file.index);

        return (
            <div
                key={file.index}
                className={cn(
                    "grid items-center border-b border-default/5 transition-colors cursor-pointer group select-none",
                    isSelected
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "bg-transparent hover:bg-white/5",
                    "text-xs"
                )}
                style={{
                    gridTemplateColumns: FILE_GRID_TEMPLATE,
                    height: rowHeight,
                }}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest(".priority-trigger"))
                        return;
                    toggleSelection(file.index);
                }}
            >
                <div className="flex items-center justify-center h-full">
                    <Checkbox
                        isSelected={isSelected}
                        onValueChange={() => toggleSelection(file.index)}
                        size="sm"
                        classNames={{ wrapper: "after:bg-primary" }}
                    />
                </div>

                <div className="flex items-center gap-3 min-w-0 pr-4">
                    <Icon
                        className={cn(
                            "shrink-0 size-4",
                            fileType === "video"
                                ? "text-primary"
                                : "text-foreground/40"
                        )}
                    />
                    <span
                        className={cn(
                            "truncate select-text transition-colors",
                            isSelected
                                ? "text-foreground"
                                : "text-foreground/60"
                        )}
                        title={file.path}
                    >
                        {file.path}
                    </span>
                </div>

                <div className="font-mono text-foreground/50 text-[11px]">
                    {formatBytes(file.length)}
                </div>

                <div className="pr-4 flex justify-end">
                    <div className="flex items-center">
                        <div
                            className="priority-trigger mr-1 cursor-pointer active:scale-95 transition-transform"
                            onClick={(e) => {
                                e.stopPropagation();
                                cyclePriority(file.index);
                            }}
                            title="Click to cycle priority"
                        >
                            {priority === "high" && (
                                <ArrowDown className="rotate-180 size-3 text-success" />
                            )}
                            {priority === "low" && (
                                <ArrowDown className="size-3 text-warning" />
                            )}
                            {priority === "normal" && (
                                <span className="size-1.5 block bg-foreground/20 rounded-full mx-0.5" />
                            )}
                        </div>

                        <Select
                            aria-label="Priority"
                            selectedKeys={[priority]}
                            onSelectionChange={(k) =>
                                setPriority(file.index, Array.from(k)[0] as any)
                            }
                            size="sm"
                            variant="flat"
                            disallowEmptySelection
                            classNames={{
                                trigger:
                                    "h-6 min-h-6 w-20 bg-transparent data-[hover=true]:bg-white/10 priority-trigger pl-1",
                                value: "text-[10px] uppercase font-bold text-right",
                                popoverContent: "w-28",
                            }}
                        >
                            <SelectItem
                                key="high"
                                startContent={
                                    <ArrowDown className="rotate-180 size-3 text-success" />
                                }
                            >
                                High
                            </SelectItem>
                            <SelectItem
                                key="normal"
                                startContent={
                                    <span className="size-2 block bg-foreground/20 rounded-full ml-0.5" />
                                }
                            >
                                Normal
                            </SelectItem>
                            <SelectItem
                                key="low"
                                startContent={
                                    <ArrowDown className="size-3 text-warning" />
                                }
                            >
                                Low
                            </SelectItem>
                        </Select>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(o) => !o && onCancel()}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!isSubmitting}
            size={isFullscreen ? "full" : "5xl"} // 1. Dynamic Size
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    MODAL_CLASSES,
                    isFullscreen ? "h-screen rounded-none border-0" : "h-[85vh]"
                ),
                body: "p-0",
                header: "border-b border-white/5 bg-black/40 p-4 select-none",
                footer: "border-t border-white/5 bg-black/40 p-4 select-none",
            }}
        >
            <ModalContent>
                <form
                    ref={formRef}
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (canConfirm)
                            onConfirm({
                                downloadDir,
                                name,
                                commitMode: effectiveCommitMode,
                                filesUnwanted: [],
                                priorityHigh: [],
                                priorityNormal: [],
                                priorityLow: [],
                                options: {
                                    category,
                                    sequential,
                                    skipHashCheck,
                                },
                            });
                    }}
                    className="flex flex-col h-full"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                            formRef.current?.requestSubmit();
                    }}
                >
                    {/* --- HEADER --- */}
                    <ModalHeader className="flex justify-between items-center gap-4">
                        <div className="flex flex-col overflow-hidden">
                            <h2 className="text-sm font-bold tracking-widest uppercase text-foreground">
                                {t("modals.add_torrent.title")}
                            </h2>
                            <span className="text-xs text-foreground/40 truncate font-mono mt-0.5">
                                {source?.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Chip
                                size="sm"
                                variant="flat"
                                color={isSelectionEmpty ? "default" : "primary"}
                                startContent={<Inbox size={12} />}
                                classNames={{ content: "font-mono font-bold" }}
                            >
                                {files.length} FILE{files.length !== 1 && "S"}
                            </Chip>
                            <div className="h-6 w-px bg-white/10 mx-2" />
                            {/* 2. Fullscreen Toggle */}
                            <Tooltip
                                content={
                                    isFullscreen
                                        ? "Exit Fullscreen"
                                        : "Fullscreen"
                                }
                            >
                                <Button
                                    isIconOnly
                                    variant="light"
                                    size="sm"
                                    onPress={() =>
                                        setIsFullscreen(!isFullscreen)
                                    }
                                    className="text-foreground/60"
                                >
                                    {isFullscreen ? (
                                        <Minimize2 size={18} />
                                    ) : (
                                        <Maximize2 size={18} />
                                    )}
                                </Button>
                            </Tooltip>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={onCancel}
                                ariaLabel="Close"
                            />
                        </div>
                    </ModalHeader>

                    {/* --- SPLIT VIEW BODY --- */}
                    <ModalBody className="flex-1 min-h-0 bg-content1/5 relative">
                        {dropActive && (
                            <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-primary border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
                                <div className="bg-background px-6 py-4 rounded-full shadow-xl flex items-center gap-3 animate-pulse">
                                    <FolderOpen
                                        className="text-primary"
                                        size={24}
                                    />
                                    <span className="text-lg font-bold">
                                        Drop to change destination
                                    </span>
                                </div>
                            </div>
                        )}

                        <PanelGroup direction="horizontal">
                            {/* === LEFT PANEL: CONFIGURATION === */}
                            <Panel
                                ref={settingsPanelRef}
                                defaultSize={40}
                                minSize={25}
                                collapsible
                                onCollapse={() => setIsSettingsCollapsed(true)}
                                onExpand={() => setIsSettingsCollapsed(false)}
                                className={cn(
                                    PANE_SURFACE,
                                    "bg-content1/20 transition-all duration-300 ease-in-out",
                                    isSettingsCollapsed &&
                                        "min-w-0 w-0 border-none"
                                )}
                            >
                                <div className="p-6 flex flex-col h-full overflow-y-auto custom-scrollbar">
                                    {/* ... [Content of Left Panel same as before] ... */}
                                    <div
                                        className="flex flex-col gap-3 mb-6"
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex justify-between items-center">
                                            <label className={SECTION_LABEL}>
                                                <HardDrive size={12} />{" "}
                                                DESTINATION
                                            </label>
                                            {freeSpace && (
                                                <div className="flex items-center gap-3">
                                                    <div className="text-[10px] font-mono text-right">
                                                        <div className="text-foreground/60">
                                                            {formatBytes(
                                                                freeSpace.sizeBytes
                                                            )}{" "}
                                                            FREE
                                                        </div>
                                                    </div>
                                                    <Tooltip
                                                        content={`${formatBytes(
                                                            selectedSize
                                                        )} Selected`}
                                                    >
                                                        <Progress
                                                            value={Math.min(
                                                                100,
                                                                (selectedSize /
                                                                    freeSpace.sizeBytes) *
                                                                    100
                                                            )}
                                                            color={
                                                                isDiskSpaceCritical
                                                                    ? "danger"
                                                                    : "success"
                                                            }
                                                            size="sm"
                                                            className="w-24"
                                                            aria-label="Disk Usage"
                                                        />
                                                    </Tooltip>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 group">
                                            <Input
                                                value={downloadDir}
                                                onChange={(e) =>
                                                    setDownloadDir(
                                                        e.target.value
                                                    )
                                                }
                                                variant="flat"
                                                classNames={{
                                                    input: "font-mono text-sm",
                                                    inputWrapper:
                                                        "bg-black/20 hover:bg-black/30 transition-colors shadow-none border border-white/5 group-hover:border-white/10",
                                                }}
                                                startContent={
                                                    <FolderOpen
                                                        className="text-primary mb-0.5"
                                                        size={16}
                                                    />
                                                }
                                            />
                                            {onBrowseDirectory && (
                                                <Button
                                                    onPress={handleBrowse}
                                                    isIconOnly
                                                    variant="flat"
                                                    className="bg-black/20 border border-white/5"
                                                >
                                                    <Sparkles
                                                        size={16}
                                                        className="text-foreground/50"
                                                    />
                                                </Button>
                                            )}
                                            <Dropdown>
                                                <DropdownTrigger>
                                                    <Button
                                                        isIconOnly
                                                        variant="flat"
                                                        className="bg-black/20 border border-white/5"
                                                    >
                                                        <ChevronDown
                                                            size={16}
                                                            className="text-foreground/50"
                                                        />
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu
                                                    onAction={(k) =>
                                                        applyDroppedPath(
                                                            k.toString()
                                                        )
                                                    }
                                                    aria-label="Recent Paths"
                                                >
                                                    {recentPaths.length > 0 ? (
                                                        recentPaths.map((p) => (
                                                            <DropdownItem
                                                                key={p}
                                                                description={detectDriveKind(
                                                                    p
                                                                )}
                                                                startContent={
                                                                    <HardDrive
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                }
                                                            >
                                                                {p}
                                                            </DropdownItem>
                                                        ))
                                                    ) : (
                                                        <DropdownItem
                                                            isDisabled
                                                        >
                                                            No history yet
                                                        </DropdownItem>
                                                    )}
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>

                                        {isDiskSpaceCritical && (
                                            <div className="flex items-center gap-2 text-danger text-xs bg-danger/10 p-2 rounded-md border border-danger/20 animate-pulse">
                                                <AlertTriangle size={14} />
                                                <span className="font-bold">
                                                    Disk Full &mdash; Torrent
                                                    will be added PAUSED.
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <Divider className="bg-white/5 mb-6" />

                                    <div className="flex flex-col gap-4 mb-6">
                                        <label className={SECTION_LABEL}>
                                            <Tag size={12} /> METADATA
                                        </label>
                                        <Input
                                            label="Name"
                                            labelPlacement="outside"
                                            value={name}
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            variant="bordered"
                                            classNames={{
                                                inputWrapper:
                                                    "border-white/10 hover:border-white/20 bg-transparent",
                                            }}
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            <Select
                                                label="Start Behavior"
                                                labelPlacement="outside"
                                                selectedKeys={[commitMode]}
                                                onChange={(e) =>
                                                    setCommitMode(
                                                        e.target.value as any
                                                    )
                                                }
                                                variant="bordered"
                                                classNames={{
                                                    trigger:
                                                        "border-white/10 hover:border-white/20 bg-transparent",
                                                }}
                                            >
                                                <SelectItem
                                                    key="start"
                                                    startContent={
                                                        <PlayCircle
                                                            size={14}
                                                            className="text-success"
                                                        />
                                                    }
                                                >
                                                    Add & Start
                                                </SelectItem>
                                                <SelectItem
                                                    key="paused"
                                                    startContent={
                                                        <PauseCircle
                                                            size={14}
                                                            className="text-warning"
                                                        />
                                                    }
                                                >
                                                    Add Paused
                                                </SelectItem>
                                            </Select>
                                            <Input
                                                label="Category"
                                                labelPlacement="outside"
                                                placeholder="None"
                                                value={category || ""}
                                                onChange={(e) =>
                                                    setCategory(e.target.value)
                                                }
                                                variant="bordered"
                                                classNames={{
                                                    inputWrapper:
                                                        "border-white/10 hover:border-white/20 bg-transparent",
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <Divider className="bg-white/5 mb-6" />

                                    <div className="flex flex-col gap-3">
                                        <label className={SECTION_LABEL}>
                                            <Hash size={12} /> TRANSFER FLAGS
                                        </label>
                                        <div className="flex flex-col gap-3 bg-black/10 p-3 rounded-lg border border-white/5">
                                            <Checkbox
                                                isSelected={sequential}
                                                onValueChange={setSequential}
                                                size="sm"
                                                classNames={{
                                                    label: "text-foreground/70 text-xs",
                                                }}
                                                startContent={
                                                    <ListOrdered
                                                        size={14}
                                                        className="mr-2 text-foreground/50"
                                                    />
                                                }
                                            >
                                                Sequential Download
                                            </Checkbox>
                                            <Divider className="bg-white/5" />
                                            <Checkbox
                                                isSelected={skipHashCheck}
                                                onValueChange={setSkipHashCheck}
                                                size="sm"
                                                classNames={{
                                                    label: "text-foreground/70 text-xs",
                                                }}
                                                startContent={
                                                    <CheckCircle2
                                                        size={14}
                                                        className="mr-2 text-foreground/50"
                                                    />
                                                }
                                            >
                                                Skip Hash Check
                                            </Checkbox>
                                        </div>
                                    </div>
                                </div>
                            </Panel>

                            {/* === RESIZE HANDLE === */}
                            {/* Hide handle when collapsed to make space usage cleaner */}
                            {!isSettingsCollapsed && (
                                <PanelResizeHandle className="w-4 flex items-center justify-center bg-transparent -ml-2 z-10 hover:bg-primary/5 transition-colors cursor-col-resize group focus:outline-none relative">
                                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/5 group-hover:bg-primary/50 transition-colors" />
                                    <div className="relative bg-content1 border border-white/10 rounded-full p-0.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 duration-200">
                                        <GripVertical
                                            size={12}
                                            className="text-foreground"
                                        />
                                    </div>
                                </PanelResizeHandle>
                            )}

                            {/* === RIGHT PANEL: FILE MANAGER === */}
                            <Panel
                                defaultSize={60}
                                minSize={30}
                                className={PANE_SURFACE}
                            >
                                <div
                                    className="flex flex-col h-full bg-black/10 outline-none"
                                    tabIndex={0}
                                    onKeyDown={handleFilesKeyDown}
                                >
                                    {/* Toolbar */}
                                    <div className="p-3 border-b border-white/5 flex gap-2 items-center bg-white/5 backdrop-blur-sm">
                                        {/* 3. Panel Toggle Button */}
                                        <Tooltip
                                            content={
                                                isSettingsCollapsed
                                                    ? "Show Settings"
                                                    : "Maximize Files"
                                            }
                                        >
                                            <Button
                                                isIconOnly
                                                size="sm"
                                                variant="light"
                                                onPress={toggleSettingsPanel}
                                                className="mr-1 text-foreground/50 hover:text-foreground"
                                            >
                                                {isSettingsCollapsed ? (
                                                    <SidebarOpen size={18} />
                                                ) : (
                                                    <SidebarClose size={18} />
                                                )}
                                            </Button>
                                        </Tooltip>

                                        <Input
                                            value={filter}
                                            onChange={(e) =>
                                                setFilter(e.target.value)
                                            }
                                            placeholder="Filter files..."
                                            startContent={
                                                <Wand2
                                                    size={14}
                                                    className="text-foreground/30"
                                                />
                                            }
                                            size="sm"
                                            className="w-full"
                                            variant="flat"
                                            classNames={{
                                                inputWrapper:
                                                    "bg-black/20 border border-white/5 group-hover:border-white/10",
                                            }}
                                            isClearable
                                            onClear={() => setFilter("")}
                                        />
                                        <Dropdown>
                                            <DropdownTrigger>
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    className="bg-black/20 border border-white/5 min-w-8 px-2"
                                                >
                                                    <Sparkles
                                                        size={16}
                                                        className="text-primary"
                                                    />
                                                </Button>
                                            </DropdownTrigger>
                                            <DropdownMenu
                                                onAction={(k) =>
                                                    handleSmartSelect(k as any)
                                                }
                                                aria-label="Smart Select"
                                            >
                                                <DropdownItem
                                                    key="all"
                                                    shortcut="Ctrl+A"
                                                >
                                                    Select All
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="videos"
                                                    startContent={
                                                        <FileVideo size={14} />
                                                    }
                                                >
                                                    Select Videos
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="largest"
                                                    startContent={
                                                        <ArrowDown size={14} />
                                                    }
                                                >
                                                    Select Largest
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="invert"
                                                    showDivider
                                                    shortcut="Ctrl+I"
                                                >
                                                    Invert Selection
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="none"
                                                    className="text-danger"
                                                >
                                                    Select None
                                                </DropdownItem>
                                            </DropdownMenu>
                                        </Dropdown>
                                    </div>

                                    {/* Content Area */}
                                    <div className="flex-1 min-h-0 flex flex-col relative">
                                        {resolvedState !== "ready" ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/40 gap-4 z-20 bg-background/50 backdrop-blur-sm">
                                                {resolvedState === "pending" ? (
                                                    <Spinner
                                                        size="lg"
                                                        color="primary"
                                                    />
                                                ) : (
                                                    <StatusIcon
                                                        Icon={AlertTriangle}
                                                        className="text-danger"
                                                        size="lg"
                                                    />
                                                )}
                                                <p className="font-mono text-sm uppercase tracking-widest">
                                                    {resolvedState === "pending"
                                                        ? "Resolving Metadata..."
                                                        : "Magnet Error"}
                                                </p>
                                                {resolvedState === "error" &&
                                                    onResolveMagnet && (
                                                        <Button
                                                            size="sm"
                                                            color="primary"
                                                            onPress={
                                                                onResolveMagnet
                                                            }
                                                            isLoading={
                                                                isResolvingSource
                                                            }
                                                        >
                                                            Retry
                                                        </Button>
                                                    )}
                                            </div>
                                        ) : (
                                            <>
                                                {/* Sticky Table Header */}
                                                <div
                                                    className="grid border-b border-white/5 bg-white/5 backdrop-blur-md text-[10px] uppercase font-bold tracking-wider text-foreground/40 select-none z-10"
                                                    style={{
                                                        gridTemplateColumns:
                                                            FILE_GRID_TEMPLATE,
                                                        height: "32px",
                                                    }}
                                                >
                                                    <div className="flex items-center justify-center h-full">
                                                        <CheckCircle2
                                                            size={12}
                                                        />
                                                    </div>
                                                    <div className="flex items-center h-full">
                                                        Name
                                                    </div>
                                                    <div className="flex items-center h-full font-mono">
                                                        Size
                                                    </div>
                                                    <div className="flex items-center h-full pl-2">
                                                        Priority
                                                    </div>
                                                </div>

                                                {/* Virtual List */}
                                                <div
                                                    ref={scrollParentRef}
                                                    className="flex-1 overflow-y-auto custom-scrollbar"
                                                >
                                                    <div
                                                        style={{
                                                            height: virtualizer.getTotalSize(),
                                                            position:
                                                                "relative",
                                                        }}
                                                    >
                                                        {virtualizer
                                                            .getVirtualItems()
                                                            .map(
                                                                (
                                                                    virtualItem
                                                                ) => (
                                                                    <div
                                                                        key={
                                                                            virtualItem.key
                                                                        }
                                                                        style={{
                                                                            position:
                                                                                "absolute",
                                                                            top: 0,
                                                                            left: 0,
                                                                            width: "100%",
                                                                            transform: `translateY(${virtualItem.start}px)`,
                                                                        }}
                                                                    >
                                                                        {renderFileRow(
                                                                            filteredFiles[
                                                                                virtualItem
                                                                                    .index
                                                                            ]
                                                                        )}
                                                                    </div>
                                                                )
                                                            )}
                                                    </div>
                                                </div>

                                                {/* Selection Footer Stats */}
                                                <div className="border-t border-white/5 p-2 text-xs font-mono text-center text-foreground/30 bg-black/20 flex justify-between px-4">
                                                    <span>
                                                        {selected.size} /{" "}
                                                        {files.length} items
                                                    </span>
                                                    <span>
                                                        {formatBytes(
                                                            selectedSize
                                                        )}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                        </PanelGroup>
                    </ModalBody>

                    {/* --- FOOTER --- */}
                    <ModalFooter className="flex justify-between items-center gap-6">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                <HardDrive
                                    size={16}
                                    className="text-foreground/50"
                                />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] uppercase tracking-wider text-foreground/40 font-bold">
                                    Save Path
                                </span>
                                <span
                                    className="font-mono text-xs truncate text-foreground/80"
                                    title={downloadDir}
                                >
                                    {downloadDir}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-3 shrink-0">
                            <Button
                                variant="light"
                                onPress={onCancel}
                                isDisabled={isSubmitting}
                                className="font-medium"
                            >
                                {t("modals.cancel")}
                            </Button>

                            <Tooltip
                                content={
                                    isSelectionEmpty
                                        ? "Select at least one file"
                                        : isDiskSpaceCritical
                                        ? "Disk full - will add paused"
                                        : ""
                                }
                            >
                                <div className="inline-block">
                                    <Button
                                        color={
                                            isDiskSpaceCritical
                                                ? "warning"
                                                : "primary"
                                        }
                                        variant="shadow"
                                        onPress={() =>
                                            formRef.current?.requestSubmit()
                                        }
                                        isLoading={isSubmitting}
                                        isDisabled={!canConfirm}
                                        startContent={
                                            !isSubmitting &&
                                            (effectiveCommitMode ===
                                            "paused" ? (
                                                <PauseCircle size={16} />
                                            ) : (
                                                <PlayCircle size={16} />
                                            ))
                                        }
                                        className="font-bold px-6 min-w-[140px]"
                                    >
                                        {effectiveCommitMode === "paused"
                                            ? "Add Paused"
                                            : "Add & Start"}
                                    </Button>
                                </div>
                            </Tooltip>
                        </div>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}
