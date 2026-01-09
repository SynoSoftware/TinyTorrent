import {
    Accordion,
    AccordionItem,
    Button,
    Checkbox,
    Chip,
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
} from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
    type DragEvent,
    type FormEvent,
    type KeyboardEvent,
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

type SmartSelectCommand = "videos" | "largest" | "invert";

// --- CONSTANTS & HELPERS ---

const HISTORY_KEY = "tt-add-save-history";
const HISTORY_LIMIT = 6;

// A strict grid template to ensure headers align perfectly with rows
// [Checkbox] [Icon+Name] [Size] [Priority]
const FILE_GRID_TEMPLATE = "40px minmax(0, 1fr) 90px 110px";

const MODAL_CLASSES =
    "w-full h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-white/10";
const PANE_SURFACE = "h-full flex flex-col min-h-0 bg-transparent";
const SECTION_HEADER =
    "text-xs font-bold tracking-widest text-foreground/50 uppercase mb-2";

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

        // Persist download dir history
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
            if (command === "invert") {
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

    // -- Validation --
    const resolvedState = useMemo(() => {
        if (source?.kind === "magnet" && !source.metadata) {
            if (source.status === "error") return "error";
            return "pending";
        }
        return files.length ? "ready" : "pending";
    }, [files.length, source]);

    const canConfirm =
        files.length > 0 &&
        !!downloadDir.trim() &&
        !isSubmitting &&
        resolvedState === "ready";

    // -- Virtualization --
    const virtualizer = useVirtualizer({
        count: filteredFiles.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => rowHeight,
        overscan: 10,
    });

    // -- Renderers --

    // 1. File Row Renderer
    const renderFileRow = (file: FileRow) => {
        const priority = priorities.get(file.index) ?? "normal";
        const fileType = classifyFile(file.path);
        const Icon = getFileIcon(fileType);
        const isSelected = selected.has(file.index);

        return (
            <div
                key={file.index}
                className={cn(
                    "grid items-center border-b border-default/5 hover:bg-white/5 transition-colors cursor-pointer group select-none",
                    isSelected ? "bg-primary/5" : "bg-transparent",
                    "text-xs"
                )}
                style={{
                    gridTemplateColumns: FILE_GRID_TEMPLATE,
                    height: rowHeight,
                }}
                onClick={(e) => {
                    // Avoid toggling when clicking the Select dropdown
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
                                "h-6 min-h-6 w-24 bg-transparent data-[hover=true]:bg-white/10 priority-trigger",
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
        );
    };

    // 2. Main Modal Render
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(o) => !o && onCancel()}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!isSubmitting}
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, MODAL_CLASSES),
                body: "p-0",
                header: "border-b border-white/5 bg-black/40 p-4",
                footer: "border-t border-white/5 bg-black/40 p-4",
            }}
            size="5xl"
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
                                commitMode,
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
                        <div className="flex items-center gap-3">
                            <Chip
                                size="sm"
                                variant="flat"
                                color="primary"
                                startContent={<Inbox size={12} />}
                                classNames={{ content: "font-mono font-bold" }}
                            >
                                {files.length} FILE{files.length !== 1 && "S"}
                            </Chip>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={onCancel}
                                ariaLabel="Close"
                            />
                        </div>
                    </ModalHeader>

                    {/* --- SPLIT VIEW BODY --- */}
                    <ModalBody className="flex-1 min-h-0 bg-content1/5 relative">
                        {/* Drop Zone Overlay */}
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
                                defaultSize={50}
                                minSize={30}
                                className={cn(PANE_SURFACE, "bg-content1/20")}
                            >
                                <div className="p-6 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
                                    {/* Group 1: Destination */}
                                    <div
                                        className="flex flex-col gap-3"
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex justify-between items-center">
                                            <label className={SECTION_HEADER}>
                                                {t(
                                                    "modals.add_torrent.destination"
                                                )}
                                            </label>
                                            {/* Free Space Micro-Gauge */}
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
                                                    <Progress
                                                        value={Math.min(
                                                            100,
                                                            (selectedSize /
                                                                freeSpace.sizeBytes) *
                                                                100
                                                        )}
                                                        color={
                                                            selectedSize >
                                                            freeSpace.sizeBytes
                                                                ? "danger"
                                                                : "success"
                                                        }
                                                        size="sm"
                                                        className="w-24"
                                                        aria-label="Disk Usage"
                                                    />
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

                                        {/* Space Warning */}
                                        {freeSpace &&
                                            selectedSize >
                                                freeSpace.sizeBytes && (
                                                <div className="flex items-center gap-2 text-danger text-xs bg-danger/10 p-2 rounded-md border border-danger/20">
                                                    <AlertTriangle size={14} />
                                                    <span>
                                                        Insufficient disk space
                                                    </span>
                                                </div>
                                            )}
                                    </div>

                                    {/* Group 2: Metadata */}
                                    <div className="flex flex-col gap-3">
                                        <label className={SECTION_HEADER}>
                                            {t("modals.add_torrent.name_label")}
                                        </label>
                                        <Input
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
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-3">
                                            <label className={SECTION_HEADER}>
                                                {t(
                                                    "modals.add_torrent.start_behavior"
                                                )}
                                            </label>
                                            <Select
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
                                        </div>
                                    </div>

                                    {/* Group 3: Advanced */}
                                    <Accordion
                                        variant="light"
                                        className="px-0 border-t border-white/5 pt-2"
                                        itemClasses={{
                                            title: "text-sm text-foreground/80",
                                            trigger: "py-2",
                                        }}
                                    >
                                        <AccordionItem
                                            key="1"
                                            aria-label="Options"
                                            title="Transfer Options"
                                            subtitle={
                                                <span className="text-xs text-foreground/40">
                                                    Category, Sequential, Hash
                                                    Check
                                                </span>
                                            }
                                        >
                                            <div className="space-y-4 pt-2 pb-2 pl-1">
                                                <Input
                                                    label="Category"
                                                    labelPlacement="outside"
                                                    placeholder="No category"
                                                    value={category || ""}
                                                    onChange={(e) =>
                                                        setCategory(
                                                            e.target.value
                                                        )
                                                    }
                                                    size="sm"
                                                    variant="bordered"
                                                />
                                                <div className="flex flex-col gap-3">
                                                    <Checkbox
                                                        isSelected={sequential}
                                                        onValueChange={
                                                            setSequential
                                                        }
                                                        size="sm"
                                                        classNames={{
                                                            label: "text-foreground/70",
                                                        }}
                                                    >
                                                        Sequential Download
                                                    </Checkbox>
                                                    <Checkbox
                                                        isSelected={
                                                            skipHashCheck
                                                        }
                                                        onValueChange={
                                                            setSkipHashCheck
                                                        }
                                                        size="sm"
                                                        classNames={{
                                                            label: "text-foreground/70",
                                                        }}
                                                    >
                                                        Skip Hash Check
                                                    </Checkbox>
                                                </div>
                                            </div>
                                        </AccordionItem>
                                    </Accordion>
                                </div>
                            </Panel>

                            {/* === RESIZE HANDLE === */}
                            <PanelResizeHandle className="w-4 flex items-center justify-center bg-transparent -ml-2 z-10 hover:bg-primary/5 transition-colors cursor-col-resize group focus:outline-none relative">
                                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/5 group-hover:bg-primary/50 transition-colors" />
                                <div className="relative bg-content1 border border-white/10 rounded-full p-0.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 duration-200">
                                    <GripVertical
                                        size={12}
                                        className="text-foreground"
                                    />
                                </div>
                            </PanelResizeHandle>

                            {/* === RIGHT PANEL: FILE MANAGER === */}
                            <Panel
                                defaultSize={50}
                                minSize={30}
                                className={PANE_SURFACE}
                            >
                                <div className="flex flex-col h-full bg-black/10">
                                    {/* Toolbar */}
                                    <div className="p-3 border-b border-white/5 flex gap-2 items-center bg-white/5 backdrop-blur-sm">
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
                                                >
                                                    Invert Selection
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
                                                <div className="border-t border-white/5 p-2 text-xs font-mono text-center text-foreground/30 bg-black/20">
                                                    {selected.size} /{" "}
                                                    {files.length} files
                                                    selected (
                                                    {formatBytes(selectedSize)})
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
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={() => formRef.current?.requestSubmit()}
                                isLoading={isSubmitting}
                                isDisabled={!canConfirm}
                                startContent={
                                    !isSubmitting && <ArrowDown size={16} />
                                }
                                className="font-bold px-6"
                            >
                                {commitMode === "paused"
                                    ? "Add Paused"
                                    : "Add & Start"}
                            </Button>
                        </div>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}
