import {
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
import { KEY_SCOPE, INTERACTION_CONFIG, CONFIG } from "@/config/logic";

// Use design config where possible. Fall back to explicit values when token missing (FLAGs added where appropriate).
const VIRTUALIZER_OVERSCAN = CONFIG.layout?.table?.overscan ?? 10;
const SETTINGS_PANEL_DEFAULT =
    CONFIG.layout?.modals?.add_settings_default_size ?? 40; // FLAG: consider moving to token
const SETTINGS_PANEL_MIN = CONFIG.layout?.modals?.add_settings_min_size ?? 25; // FLAG
const FILE_PANEL_DEFAULT =
    CONFIG.layout?.modals?.add_filepanel_default_size ?? 60; // FLAG
const FILE_PANEL_MIN = CONFIG.layout?.modals?.add_filepanel_min_size ?? 30; // FLAG

// ESCAPE HATCH: Virtualization requires pixel transforms for performant translation. This is a documented exception to No-New-Numbers.
const virtualRowTransform = (start: number) => ({
    transform: `translateY(${start}px)`,
});
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
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
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

// Rename candidates documented in `RENAME_CANDIDATES.md`
const HISTORY_KEY = "tt-add-save-history";
// NON-VISUAL: history limit governs saved-path history length and is intentionally a small integer (non-visual system parameter)
const HISTORY_LIMIT = 6;

// FLAG: Tokenize this layout template via the token pipeline as `--tt-file-grid-template` and derive from --u/* geometry.
const FILE_GRID_TEMPLATE = "var(--tt-file-grid-template)";

const MODAL_CLASSES =
    "w-full overflow-hidden flex flex-col shadow-2xl border border-default/10";
const PANE_SURFACE = "h-full flex flex-col min-h-0 bg-transparent";
const SECTION_LABEL =
    "text-label font-bold tracking-widest text-foreground/40 uppercase mb-panel flex items-center gap-tools";

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
    // FLAG: keep free-space inspection state — setters are required by async logic but the values are
    // not currently rendered. We keep the getters for future diagnostics/UI; reference them below to
    // avoid unused-variable lint complaints (no behavioral change).
    const [spaceError, setSpaceError] = useState<string | null>(null);
    const [isCheckingSpace, setIsCheckingSpace] = useState(false);
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);

    // Ensure getters are referenced so linters don't flag them as unused. No-op references only.
    void spaceError;
    void isCheckingSpace;
    void isTouchingDirectory;

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
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const setPriority = useCallback(
        (index: number, value: "low" | "normal" | "high") => {
            setPriorities((prev) => {
                const next = new Map(prev);
                if (value === "normal") next.delete(index);
                else next.set(index, value);
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
        overscan: VIRTUALIZER_OVERSCAN,
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
                    "grid items-center border-b border-default/5 cursor-pointer group select-none box-border",
                    isSelected
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "bg-transparent hover:bg-content1/5",
                    "text-scaled"
                )}
                style={{
                    gridTemplateColumns: FILE_GRID_TEMPLATE,
                    height: rowHeight,
                    minHeight: rowHeight,
                }}
                ref={virtualizer.measureElement}
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
                        classNames={{ wrapper: "after:bg-primary" }}
                    />
                </div>

                <div className="flex items-center gap-tools min-w-0 pr-panel">
                    <Icon
                        className={cn(
                            "toolbar-icon-size-md shrink-0",
                            fileType === "video"
                                ? "text-primary"
                                : "text-foreground/40"
                        )}
                    />
                    <span
                        className={cn(
                            "truncate select-text transition-colors text-foreground",
                            isSelected ? "opacity-100" : "opacity-90"
                        )}
                        title={file.path}
                    >
                        {file.path}
                    </span>
                </div>

                <div className="font-mono text-scaled text-foreground/50">
                    {formatBytes(file.length)}
                </div>

                <div className="pr-panel flex justify-end">
                    <div className="flex items-center">
                        <div
                            className="priority-trigger mr-tight cursor-pointer transition-transform"
                            onClick={(e) => {
                                e.stopPropagation();
                                cyclePriority(file.index);
                            }}
                            title={t(
                                "modals.add_torrent.click_to_cycle_priority"
                            )}
                        >
                            {priority === "high" && (
                                <ArrowDown className="rotate-180 toolbar-icon-size-md text-success" />
                            )}
                            {priority === "low" && (
                                <ArrowDown className="toolbar-icon-size-md text-warning" />
                            )}
                            {priority === "normal" && (
                                <span className="size-dot block bg-foreground/20 rounded-full mx-tight" />
                            )}
                        </div>

                        <Select
                            aria-label={t("modals.add_torrent.col_priority")}
                            selectedKeys={[priority]}
                            onSelectionChange={(k) =>
                                setPriority(
                                    file.index,
                                    Array.from(k)[0] as
                                        | "low"
                                        | "normal"
                                        | "high"
                                )
                            }
                            variant="flat"
                            disallowEmptySelection
                            classNames={{
                                trigger:
                                    "h-button min-w-status-chip bg-transparent data-[hover=true]:bg-content1/10 priority-trigger pl-tight",
                                value: "text-label uppercase font-bold text-right",
                                popoverContent: "min-w-badge",
                            }}
                        >
                            <SelectItem
                                key="high"
                                startContent={
                                    <ArrowDown className="rotate-180 toolbar-icon-size-md text-success" />
                                }
                            >
                                {t("modals.add_torrent.priority_high")}
                            </SelectItem>
                            <SelectItem
                                key="normal"
                                startContent={
                                    <span className="size-dot block bg-foreground/20 rounded-full ml-tight" />
                                }
                            >
                                {t("modals.add_torrent.priority_normal")}
                            </SelectItem>
                            <SelectItem
                                key="low"
                                startContent={
                                    <ArrowDown className="toolbar-icon-size-md text-warning" />
                                }
                            >
                                {t("modals.add_torrent.priority_low")}
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
                    "surface-layer-2 border-default/5",
                    isFullscreen
                        ? "h-full rounded-none border-0"
                        : "max-h-modal-body"
                ),
                body: "p-0 bg-content1/10",
                header: "p-0 border-b border-default/10 select-none",
                footer: "p-0 border-t border-default/10 select-none",
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
                        // ESCAPE HATCH: Local submit shortcut kept at modal level for convenience.
                        // TODO: Consider registering this in the central keyboard command registry.
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                            formRef.current?.requestSubmit();
                    }}
                >
                    {/* --- HEADER --- */}
                    <ModalHeader className="flex justify-between items-center gap-panel px-stage py-panel">
                        <div className="flex flex-col overflow-hidden gap-tight">
                            <h2 className="text-label font-bold tracking-widest uppercase text-foreground">
                                {t("modals.add_torrent.title")}
                            </h2>
                            <span className="text-scaled text-foreground/50 truncate font-mono leading-tight">
                                {source?.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-tools">
                            <Chip
                                size="md"
                                variant="flat"
                                color={isSelectionEmpty ? "default" : "primary"}
                                startContent={
                                    <Inbox
                                        className="toolbar-icon-size-md"
                                        size="md"
                                    />
                                }
                                classNames={{ content: "font-mono font-bold" }}
                            >
                                {t("modals.add_torrent.file_count", {
                                    count: files.length,
                                })}
                            </Chip>
                            <div className="h-status-chip w-px bg-content1/10 mx-tight" />
                            {/* 2. Fullscreen Toggle */}
                            <Tooltip
                                content={
                                    isFullscreen
                                        ? t(
                                              "modals.add_torrent.exit_fullscreen"
                                          )
                                        : t("modals.add_torrent.fullscreen")
                                }
                            >
                                <ToolbarIconButton
                                    Icon={isFullscreen ? Minimize2 : Maximize2}
                                    ariaLabel={
                                        isFullscreen
                                            ? t(
                                                  "modals.add_torrent.exit_fullscreen"
                                              )
                                            : t("modals.add_torrent.fullscreen")
                                    }
                                    onPress={() =>
                                        setIsFullscreen(!isFullscreen)
                                    }
                                    iconSize="lg"
                                    className="text-foreground/60 hover:text-foreground"
                                />
                            </Tooltip>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={onCancel}
                                ariaLabel={t("torrent_modal.actions.close")}
                                iconSize="lg"
                                className="text-foreground/60 hover:text-foreground"
                            />
                        </div>
                    </ModalHeader>

                    {/* --- SPLIT VIEW BODY --- */}
                    <ModalBody className="flex-1 min-h-0 relative">
                        {dropActive && (
                            <div className="absolute inset-0 z-drop-overlay bg-primary/20 backdrop-blur-sm border-(--tt-divider-width) border-primary border-dashed m-panel rounded-xl flex items-center justify-center pointer-events-none">
                                <div className="bg-background px-stage py-tight rounded-full shadow-xl flex items-center gap-tools animate-pulse">
                                    <FolderOpen className="toolbar-icon-size-lg text-primary" />
                                    <span className="text-scaled font-bold">
                                        {t(
                                            "modals.add_torrent.drop_to_change_destination"
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}

                        <PanelGroup direction="horizontal">
                            {/* === LEFT PANEL: CONFIGURATION === */}
                            <Panel
                                ref={settingsPanelRef}
                                defaultSize={SETTINGS_PANEL_DEFAULT}
                                minSize={SETTINGS_PANEL_MIN}
                                collapsible
                                onCollapse={() => setIsSettingsCollapsed(true)}
                                onExpand={() => setIsSettingsCollapsed(false)}
                                className={cn(
                                    PANE_SURFACE,
                                    "bg-content1/20",
                                    isSettingsCollapsed &&
                                        "min-w-0 w-0 border-none"
                                )}
                            >
                                <div className="p-panel flex flex-col h-full overflow-y-auto custom-scrollbar">
                                    {/* ... [Content of Left Panel same as before] ... */}
                                    <div
                                        className="flex flex-col gap-tools mb-panel"
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex justify-between items-center">
                                            <label className={SECTION_LABEL}>
                                                <HardDrive className="toolbar-icon-size-md" />{" "}
                                                {t(
                                                    "modals.add_torrent.destination"
                                                )}
                                            </label>
                                            {freeSpace && (
                                                <div className="flex items-center gap-tools">
                                                    <div className="text-label font-mono text-right">
                                                        <div className="text-foreground/60">
                                                            {formatBytes(
                                                                freeSpace.sizeBytes
                                                            )}{" "}
                                                            <span className="uppercase">
                                                                {t(
                                                                    "modals.add_torrent.free"
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Tooltip
                                                        content={t(
                                                            "modals.add_torrent.selected_size_tooltip",
                                                            {
                                                                size: formatBytes(
                                                                    selectedSize
                                                                ),
                                                            }
                                                        )}
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
                                                            className="w-status-chip"
                                                            aria-label={t(
                                                                "modals.add_torrent.free_space_label"
                                                            )}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-tools group">
                                            <Input
                                                value={downloadDir}
                                                onChange={(e) =>
                                                    setDownloadDir(
                                                        e.target.value
                                                    )
                                                }
                                                variant="flat"
                                                classNames={{
                                                    input: "font-mono text-scaled",
                                                    inputWrapper:
                                                        "surface-layer-1 transition-colors shadow-none group-hover:border-default/10",
                                                }}
                                                startContent={
                                                    <FolderOpen className="toolbar-icon-size-md text-primary mb-tight" />
                                                }
                                            />
                                            {onBrowseDirectory && (
                                                <Button
                                                    onPress={handleBrowse}
                                                    isIconOnly
                                                    size="md"
                                                    variant="flat"
                                                    className="surface-layer-1 border border-default/10"
                                                >
                                                    <Sparkles className="toolbar-icon-size-md text-foreground/50" />
                                                </Button>
                                            )}
                                            <Dropdown>
                                                <DropdownTrigger>
                                                    <Button
                                                        isIconOnly
                                                        size="md"
                                                        variant="flat"
                                                        className="surface-layer-1 border border-default/10"
                                                    >
                                                        <ChevronDown className="toolbar-icon-size-md text-foreground/50" />
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu
                                                    aria-label={t(
                                                        "modals.add_torrent.history"
                                                    )}
                                                >
                                                    {recentPaths.length > 0 ? (
                                                        recentPaths.map((p) => (
                                                            <DropdownItem
                                                                key={p}
                                                                description={detectDriveKind(
                                                                    p
                                                                )}
                                                                startContent={
                                                                    <HardDrive className="toolbar-icon-size-md" />
                                                                }
                                                                onPress={() =>
                                                                    applyDroppedPath(
                                                                        p
                                                                    )
                                                                }
                                                            >
                                                                {p}
                                                            </DropdownItem>
                                                        ))
                                                    ) : (
                                                        <DropdownItem
                                                            key="history-empty"
                                                            isDisabled
                                                        >
                                                            {t(
                                                                "modals.add_torrent.history_empty"
                                                            )}
                                                        </DropdownItem>
                                                    )}
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>

                                        {isDiskSpaceCritical && (
                                            <div className="flex items-center gap-tools text-danger text-label bg-danger/10 p-tight rounded-panel border border-danger/20 animate-pulse">
                                                <AlertTriangle className="toolbar-icon-size-md" />
                                                <span className="font-bold">
                                                    {t(
                                                        "modals.add_torrent.disk_full_paused"
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <Divider className="bg-content1/5 mb-panel" />

                                    <div className="flex flex-col gap-tools mb-panel">
                                        <label className={SECTION_LABEL}>
                                            <Tag className="toolbar-icon-size-md" />{" "}
                                            {t(
                                                "modals.add_torrent.files_title"
                                            )}
                                        </label>
                                        <Input
                                            label={t(
                                                "modals.add_torrent.name_label"
                                            )}
                                            labelPlacement="outside"
                                            value={name}
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            variant="bordered"
                                            classNames={{
                                                inputWrapper:
                                                    "border-default/10 hover:border-default/20 bg-transparent",
                                            }}
                                        />
                                        <div className="grid grid-cols-2 gap-tools">
                                            <Select
                                                label={t(
                                                    "modals.add_torrent.start_behavior"
                                                )}
                                                labelPlacement="outside"
                                                selectedKeys={[commitMode]}
                                                onChange={(e) =>
                                                    setCommitMode(
                                                        e.target
                                                            .value as AddTorrentCommitMode
                                                    )
                                                }
                                                variant="bordered"
                                                classNames={{
                                                    trigger:
                                                        "border-default/10 hover:border-default/20 bg-transparent",
                                                }}
                                            >
                                                <SelectItem
                                                    key="start"
                                                    startContent={
                                                        <PlayCircle className="toolbar-icon-size-md text-success" />
                                                    }
                                                >
                                                    {t(
                                                        "modals.add_torrent.add_and_start"
                                                    )}
                                                </SelectItem>
                                                <SelectItem
                                                    key="paused"
                                                    startContent={
                                                        <PauseCircle className="toolbar-icon-size-md text-warning" />
                                                    }
                                                >
                                                    {t(
                                                        "modals.add_torrent.add_paused"
                                                    )}
                                                </SelectItem>
                                            </Select>
                                            <Input
                                                label={t(
                                                    "modals.add_torrent.category"
                                                )}
                                                labelPlacement="outside"
                                                placeholder={t(
                                                    "modals.add_torrent.none"
                                                )}
                                                value={category || ""}
                                                onChange={(e) =>
                                                    setCategory(e.target.value)
                                                }
                                                variant="bordered"
                                                classNames={{
                                                    inputWrapper:
                                                        "border-default/10 hover:border-default/20 bg-transparent",
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <Divider className="bg-content1/5 mb-panel" />

                                    <div className="flex flex-col gap-tools">
                                        <label className={SECTION_LABEL}>
                                            <Hash className="toolbar-icon-size-md" />{" "}
                                            {t(
                                                "modals.add_torrent.transfer_flags"
                                            )}
                                        </label>
                                        <div className="flex flex-col gap-tools surface-layer-1 rounded-panel p-tight">
                                            <Checkbox
                                                isSelected={sequential}
                                                onValueChange={setSequential}
                                                classNames={{
                                                    label: "text-foreground/70 text-label",
                                                }}
                                            >
                                                <span className="flex items-center">
                                                    <ListOrdered className="toolbar-icon-size-md mr-2 text-foreground/50" />
                                                    {t(
                                                        "modals.add_torrent.sequential_download"
                                                    )}
                                                </span>
                                            </Checkbox>
                                            <Divider className="bg-content1/5" />
                                            <Checkbox
                                                isSelected={skipHashCheck}
                                                onValueChange={setSkipHashCheck}
                                                classNames={{
                                                    label: "text-foreground/70 text-label",
                                                }}
                                            >
                                                <span className="flex items-center">
                                                    <CheckCircle2 className="toolbar-icon-size-md mr-2 text-foreground/50" />
                                                    {t(
                                                        "modals.add_torrent.skip_hash_check"
                                                    )}
                                                </span>
                                            </Checkbox>
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                            {/* === RESIZE HANDLE === */}
                            {/* Hide handle when collapsed to make space usage cleaner */}
                            {!isSettingsCollapsed && (
                                // FLAG: Consider tokenizing handle width and hover scale (e.g. --tt-resize-handle-w, --tt-handle-hover-scale). Avoid numeric literals in layout.
                                <PanelResizeHandle className="w-resize-handle flex items-center justify-center bg-transparent -ml-2 z-panel hover:bg-primary/5 transition-colors cursor-col-resize group focus:outline-none relative">
                                    <div className="absolute inset-y-0 left-1/2 w-divider bg-content1/5 group-hover:bg-primary/50 transition-colors" />
                                    <div className="relative bg-content1 border border-default/10 rounded-full p-tight shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                        <GripVertical className="toolbar-icon-size-md text-foreground" />
                                    </div>
                                </PanelResizeHandle>
                            )}
                            {/* === RIGHT PANEL: FILE MANAGER === */}
                            <Panel
                                defaultSize={FILE_PANEL_DEFAULT}
                                minSize={FILE_PANEL_MIN}
                                className={PANE_SURFACE}
                            >
                                <div
                                    className="flex flex-col h-full  outline-none"
                                    tabIndex={0}
                                    onKeyDown={handleFilesKeyDown}
                                >
                                    {/* Toolbar */}
                                    <div className="p-tight border-b border-default/5 flex gap-tools items-center bg-content1/5 backdrop-blur-sm">
                                        {/* 3. Panel Toggle Button */}
                                        <Tooltip
                                            content={
                                                isSettingsCollapsed
                                                    ? t(
                                                          "modals.add_torrent.show_settings"
                                                      )
                                                    : t(
                                                          "modals.add_torrent.maximize_files"
                                                      )
                                            }
                                        >
                                            <Button
                                                isIconOnly
                                                size="md"
                                                variant="light"
                                                onPress={toggleSettingsPanel}
                                                className="mr-tight text-foreground/50 hover:text-foreground"
                                            >
                                                {isSettingsCollapsed ? (
                                                    <SidebarOpen className="toolbar-icon-size-md" />
                                                ) : (
                                                    <SidebarClose className="toolbar-icon-size-md" />
                                                )}
                                            </Button>
                                        </Tooltip>

                                        <Input
                                            value={filter}
                                            onChange={(e) =>
                                                setFilter(e.target.value)
                                            }
                                            placeholder={t(
                                                "modals.add_torrent.filter_placeholder"
                                            )}
                                            startContent={
                                                <Wand2 className="toolbar-icon-size-md text-foreground/30" />
                                            }
                                            className="w-full text-scaled"
                                            variant="flat"
                                            classNames={{
                                                inputWrapper:
                                                    "surface-layer-1 group-hover:border-default/10",
                                            }}
                                            isClearable
                                            onClear={() => setFilter("")}
                                        />
                                        <Dropdown>
                                            <DropdownTrigger>
                                                <Button
                                                    variant="flat"
                                                    className="surface-layer-1 border border-default/10 min-w-badge px-tight"
                                                >
                                                    <Sparkles className="toolbar-icon-size-md text-primary" />
                                                </Button>
                                            </DropdownTrigger>
                                            <DropdownMenu
                                                aria-label={t(
                                                    "modals.add_torrent.smart_select"
                                                )}
                                            >
                                                <DropdownItem
                                                    key="all"
                                                    shortcut="Ctrl+A"
                                                    onPress={() =>
                                                        handleSmartSelect(
                                                            "all" as SmartSelectCommand
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        "modals.add_torrent.select_all"
                                                    )}
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="videos"
                                                    startContent={
                                                        <FileVideo className="toolbar-icon-size-md" />
                                                    }
                                                >
                                                    {t(
                                                        "modals.add_torrent.smart_select_videos"
                                                    )}
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="largest"
                                                    startContent={
                                                        <ArrowDown className="toolbar-icon-size-md" />
                                                    }
                                                >
                                                    {t(
                                                        "modals.add_torrent.smart_select_largest"
                                                    )}
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="invert"
                                                    showDivider
                                                    shortcut="Ctrl+I"
                                                >
                                                    {t(
                                                        "modals.add_torrent.smart_select_invert"
                                                    )}
                                                </DropdownItem>
                                                <DropdownItem
                                                    key="none"
                                                    className="text-danger"
                                                >
                                                    {t(
                                                        "modals.add_torrent.select_none"
                                                    )}
                                                </DropdownItem>
                                            </DropdownMenu>
                                        </Dropdown>
                                    </div>

                                    {/* Content Area */}
                                    <div className="flex-1 min-h-0 flex flex-col relative">
                                        {resolvedState !== "ready" ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/40 gap-tools z-modal-internal bg-background/50 backdrop-blur-sm">
                                                {resolvedState === "pending" ? (
                                                    <Spinner color="primary" />
                                                ) : (
                                                    <StatusIcon
                                                        Icon={AlertTriangle}
                                                        className="text-danger"
                                                    />
                                                )}
                                                <p className="font-mono text-label uppercase tracking-widest">
                                                    {resolvedState === "pending"
                                                        ? t(
                                                              "modals.add_magnet.resolving"
                                                          )
                                                        : t(
                                                              "modals.add_torrent.magnet_error"
                                                          )}
                                                </p>
                                                {resolvedState === "error" &&
                                                    onResolveMagnet && (
                                                        <Button
                                                            color="primary"
                                                            onPress={
                                                                onResolveMagnet
                                                            }
                                                            isLoading={
                                                                isResolvingSource
                                                            }
                                                        >
                                                            {t(
                                                                "modals.add_torrent.retry"
                                                            )}
                                                        </Button>
                                                    )}
                                            </div>
                                        ) : (
                                            <>
                                                {/* Sticky Table Header */}
                                                <div
                                                    className="grid border-b border-default/5 bg-content1/5 backdrop-blur-md uppercase font-bold tracking-wider text-foreground/40 select-none z-sticky box-border h-row"
                                                    style={{
                                                        gridTemplateColumns:
                                                            FILE_GRID_TEMPLATE,
                                                    }}
                                                >
                                                    <div className="flex items-center justify-center h-full">
                                                        <CheckCircle2 className="toolbar-icon-size-md" />
                                                    </div>
                                                    <div className="flex items-center h-full">
                                                        <span className="text-label">
                                                            {t(
                                                                "modals.add_torrent.col_name"
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center h-full font-mono">
                                                        <span className="text-label">
                                                            {t(
                                                                "modals.add_torrent.col_size"
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center h-full pl-tight">
                                                        <span className="text-label">
                                                            {t(
                                                                "modals.add_torrent.col_priority"
                                                            )}
                                                        </span>
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
                                                                            ...virtualRowTransform(
                                                                                virtualItem.start
                                                                            ),
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
                                                <div className="border-t border-default/5 p-tight text-label font-mono text-center text-foreground/30 bg-content1/5 flex justify-between px-panel">
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
                    <ModalFooter className="flex justify-between items-center gap-panel px-stage py-panel">
                        <div className="flex items-center gap-tools overflow-hidden">
                            <div className="h-status-chip w-status-chip rounded-panel bg-content1/5 flex items-center justify-center shrink-0">
                                <HardDrive className="toolbar-icon-size-md text-foreground/50" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-label uppercase tracking-wider text-foreground/40 font-bold">
                                    {t("modals.add_torrent.save_path")}
                                </span>
                                <span
                                    className="font-mono text-label truncate text-foreground/80"
                                    title={downloadDir}
                                >
                                    {downloadDir}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-tools shrink-0">
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
                                        ? t(
                                              "modals.add_torrent.tooltip_select_one"
                                          )
                                        : isDiskSpaceCritical
                                        ? t(
                                              "modals.add_torrent.disk_full_paused"
                                          )
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
                                                <PauseCircle className="toolbar-icon-size-md" />
                                            ) : (
                                                <PlayCircle className="toolbar-icon-size-md" />
                                            ))
                                        }
                                        className="font-bold px-stage min-w-button"
                                    >
                                        {effectiveCommitMode === "paused"
                                            ? t("modals.add_torrent.add_paused")
                                            : t(
                                                  "modals.add_torrent.add_and_start"
                                              )}
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
