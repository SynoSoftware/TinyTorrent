import {
    Accordion,
    AccordionItem,
    Button,
    Checkbox,
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
    Select,
    SelectItem,
    Spinner,
    cn,
} from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
    type DragEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    ArrowDown,
    ChevronDown,
    ChevronUp,
    FolderOpen,
    HardDrive,
    Inbox,
    Sparkles,
    Wand2,
    X,
} from "lucide-react";

import { INTERACTION_CONFIG, TABLE_LAYOUT } from "@/config/logic";
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

const HISTORY_KEY = "tt-add-save-history";
const HISTORY_LIMIT = 6;

function detectDriveKind(path: string): "SSD" | "HDD" | "Network" | "Unknown" {
    if (!path) return "Unknown";
    const normalized = path.replace(/\//g, "\\");
    if (normalized.startsWith("\\\\")) {
        return "Network";
    }
    const lower = normalized.toLowerCase();
    if (lower.includes("hdd")) return "HDD";
    if (lower.includes("ssd")) return "SSD";
    if (/^[a-zA-Z]:\\/i.test(normalized)) {
        const driveLetter = normalized[0]?.toUpperCase();
        if (driveLetter >= "D") {
            return "HDD";
        }
        return "SSD";
    }
    return "Unknown";
}

const MODAL_CLASSES =
    "w-full max-w-modal-add h-add-modal overflow-hidden flex flex-col";
const PANE_SURFACE = cn(
    GLASS_PANEL_SURFACE,
    "rounded-panel border border-default/20 backdrop-blur-md"
);
const PANE_SECTION = "flex flex-col gap-panel p-panel h-full min-h-0";
const HEADER_TITLE =
    "text-label font-semibold tracking-label uppercase text-foreground";
const SUBTLE_META = "text-scaled text-foreground/60";
const FIELD_LABEL = "text-label tracking-label uppercase font-semibold";
const TOOLBAR = "flex items-center justify-between gap-tools";
const TOOL_GAP = "flex items-center gap-tools";
const FILE_ROW =
    "grid items-center text-scaled border-b border-default/10 px-panel focus:outline-none";
const FILE_CELL = "truncate select-text";
const FILE_GRID_TEMPLATE =
    "minmax(0, var(--tt-col-icon)) minmax(0, 1fr) auto auto";

function usePanelPersistence(key: string, fallback: number[] | undefined) {
    const [layout, setLayout] = useState<number[] | undefined>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw) as number[];
            if (
                Array.isArray(parsed) &&
                parsed.every((n) => typeof n === "number")
            ) {
                return parsed;
            }
        } catch {
            // ignore malformed storage
        }
        return fallback;
    });

    const persist = useCallback(
        (next: number[]) => {
            setLayout(next);
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // ignore storage issues
            }
        },
        [key]
    );

    return { layout, persist };
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
    const [freeSpace, setFreeSpace] = useState<TransmissionFreeSpace | null>(
        null
    );
    const [spaceError, setSpaceError] = useState<string | null>(null);
    const [isCheckingSpace, setIsCheckingSpace] = useState(false);
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);
    const [panelGroupKey, setPanelGroupKey] = useState(() => Date.now());
    const [recentPaths, setRecentPaths] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        const raw = window.localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as string[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [dropActive, setDropActive] = useState(false);
    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const { persist: persistLayout } = usePanelPersistence(
        "tt-add-pane-layout",
        undefined
    );
    const tableOverscan =
        typeof TABLE_LAYOUT.overscan === "number" ? TABLE_LAYOUT.overscan : 12;

    const files = useMemo(
        () => buildFiles(source?.metadata),
        [source?.metadata]
    );
    const heroFile = files.length === 1 ? files[0] : undefined;
    const [heroNameInput, setHeroNameInput] = useState(heroFile?.path ?? "");
    useEffect(() => {
        if (heroFile) {
            setHeroNameInput(heroFile.path);
        }
    }, [heroFile]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(recentPaths));
    }, [recentPaths]);

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
                const text = event.dataTransfer?.getData("text/plain")?.trim();
                if (text) {
                    path = text;
                }
            }
            applyDroppedPath(path);
        },
        [applyDroppedPath]
    );

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDropActive(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDropActive(false);
    }, []);

    useEffect(() => {
        setDownloadDir(initialDownloadDir);
    }, [initialDownloadDir, isOpen]);

    useEffect(() => {
        setName(source?.metadata?.name ?? source?.label ?? "");
        setFilter("");
        setPriorities(new Map());
        setSequential(false);
        setSkipHashCheck(false);
        setCategory(null);
        const allIndexes = files.map((file) => file.index);
        setSelected(new Set(allIndexes));
        setPanelGroupKey(Date.now());
    }, [source?.label, source?.metadata, files, isOpen]);

    const filteredFiles = useMemo(
        () => filterFiles(files, filter),
        [files, filter]
    );

    const selectedSize = useMemo(() => {
        return files.reduce((sum, file) => {
            if (selected.has(file.index)) {
                return sum + file.length;
            }
            return sum;
        }, 0);
    }, [files, selected]);

    const handleSmartSelect = useCallback(
        (command: SmartSelectCommand) => {
            if (!files.length) return;
            if (command === "invert") {
                setSelected((prev) => {
                    const next = new Set<number>();
                    files.forEach((file) => {
                        if (!prev.has(file.index)) {
                            next.add(file.index);
                        }
                    });
                    return next;
                });
                return;
            }
            if (command === "largest") {
                const largest = files.reduce<FileRow | null>((acc, file) => {
                    if (!acc) return file;
                    return file.length > acc.length ? file : acc;
                }, null);
                if (largest) {
                    setSelected(new Set([largest.index]));
                }
                return;
            }
            if (command === "videos") {
                const videoIndexes = files
                    .filter((file) => classifyFile(file.path) === "video")
                    .map((file) => file.index);
                if (videoIndexes.length) {
                    setSelected(new Set(videoIndexes));
                }
            }
        },
        [files]
    );

    const toggleSelection = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    }, []);

    const setPriority = useCallback(
        (index: number, value: "low" | "normal" | "high") => {
            setPriorities((prev) => {
                const next = new Map(prev);
                if (value === "normal") {
                    next.delete(index);
                } else {
                    next.set(index, value);
                }
                return next;
            });
        },
        []
    );

    const resolvedState: "ready" | "pending" | "error" = useMemo(() => {
        if (source?.kind === "magnet") {
            if (source.status === "error") return "error";
            if (!source.metadata) return "pending";
        }
        if (files.length) return "ready";
        return "pending";
    }, [files.length, source]);

    const shouldShowHero = heroFile !== undefined && resolvedState === "ready";
    const magnetErrorMessage =
        source?.kind === "magnet" ? source.errorMessage : undefined;

    const commitLabel = useMemo(() => {
        if (commitMode === "paused") return t("modals.add_torrent.add_paused");
        if (commitMode === "top") return t("modals.add_torrent.add_and_start");
        return t("modals.add_torrent.add_and_start");
    }, [commitMode, t]);

    useEffect(() => {
        if (!checkFreeSpace) {
            setFreeSpace(null);
            setSpaceError(null);
            setIsCheckingSpace(false);
            return;
        }
        if (!downloadDir.trim()) {
            setFreeSpace(null);
            setSpaceError(null);
            setIsCheckingSpace(false);
            return;
        }
        let active = true;
        setIsCheckingSpace(true);
        setSpaceError(null);
        checkFreeSpace(downloadDir.trim())
            .then((space) => {
                if (!active) return;
                setFreeSpace(space);
            })
            .catch(() => {
                if (!active) return;
                setFreeSpace(null);
                setSpaceError(t("modals.add_torrent.free_space_unknown"));
            })
            .finally(() => {
                if (!active) return;
                setIsCheckingSpace(false);
            });
        return () => {
            active = false;
        };
    }, [checkFreeSpace, downloadDir, t]);

    const freeSpaceBytes = freeSpace?.sizeBytes ?? null;
    const isSpaceKnown = typeof freeSpaceBytes === "number";
    const isInsufficient =
        isSpaceKnown && typeof freeSpaceBytes === "number"
            ? selectedSize > freeSpaceBytes
            : false;

    const handleConfirm = useCallback(() => {
        if (!files.length || isSubmitting) return;
        const filesUnwanted: number[] = [];
        const priorityHigh: number[] = [];
        const priorityLow: number[] = [];
        const priorityNormal: number[] = [];
        files.forEach((file) => {
            if (!selected.has(file.index)) {
                filesUnwanted.push(file.index);
            }
            const value = priorities.get(file.index) ?? "normal";
            if (value === "high") priorityHigh.push(file.index);
            else if (value === "low") priorityLow.push(file.index);
            else priorityNormal.push(file.index);
        });
        onConfirm({
            downloadDir: downloadDir.trim(),
            name: name.trim() || (source?.metadata?.name ?? ""),
            commitMode,
            filesUnwanted,
            priorityHigh,
            priorityNormal,
            priorityLow,
            options: {
                category,
                sequential,
                skipHashCheck,
            },
        });
    }, [
        category,
        commitMode,
        downloadDir,
        files,
        isSubmitting,
        name,
        onConfirm,
        priorities,
        selected,
        sequential,
        skipHashCheck,
        source?.metadata?.name,
    ]);

    const virtualizer = useVirtualizer({
        count: filteredFiles.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => rowHeight,
        overscan: tableOverscan,
    });

    const handleBrowse = useCallback(async () => {
        if (!onBrowseDirectory) return;
        setIsTouchingDirectory(true);
        try {
            const next = await onBrowseDirectory(downloadDir);
            if (next) {
                setDownloadDir(next);
                pushRecentPath(next);
            }
        } finally {
            setIsTouchingDirectory(false);
        }
    }, [downloadDir, onBrowseDirectory]);
    const renderFileRow = (file: FileRow) => {
        const priority = priorities.get(file.index) ?? "normal";
        const tone =
            classifyFile(file.path) === "video"
                ? "text-primary"
                : classifyFile(file.path) === "text"
                ? "text-foreground/80"
                : "text-foreground/70";

        return (
            <div
                key={file.index}
                className={cn(
                    FILE_ROW,
                    "h-row rounded-panel",
                    selected.has(file.index)
                        ? "bg-content1/20"
                        : "bg-content1/5"
                )}
                style={{
                    gridTemplateColumns: FILE_GRID_TEMPLATE,
                    height: rowHeight,
                }}
            >
                <div className="flex items-center gap-tools">
                    <Checkbox
                        isSelected={selected.has(file.index)}
                        onValueChange={() => toggleSelection(file.index)}
                        size="md"
                        classNames={{
                            wrapper: "rounded-sm",
                        }}
                    />
                </div>
                <div className={cn(FILE_CELL, tone)} title={file.path}>
                    {file.path}
                </div>
                <div className="font-mono text-scaled text-foreground/70 text-right">
                    {formatBytes(file.length)}
                </div>
                <Select
                    aria-label={t("modals.add_torrent.col_priority")}
                    selectedKeys={[priority]}
                    onSelectionChange={(keys) => {
                        const [value] = Array.from(keys) as Array<
                            "low" | "normal" | "high"
                        >;
                        setPriority(file.index, value);
                    }}
                    size="sm"
                    variant="bordered"
                    disallowEmptySelection
                    classNames={{
                        trigger:
                            "border-default bg-content1/20 rounded-panel h-row priority-select-trigger",
                    }}
                >
                    <SelectItem key="high">
                        {t("torrent_modal.context_menu.files.priority_high")}
                    </SelectItem>
                    <SelectItem key="normal">
                        {t("torrent_modal.context_menu.files.priority_normal")}
                    </SelectItem>
                    <SelectItem key="low">
                        {t("torrent_modal.context_menu.files.priority_low")}
                    </SelectItem>
                </Select>
            </div>
        );
    };

    const renderHeroCard = () => {
        if (!heroFile) return null;
        const priority = priorities.get(heroFile.index) ?? "normal";
        return (
            <div className="rounded-panel border border-default/20 bg-content1/10 space-y-panel p-panel">
                <div className="flex items-center justify-between gap-tools">
                    <div className="flex flex-col gap-tight">
                        <span className="text-label tracking-label uppercase font-semibold">
                            {t("modals.add_torrent.file_hero_title")}
                        </span>
                        <span className="text-scaled text-foreground/60 truncate">
                            {heroFile.path}
                        </span>
                    </div>
                    <Select
                        aria-label={t("modals.add_torrent.file_hero_priority")}
                        selectedKeys={[priority]}
                        onSelectionChange={(keys) => {
                            const [value] = Array.from(keys) as Array<
                                "low" | "normal" | "high"
                            >;
                            setPriority(heroFile.index, value);
                        }}
                        variant="bordered"
                        size="md"
                        disallowEmptySelection
                    >
                        <SelectItem key="high">
                            {t(
                                "torrent_modal.context_menu.files.priority_high"
                            )}
                        </SelectItem>
                        <SelectItem key="normal">
                            {t(
                                "torrent_modal.context_menu.files.priority_normal"
                            )}
                        </SelectItem>
                        <SelectItem key="low">
                            {t("torrent_modal.context_menu.files.priority_low")}
                        </SelectItem>
                    </Select>
                </div>
                <Input
                    value={heroNameInput}
                    onChange={(event) => setHeroNameInput(event.target.value)}
                    label={t("modals.add_torrent.name_label")}
                    labelPlacement="outside"
                    size="md"
                    variant="bordered"
                    classNames={{
                        label: "text-label tracking-label uppercase font-semibold",
                    }}
                />
                <div className="flex items-center justify-between gap-tools text-foreground/60">
                    <span>{t("modals.add_torrent.file_hero_size")}</span>
                    <span className="font-mono text-scaled">
                        {formatBytes(heroFile.length)}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? onCancel() : null)}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!isSubmitting}
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, MODAL_CLASSES),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="px-stage py-panel border-b border-default flex flex-col gap-tight">
                            <div className="flex items-center justify-between gap-stage">
                                <div className="min-w-0 flex flex-col gap-tight">
                                    <span className={HEADER_TITLE}>
                                        {t("modals.add_torrent.title")}
                                    </span>
                                    <span className={SUBTLE_META} title={name}>
                                        {name || source?.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-tools">
                                    <div className="flex items-center gap-tools text-foreground/60">
                                        <StatusIcon
                                            Icon={Inbox}
                                            size="md"
                                            className="text-primary"
                                        />
                                        <span className="font-mono text-scaled">
                                            {t(
                                                "modals.add_torrent.file_count",
                                                {
                                                    count: files.length,
                                                }
                                            )}
                                        </span>
                                    </div>
                                    {!isSubmitting && (
                                        <ToolbarIconButton
                                            Icon={X}
                                            ariaLabel={t(
                                                "torrent_modal.actions.close"
                                            )}
                                            onPress={onCancel}
                                            iconSize="md"
                                        />
                                    )}
                                </div>
                            </div>
                        </ModalHeader>
                        <ModalBody className="px-stage py-panel min-h-0">
                            <PanelGroup
                                key={panelGroupKey}
                                direction="horizontal"
                                onLayout={persistLayout}
                                className="h-full min-h-0"
                            >
                                <Panel
                                    collapsible={false}
                                    minSize={24}
                                    defaultSize={40}
                                    className="min-h-0"
                                >
                                    <div className={PANE_SURFACE}>
                                        <div className={PANE_SECTION}>
                                            <div className={TOOLBAR}>
                                                <div className={FIELD_LABEL}>
                                                    {t(
                                                        "modals.add_torrent.destination"
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-stage">
                                                <div
                                                    onDrop={handleDrop}
                                                    onDragOver={handleDragOver}
                                                    onDragLeave={
                                                        handleDragLeave
                                                    }
                                                    className={cn(
                                                        "flex items-center gap-tools rounded-panel border p-tight",
                                                        dropActive
                                                            ? "border-primary/60 bg-primary/10"
                                                            : "border-default/20 bg-content1/10"
                                                    )}
                                                >
                                                    <Input
                                                        className="flex-1"
                                                        value={downloadDir}
                                                        onChange={(event) =>
                                                            setDownloadDir(
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "modals.add_torrent.save_path_placeholder"
                                                        )}
                                                        size="md"
                                                        variant="bordered"
                                                        endContent={
                                                            onBrowseDirectory ? (
                                                                <Button
                                                                    size="md"
                                                                    variant="flat"
                                                                    onPress={
                                                                        handleBrowse
                                                                    }
                                                                    isLoading={
                                                                        isTouchingDirectory
                                                                    }
                                                                >
                                                                    {t(
                                                                        "settings.button.browse"
                                                                    )}
                                                                </Button>
                                                            ) : null
                                                        }
                                                    />
                                                        <Dropdown>
                                                            <DropdownTrigger>
                                                                <Button
                                                                    size="md"
                                                                    variant="ghost"
                                                                    color="primary"
                                                                    startContent={
                                                                        <StatusIcon
                                                                            Icon={
                                                                                FolderOpen
                                                                            }
                                                                            size="md"
                                                                            className="text-current"
                                                                        />
                                                                    }
                                                                    isDisabled={
                                                                        !recentPaths.length
                                                                    }
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.history"
                                                                    )}
                                                                </Button>
                                                            </DropdownTrigger>
                                                        <DropdownMenu
                                                            aria-label={t(
                                                                "modals.add_torrent.history"
                                                            )}
                                                            onAction={(path) =>
                                                                applyDroppedPath(
                                                                    path.toString()
                                                                )
                                                            }
                                                        >
                                                            {recentPaths.length ? (
                                                                recentPaths.map(
                                                                    (path) => (
                                                                        <DropdownItem
                                                                            key={
                                                                                path
                                                                            }
                                                                            className="flex items-center justify-between gap-tools"
                                                                        >
                                                                            <span className="truncate">
                                                                                {
                                                                                    path
                                                                                }
                                                                            </span>
                                                                            <span className="text-xs uppercase text-foreground/60">
                                                                                {detectDriveKind(
                                                                                    path
                                                                                )}
                                                                            </span>
                                                                        </DropdownItem>
                                                                    )
                                                                )
                                                            ) : (
                                                                <DropdownItem
                                                                    key="empty"
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
                                                <div className={TOOL_GAP}>
                                                    <div className="flex flex-col gap-tight">
                                                        <span
                                                            className={
                                                                SUBTLE_META
                                                            }
                                                        >
                                                            {t(
                                                                "modals.add_torrent.free_space_label"
                                                            )}
                                                        </span>
                                                        <span className="font-mono text-scaled select-text">
                                                            {isCheckingSpace
                                                                ? t(
                                                                      "modals.add_torrent.free_space_loading"
                                                                  )
                                                                : spaceError
                                                                ? spaceError
                                                                : isSpaceKnown
                                                                ? formatBytes(
                                                                      freeSpaceBytes ??
                                                                          0
                                                                  )
                                                                : t(
                                                                      "modals.add_torrent.free_space_unknown"
                                                                  )}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-tight">
                                                        <span
                                                            className={
                                                                SUBTLE_META
                                                            }
                                                        >
                                                            {t(
                                                                "modals.add_torrent.selected_size_label"
                                                            )}
                                                        </span>
                                                        <span className="font-mono text-scaled select-text">
                                                            {formatBytes(
                                                                selectedSize
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {isInsufficient && (
                                                <p className="text-warning text-scaled">
                                                    {t(
                                                        "modals.add_torrent.disk_space_insufficient"
                                                    )}
                                                </p>
                                            )}
                                            <div className="flex flex-col gap-panel">
                                                <div className="flex flex-col gap-tight">
                                                    <span
                                                        className={FIELD_LABEL}
                                                    >
                                                        {t(
                                                            "modals.add_torrent.name_label"
                                                        )}
                                                    </span>
                                                    <Input
                                                        value={name}
                                                        onChange={(event) =>
                                                            setName(
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "modals.add_torrent.title"
                                                        )}
                                                        size="md"
                                                        variant="bordered"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-tight">
                                                    <span
                                                        className={FIELD_LABEL}
                                                    >
                                                        {t(
                                                            "modals.add_torrent.start_behavior"
                                                        )}
                                                    </span>
                                                    <Dropdown>
                                                        <DropdownTrigger>
                                                            <Button
                                                                variant="bordered"
                                                                endContent={
                                                                    <StatusIcon
                                                                        Icon={
                                                                            ChevronDown
                                                                        }
                                                                        size="md"
                                                                        className="text-foreground/50"
                                                                    />
                                                                }
                                                                size="md"
                                                            >
                                                                {commitLabel}
                                                            </Button>
                                                        </DropdownTrigger>
                                                        <DropdownMenu
                                                            aria-label="Commit mode"
                                                            disallowEmptySelection
                                                            selectionMode="single"
                                                            selectedKeys={[
                                                                commitMode,
                                                            ]}
                                                            onSelectionChange={(
                                                                keys
                                                            ) => {
                                                                const [value] =
                                                                    Array.from(
                                                                        keys
                                                                    ) as AddTorrentCommitMode[];
                                                                setCommitMode(
                                                                    value
                                                                );
                                                            }}
                                                        >
                                                            <DropdownItem key="start">
                                                                {t(
                                                                    "modals.add_torrent.add_and_start"
                                                                )}
                                                            </DropdownItem>
                                                            <DropdownItem key="paused">
                                                                {t(
                                                                    "modals.add_torrent.add_paused"
                                                                )}
                                                            </DropdownItem>
                                                            <DropdownItem key="top">
                                                                {t(
                                                                    "modals.add_torrent.add_and_start"
                                                                )}
                                                            </DropdownItem>
                                                        </DropdownMenu>
                                                    </Dropdown>
                                                </div>
                                                <Accordion
                                                    selectionMode="multiple"
                                                    defaultExpandedKeys={[]}
                                                    className="rounded-panel border border-default/20"
                                                >
                                                    <AccordionItem
                                                        key="advanced"
                                                        aria-label="Advanced Options"
                                                        title={t(
                                                            "modals.add_torrent.advanced"
                                                        )}
                                                        indicator={
                                                            <StatusIcon
                                                                Icon={ChevronUp}
                                                                size="md"
                                                                className="text-foreground/40"
                                                            />
                                                        }
                                                    >
                                                        <div className="flex flex-col gap-panel">
                                                            <Select
                                                                label={t(
                                                                    "modals.add_torrent.category"
                                                                )}
                                                                placeholder={t(
                                                                    "modals.add_torrent.category"
                                                                )}
                                                                selectedKeys={
                                                                    category
                                                                        ? [
                                                                              category,
                                                                          ]
                                                                        : []
                                                                }
                                                                onSelectionChange={(
                                                                    keys
                                                                ) => {
                                                                    const [
                                                                        value,
                                                                    ] =
                                                                        Array.from(
                                                                            keys
                                                                        );
                                                                    setCategory(
                                                                        value?.toString() ??
                                                                            null
                                                                    );
                                                                }}
                                                                variant="bordered"
                                                                size="md"
                                                            >
                                                                <SelectItem key="default">
                                                                    {t(
                                                                        "nav.filter_all"
                                                                    )}
                                                                </SelectItem>
                                                            </Select>
                                                            <Checkbox
                                                                isSelected={
                                                                    sequential
                                                                }
                                                                onValueChange={
                                                                    setSequential
                                                                }
                                                            >
                                                                {t(
                                                                    "modals.add_torrent.sequential_download"
                                                                )}
                                                            </Checkbox>
                                                            <Checkbox
                                                                isSelected={
                                                                    skipHashCheck
                                                                }
                                                                onValueChange={
                                                                    setSkipHashCheck
                                                                }
                                                            >
                                                                {t(
                                                                    "modals.add_torrent.skip_hash_check"
                                                                )}
                                                            </Checkbox>
                                                        </div>
                                                    </AccordionItem>
                                                </Accordion>
                                            </div>
                                        </div>
                                    </div>
                                </Panel>
                                <PanelResizeHandle
                                    className="group relative flex items-center justify-center cursor-col-resize"
                                    hitAreaMargins={{ coarse: 10, fine: 10 }}
                                >
                                    <div
                                        className="h-full bg-foreground/0 group-hover:bg-foreground/10 transition-colors"
                                        style={{ width: "var(--gap-tools)" }}
                                    />
                                </PanelResizeHandle>
                                <Panel minSize={36} className="min-h-0">
                                    <div className={PANE_SURFACE}>
                                        <div className={PANE_SECTION}>
                                            <div className={TOOLBAR}>
                                                <div className={FIELD_LABEL}>
                                                    {t(
                                                        "modals.add_torrent.files_title"
                                                    )}
                                                </div>
                                                <div className={TOOL_GAP}>
                                                    <Input
                                                        value={filter}
                                                        onChange={(event) =>
                                                            setFilter(
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "modals.add_torrent.filter_placeholder"
                                                        )}
                                                        size="md"
                                                        variant="bordered"
                                                        className="w-full"
                                                    />
                                                        <Dropdown>
                                                            <DropdownTrigger>
                                                                <Button
                                                                    variant="bordered"
                                                                    size="md"
                                                                    startContent={
                                                                        <StatusIcon
                                                                            Icon={
                                                                                Wand2
                                                                            }
                                                                            size="md"
                                                                            className="text-foreground/50"
                                                                        />
                                                                    }
                                                                >
                                                                {t(
                                                                    "modals.add_torrent.smart_select"
                                                                )}
                                                            </Button>
                                                        </DropdownTrigger>
                                                        <DropdownMenu
                                                            aria-label="Smart select"
                                                            onAction={(key) =>
                                                                handleSmartSelect(
                                                                    key as SmartSelectCommand
                                                                )
                                                            }
                                                        >
                                                            <DropdownItem key="videos">
                                                                {t(
                                                                    "modals.add_torrent.smart_select_videos"
                                                                )}
                                                            </DropdownItem>
                                                            <DropdownItem key="largest">
                                                                {t(
                                                                    "modals.add_torrent.smart_select_largest"
                                                                )}
                                                            </DropdownItem>
                                                            <DropdownItem key="invert">
                                                                {t(
                                                                    "modals.add_torrent.smart_select_invert"
                                                                )}
                                                            </DropdownItem>
                                                        </DropdownMenu>
                                                    </Dropdown>
                                                </div>
                                            </div>
                                            {resolvedState === "pending" && (
                                                <div className="flex flex-col items-center justify-center flex-1 gap-panel text-center">
                                                    <Spinner />
                                                    <p className={SUBTLE_META}>
                                                        {t(
                                                            "modals.add_magnet.resolving"
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                            {resolvedState === "error" && (
                                                <div className="flex flex-col items-center justify-center flex-1 gap-panel text-center">
                                                    <StatusIcon
                                                        Icon={Sparkles}
                                                        size="lg"
                                                        className="text-warning"
                                                    />
                                                    <p className="text-warning">
                                                        {magnetErrorMessage ??
                                                            t(
                                                                "modals.add_torrent.free_space_unknown"
                                                            )}
                                                    </p>
                                                    {onResolveMagnet && (
                                                        <Button
                                                            size="md"
                                                            variant="shadow"
                                                            color="primary"
                                                            onPress={
                                                                onResolveMagnet
                                                            }
                                                            isLoading={
                                                                isResolvingSource
                                                            }
                                                            isDisabled={
                                                                isResolvingSource
                                                            }
                                                        >
                                                            {isResolvingSource
                                                                ? t(
                                                                      "modals.add_magnet.resolving"
                                                                  )
                                                                : t(
                                                                      "modals.disk_gauge.retry"
                                                                  )}
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                            {resolvedState === "ready" &&
                                                (shouldShowHero ? (
                                                    renderHeroCard()
                                                ) : (
                                                    <div className="flex flex-col min-h-0 gap-tight">
                                                        <div
                                                            className="grid text-label font-semibold tracking-label uppercase text-foreground/60 px-panel"
                                                            style={{
                                                                gridTemplateColumns:
                                                                    FILE_GRID_TEMPLATE,
                                                            }}
                                                        >
                                                            <span>
                                                                {t(
                                                                    "modals.add_torrent.col_select"
                                                                )}
                                                            </span>
                                                            <span>
                                                                {t(
                                                                    "modals.add_torrent.col_name"
                                                                )}
                                                            </span>
                                                            <span className="text-right">
                                                                {t(
                                                                    "modals.add_torrent.col_size"
                                                                )}
                                                            </span>
                                                            <span className="text-right">
                                                                {t(
                                                                    "modals.add_torrent.col_priority"
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div
                                                            ref={
                                                                scrollParentRef
                                                            }
                                                            className="flex-1 min-h-0 overflow-auto overlay-scrollbar rounded-panel border border-default/20"
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
                                                                            item
                                                                        ) => {
                                                                            const file =
                                                                                filteredFiles[
                                                                                    item
                                                                                        .index
                                                                                ];
                                                                            if (
                                                                                !file
                                                                            )
                                                                                return null;
                                                                            return (
                                                                                <div
                                                                                    key={
                                                                                        file.index
                                                                                    }
                                                                                    style={{
                                                                                        position:
                                                                                            "absolute",
                                                                                        top: item.start,
                                                                                        left: 0,
                                                                                        right: 0,
                                                                                    }}
                                                                                >
                                                                                    {renderFileRow(
                                                                                        file
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        }
                                                                    )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </Panel>
                            </PanelGroup>
                        </ModalBody>
                        <ModalFooter className="px-stage py-panel border-t border-default flex items-center justify-between gap-tools">
                            <div className="flex items-center gap-tools text-foreground/70">
                                <StatusIcon
                                    Icon={HardDrive}
                                    size="md"
                                    className="text-foreground/70"
                                />
                                <span className="font-mono text-scaled select-text">
                                    {downloadDir}
                                </span>
                            </div>
                            <div className="flex items-center gap-tools">
                                <Button
                                    variant="light"
                                    onPress={onCancel}
                                    isDisabled={isSubmitting}
                                >
                                    {t("modals.cancel")}
                                </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleConfirm}
                                isDisabled={
                                    !files.length ||
                                    !downloadDir.trim() ||
                                    isSubmitting ||
                                    isResolvingSource ||
                                    resolvedState !== "ready"
                                }
                                isLoading={isSubmitting}
                                    startContent={
                                        <StatusIcon
                                            Icon={ArrowDown}
                                            size="md"
                                            className="text-current"
                                        />
                                    }
                                >
                                    {commitLabel}
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
