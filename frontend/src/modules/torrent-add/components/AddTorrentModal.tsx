import {
    Button,
    ButtonGroup,
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
import { LayoutGroup, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { useVirtualizer } from "@tanstack/react-virtual";
import { KEY_SCOPE, INTERACTION_CONFIG, CONFIG } from "@/config/logic";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";

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
    FileVideo,
    FileText,
    File as FileIcon,
    AlertTriangle,
    CheckCircle2,
    PlayCircle,
    PauseCircle,
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
import type { AddTorrentCommitMode } from "@/modules/torrent-add/types";
import { useFreeSpaceProbe } from "@/modules/torrent-add/hooks/useFreeSpaceProbe";
import {
    useAddTorrentFileTableLayout,
    type AddTorrentResizableFileColumn,
} from "@/modules/torrent-add/hooks/useAddTorrentFileTableLayout";
import {
    applySmartSelectCommand,
    buildFiles,
    buildSelectionCommit,
    classifyFileKind,
    filterFiles,
    type FileRow,
    type SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";

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

export type AddTorrentSelection = {
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    filesUnwanted: number[];
    priorityHigh: number[];
    priorityNormal: number[];
    priorityLow: number[];
    options: {
        sequential: boolean;
        skipHashCheck: boolean;
    };
};

export interface AddTorrentModalProps {
    isOpen: boolean;
    source: AddTorrentSource | null;
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    onDownloadDirChange: (value: string) => void;
    onCommitModeChange: (value: AddTorrentCommitMode) => void;
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: (selection: AddTorrentSelection) => Promise<void>;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    onBrowseDirectory?: (
        currentPath: string
        ) => Promise<string | null | undefined>;
}

// --- CONSTANTS & HELPERS ---

// Rename candidates documented in `RENAME_CANDIDATES.md`
// NON-VISUAL: history limit governs saved-path history length and is intentionally a small integer (non-visual system parameter)
const HISTORY_LIMIT = 6;

// FLAG: Tokenize this layout template via the token pipeline as `--tt-file-grid-template` and derive from --u/* geometry.
const FILE_GRID_TEMPLATE = "var(--tt-file-grid-template)";

const DESTINATION_INPUT_CLASSNAMES = {
    // Keep HeroUI's outer wrapper focus ring only.
    // The inner input outline creates a harsh black/white rectangle in light/dark mode.
    input: "font-mono text-scaled selection:bg-primary/20 selection:text-foreground !outline-none focus:!outline-none focus-visible:!outline-none",
    inputWrapper:
        "surface-layer-1 transition-colors shadow-none group-hover:border-default/10",
};
const DESTINATION_INPUT_LAYOUT_ID = "add-torrent-destination-input";

const hasControlChars = (value: string) => /[\r\n\t]/.test(value);

function isValidDestinationForMode(path: string, uiMode: "Full" | "Rpc") {
    const trimmed = path.trim();
    if (!trimmed) return false;
    if (hasControlChars(trimmed)) return false;

    // Full mode should behave like "pick a local folder" on Windows.
    // Rpc mode is a daemon-side path; accept both Windows and POSIX absolute paths as a basic sanity check.
    const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed);
    const isPosixAbs = trimmed.startsWith("/");
    const isProbablyWindows =
        typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
    if (uiMode === "Full") return isWindowsAbs || (!isProbablyWindows && isPosixAbs);
    return isWindowsAbs || isPosixAbs;
}
const FULL_CONTENT_ANIMATION = {
    transition: INTERACTION_CONFIG.modalBloom.transition,
    visible: {
        opacity: 1,
        y: 0,
    },
    hidden: {
        opacity: 0,
        y: INTERACTION_CONFIG.modalBloom.fallbackOffsetY,
    },
};

const MODAL_CLASSES =
    "w-full overflow-hidden flex flex-col shadow-2xl border border-default/10";
const PANE_SURFACE =
    "flex flex-col min-h-0 overflow-hidden rounded-panel border border-default/20 shadow-small";
const SECTION_LABEL =
    "text-label font-bold tracking-wider text-foreground/60 uppercase mb-panel flex items-center gap-tools";

function describePathKind(path: string):
    | { kind: "drive"; drive: string }
    | { kind: "network" }
    | { kind: "posix" }
    | { kind: "unknown" } {
    if (!path) return { kind: "unknown" };
    const trimmed = path.trim();
    if (!trimmed) return { kind: "unknown" };
    const normalized = trimmed.replace(/\//g, "\\");
    if (normalized.startsWith("\\\\")) return { kind: "network" };
    if (/^[a-zA-Z]:\\/i.test(normalized))
        return { kind: "drive", drive: normalized[0]!.toUpperCase() };
    if (trimmed.startsWith("/")) return { kind: "posix" };
    return { kind: "unknown" };
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
    downloadDir,
    commitMode,
    onDownloadDirChange,
    onCommitModeChange,
    isSubmitting,
    onCancel,
    onConfirm,
    checkFreeSpace,
    onBrowseDirectory,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const { rowHeight } = useLayoutMetrics();
    const {
        uiCapabilities: { uiMode, canBrowse },
    } = useSession();
    const showBrowseAction = Boolean(onBrowseDirectory) && canBrowse;

    // -- State --
    const [filter, setFilter] = useState("");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [priorities, setPriorities] = useState<
        Map<number, "low" | "normal" | "high">
    >(new Map());
    const [sequential, setSequential] = useState(false);
    const [skipHashCheck, setSkipHashCheck] = useState(true);
    const [lastClickedFileIndex, setLastClickedFileIndex] = useState<
        number | null
    >(null);
    const [submitLocked, setSubmitLocked] = useState(false);
    const submitLockRef = useRef(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitCloseConfirm, setSubmitCloseConfirm] = useState(false);
    const [destinationGateCompleted, setDestinationGateCompleted] =
        useState(false);
    const [destinationGateTried, setDestinationGateTried] = useState(false);
    const [destinationDraft, setDestinationDraft] = useState("");
    const wasOpenRef = useRef(false);
    const wasOpenForResetRef = useRef(false);
    const prevSourceRef = useRef<AddTorrentSource | null>(null);

    // View State (New)
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
    const [isPanelResizeActive, setIsPanelResizeActive] = useState(false);

    // Free Space Logic
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);

    // UX State
    const [dropActive, setDropActive] = useState(false);
    const dropActiveRef = useRef(false);
    const prevFilesCountRef = useRef(0);
    const {
        preferences: { addTorrentHistory },
        setAddTorrentHistory,
    } = usePreferences();
    const recentPaths = addTorrentHistory;

    const scrollParentRef = useRef<HTMLDivElement | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const settingsPanelRef = useRef<ImperativePanelHandle>(null);
    const settingsCollapseRequestedRef = useRef(false);
    const isMountedRef = useRef(false);

    // -- Keyboard Scope --
    const { activate: activateModal, deactivate: deactivateModal } =
        useKeyboardScope(KEY_SCOPE.Modal);
    const { activate: activateDashboard, deactivate: deactivateDashboard } =
        useKeyboardScope(KEY_SCOPE.Dashboard);

    useEffect(() => {
        if (!isOpen) return;
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
        isOpen,
    ]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // -- Data Memoization --
    const files = useMemo(
        () => buildFiles(source?.metadata),
        [source?.metadata]
    );

    // Reset state when the modal opens or the source changes while open.
    // IMPORTANT: Do not key this off `files` to avoid resetting UI during async metadata resolution.
    useEffect(() => {
        const wasOpen = wasOpenForResetRef.current;
        const sourceChanged = prevSourceRef.current !== source;
        const shouldReset = isOpen && (!wasOpen || sourceChanged);

        if (shouldReset) {
            const initialFiles = buildFiles(source?.metadata);
            const validInitialDestination = isValidDestinationForMode(
                downloadDir,
                uiMode
            )
                ? downloadDir
                : "";
            setFilter("");
            setPriorities(new Map());
            setSequential(false);
            setSkipHashCheck(true);
            setSelected(new Set(initialFiles.map((f) => f.index)));
            setLastClickedFileIndex(null);
            setSubmitLocked(false);
            submitLockRef.current = false;
            setSubmitError(null);
            setSubmitCloseConfirm(false);
            setDropActive(false);
            dropActiveRef.current = false;
            prevFilesCountRef.current = initialFiles.length;
            setDestinationDraft(validInitialDestination);

            // Reset View modes
            setIsFullscreen(false);
            setIsSettingsCollapsed(false);
            settingsCollapseRequestedRef.current = false;
        }

        wasOpenForResetRef.current = isOpen;
        prevSourceRef.current = source;
        if (!isOpen) {
            prevFilesCountRef.current = 0;
        }
    }, [downloadDir, isOpen, source, uiMode]);

    // If metadata arrives after open (magnet resolution) and nothing was selected yet, default to selecting everything once.
    useEffect(() => {
        if (!isOpen) return;
        const prevCount = prevFilesCountRef.current;
        const nextCount = files.length;
        prevFilesCountRef.current = nextCount;
        if (prevCount === 0 && nextCount > 0 && selected.size === 0) {
            setSelected(new Set(files.map((f) => f.index)));
        }
    }, [files, isOpen, selected.size]);

    // Destination gate is decided at modal open and advances only by explicit user action.
    // This prevents async metadata changes (e.g. magnet resolving) from implicitly skipping the gate.
    useEffect(() => {
        const wasOpen = wasOpenRef.current;
        if (isOpen && !wasOpen) {
            const isInitiallyValid = isValidDestinationForMode(
                downloadDir,
                uiMode
            );
            setDestinationGateCompleted(isInitiallyValid);
            setDestinationGateTried(false);
            setDestinationDraft(isInitiallyValid ? downloadDir : "");
        }
        wasOpenRef.current = isOpen;
    }, [downloadDir, isOpen, uiMode]);

    // -- Logic: Toggle Views --
    const toggleSettingsPanel = useCallback(() => {
        // Rule A: this toggle is valid in both normal and fullscreen modes.
        // Do not gate this by `isFullscreen`; fullscreen should only affect viewport size.
        const panel = settingsPanelRef.current;
        if (!panel) return;

        if (panel.isCollapsed()) {
            settingsCollapseRequestedRef.current = false;
            panel.expand(SETTINGS_PANEL_MIN);
        } else {
            settingsCollapseRequestedRef.current = true;
            panel.collapse();
        }
    }, []);

    const handleSettingsPanelCollapse = useCallback(() => {
        // VS Code-like behavior: drag should resize only, not hide the pane.
        // Only explicit toggle actions may collapse settings.
        if (settingsCollapseRequestedRef.current) {
            settingsCollapseRequestedRef.current = false;
            setIsSettingsCollapsed(true);
            return;
        }

        const panel = settingsPanelRef.current;
        if (panel) {
            panel.expand(SETTINGS_PANEL_MIN);
        }
        setIsSettingsCollapsed(false);
    }, []);

    const handleSettingsPanelExpand = useCallback(() => {
        settingsCollapseRequestedRef.current = false;
        setIsSettingsCollapsed(false);
    }, []);

    // -- Logic: History & Drops --
    const pushRecentPath = useCallback(
        (path: string) => {
            const trimmed = path.trim();
            if (!trimmed) return;
            const next = [
                trimmed,
                ...recentPaths.filter((item: string) => item !== trimmed),
            ];
            setAddTorrentHistory(next.slice(0, HISTORY_LIMIT));
        },
        [recentPaths, setAddTorrentHistory]
    );

    const applyDroppedPath = useCallback(
        (path?: string) => {
            if (!path) return;
            const trimmed = path.trim();
            if (!trimmed) return;

            // Stage 1 is draft-only: do not commit to settings while the user is still gating.
            if (!destinationGateCompleted) {
                setDestinationDraft(trimmed);
                return;
            }

            setDestinationDraft(trimmed);
            if (isValidDestinationForMode(trimmed, uiMode)) {
                onDownloadDirChange(trimmed);
                pushRecentPath(trimmed);
            }
        },
        [destinationGateCompleted, onDownloadDirChange, pushRecentPath, uiMode]
    );

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDropActive(false);
            dropActiveRef.current = false;
            if (uiMode !== "Full") return;
            const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
            let path: string | undefined;
            if (droppedFiles.length) {
                const file = droppedFiles[0] as File & {
                    path?: string;
                    webkitRelativePath?: string;
                };
                path = file.path || file.webkitRelativePath;
            }
            if (!path) {
                path = event.dataTransfer?.getData("text/plain")?.trim();
            }
            if (!path) return;
            // Guardrails: ignore drops that aren't an absolute path (common in browsers: `file.name` / `fakepath`).
            // Destination is always a directory; we only accept drops that look like real paths.
            if (/^[a-zA-Z]:[\\/]fakepath[\\/]/i.test(path)) return;
            if (describePathKind(path).kind === "unknown") return;
            if (droppedFiles.length > 0 && path) {
                const droppedName = droppedFiles[0]?.name?.trim();
                const normalizedPath = path.replace(/\//g, "\\");
                const droppedLooksLikeFile = Boolean(
                    droppedName && /\.[^\\/.]+$/.test(droppedName)
                );
                if (
                    droppedLooksLikeFile &&
                    droppedName &&
                    normalizedPath
                        .toLowerCase()
                        .endsWith(`\\${droppedName.toLowerCase()}`)
                ) {
                    const parent = normalizedPath.replace(/[\\][^\\]+$/, "");
                    if (parent) {
                        path = /^[a-zA-Z]:$/i.test(parent)
                            ? `${parent}\\`
                            : parent;
                    }
                }
            }
            applyDroppedPath(path);
        },
        [applyDroppedPath, uiMode]
    );

    const handleDragOver = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            if (uiMode !== "Full") return;
            if (dropActiveRef.current) return;
            dropActiveRef.current = true;
            setDropActive(true);
        },
        [uiMode]
    );
    const handleDragLeave = useCallback(() => {
        dropActiveRef.current = false;
        setDropActive(false);
    }, []);

    // -- Logic: Browse --
    const handleBrowse = useCallback(async () => {
        if (!onBrowseDirectory) return;
        setIsTouchingDirectory(true);
        try {
            const start = destinationGateCompleted ? downloadDir : destinationDraft;
            const next = await onBrowseDirectory(start);
            if (next) applyDroppedPath(next);
        } finally {
            setIsTouchingDirectory(false);
        }
    }, [
        applyDroppedPath,
        destinationDraft,
        destinationGateCompleted,
        downloadDir,
        onBrowseDirectory,
    ]);

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
    const headerScopeFiles = filter.trim().length > 0 ? filteredFiles : files;
    const headerScopeSelectedCount = useMemo(() => {
        return headerScopeFiles.reduce(
            (count, f) => (selected.has(f.index) ? count + 1 : count),
            0
        );
    }, [headerScopeFiles, selected]);
    const allFilesSelected =
        headerScopeFiles.length > 0 &&
        headerScopeSelectedCount === headerScopeFiles.length;
    const someFilesSelected = headerScopeSelectedCount > 0 && !allFilesSelected;

    const handleSmartSelect = useCallback(
        (command: SmartSelectCommand) => {
            const scopeFiles =
                filter.trim().length > 0 ? filteredFiles : files;
            setSelected((prev) =>
                applySmartSelectCommand({
                    command,
                    scopeFiles,
                    selected: prev,
                })
            );
        },
        [files, filter, filteredFiles]
    );

    const toggleSelection = useCallback((index: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const handleRowClick = useCallback(
        (index: number, shiftKey: boolean) => {
            const order =
                filter.trim().length > 0
                    ? filteredFiles.map((f) => f.index)
                    : files.map((f) => f.index);
            if (!shiftKey || lastClickedFileIndex === null) {
                toggleSelection(index);
                setLastClickedFileIndex(index);
                return;
            }

            const from = order.indexOf(lastClickedFileIndex);
            const to = order.indexOf(index);
            if (from === -1 || to === -1) {
                toggleSelection(index);
                setLastClickedFileIndex(index);
                return;
            }

            const start = Math.min(from, to);
            const end = Math.max(from, to);
            const rangeIndexes = order.slice(start, end + 1);

            setSelected((prev) => {
                const next = new Set(prev);
                const shouldSelect = !prev.has(index);
                rangeIndexes.forEach((fileIndex) => {
                    if (shouldSelect) next.add(fileIndex);
                    else next.delete(fileIndex);
                });
                return next;
            });
            setLastClickedFileIndex(index);
        },
        [files, filter, filteredFiles, lastClickedFileIndex, toggleSelection]
    );

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
    // TODO: Clarify contract: `checkFreeSpace` must be a Transmission RPC call (`free-space`) against the daemon and reports daemon-side free space.
    // TODO: Do not call `NativeShell.checkFreeSpace` here (or anywhere in the modal). Local-disk probing (if ever needed) belongs to ShellAgent and must be gated by `uiMode="Full"`.
    // TODO: If connected to a remote daemon (`uiMode="Rpc"`), the UI must treat this as remote free space (and copy must not imply it is local disk space).
    const freeSpaceProbe = useFreeSpaceProbe({
        checkFreeSpace,
        path: destinationDraft,
        enabled: isValidDestinationForMode(destinationDraft.trim(), uiMode),
    });
    const freeSpace =
        freeSpaceProbe.status === "ok" ? freeSpaceProbe.value : null;
    const isCheckingSpace = freeSpaceProbe.status === "loading";
    const spaceError =
        freeSpaceProbe.status === "error"
            ? t("modals.add_torrent.free_space_unavailable")
            : null;
    const spaceErrorDetail =
        freeSpaceProbe.status === "error" ? freeSpaceProbe.message ?? null : null;

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
    // Disk space is advisory only: warn the user, but never override their selected start behavior.
    // Transmission/runtime handling remains authoritative for actual out-of-space behavior.
    const isSelectionEmpty = selected.size === 0;
    const activeDestination = destinationDraft.trim();
    const isDestinationValid = isValidDestinationForMode(activeDestination, uiMode);
    const isDestinationDraftValid = isValidDestinationForMode(
        destinationDraft,
        uiMode
    );
    // Stage 1 vs Stage 2 is state-based (destination validity), never fullscreen-based.
    const showDestinationGate = !destinationGateCompleted;
    const isDestinationGateRequiredError =
        destinationGateTried && !destinationDraft.trim();
    const isDestinationGateInvalidError =
        !isDestinationDraftValid && Boolean(destinationDraft.trim());
    const step1HintMessage = uiMode === "Rpc"
        ? t("modals.add_torrent.destination_prompt_drop_hint_rpc")
        : t("modals.add_torrent.destination_prompt_drop_hint_full");
    const step1DestinationMessage = isDestinationGateRequiredError
        ? t("modals.add_torrent.destination_required_chip")
        : isDestinationGateInvalidError
          ? t("modals.add_torrent.destination_prompt_invalid")
          : step1HintMessage;
    const step1DestinationTone =
        isDestinationGateRequiredError || isDestinationGateInvalidError
            ? "danger"
            : "neutral";
    const step2StatusMessage = !isDestinationValid && Boolean(activeDestination)
        ? t("modals.add_torrent.destination_prompt_invalid")
        : spaceError && spaceErrorDetail
          ? spaceErrorDetail
          : !activeDestination
        ? uiMode === "Rpc"
            ? t("modals.add_torrent.destination_prompt_drop_hint_rpc")
            : t("modals.add_torrent.destination_prompt_drop_hint_full")
        : t("modals.add_torrent.destination_ready");
    const step2StatusTone =
        !isDestinationValid && Boolean(activeDestination)
            ? "danger"
            : spaceError && spaceErrorDetail
              ? "warning"
              : "neutral";
    const canConfirm =
        !isSelectionEmpty &&
        isDestinationValid &&
        !submitLocked &&
        !isSubmitting &&
        resolvedState === "ready";
    const hasDestination = isDestinationValid;
    const primaryBlockReason = (() => {
        if (submitError) return null;
        if (isDiskSpaceCritical) return null;
        if (isSelectionEmpty) return t("modals.add_torrent.tooltip_select_one");
        if (resolvedState !== "ready")
            return t("modals.add_torrent.tooltip_resolving_metadata");
        return null;
    })();

    const modalSize = showDestinationGate
        ? ("lg" as const)
        : isFullscreen
        ? ("full" as const)
        : ("5xl" as const);
    // Rule A invariant: fullscreen only changes available space.
    // Interactive controls (collapse/resize/toggles) must stay identical across normal/fullscreen modes.
    const canCollapseSettings = true;
    const handleModalCancel = useCallback(() => {
        // Clear committed destination when Step 2 draft was cleared and user closes.
        // Next open will re-enter Step 1 destination gate.
        if (
            !showDestinationGate &&
            destinationDraft.trim().length === 0 &&
            downloadDir.trim().length > 0
        ) {
            onDownloadDirChange("");
        }
        onCancel();
    }, [
        destinationDraft,
        downloadDir,
        onCancel,
        onDownloadDirChange,
        showDestinationGate,
    ]);

    const modalMotionProps = useMemo(() => {
        const bloom = INTERACTION_CONFIG.modalBloom;
        return {
            initial: {
                opacity: 0,
                scale: bloom.originScale,
                y: bloom.fallbackOffsetY,
            },
            animate: {
                opacity: 1,
                scale: 1,
                y: 0,
                transition: bloom.transition,
            },
            exit: {
                opacity: 0,
                scale: bloom.exitScale,
                y: bloom.exitOffsetY,
                transition: bloom.transition,
            },
        };
    }, []);

    const {
        tableLayoutRef,
        handleColumnResizeStart,
        handleColumnAutoFit,
        isColumnResizing,
    } = useAddTorrentFileTableLayout({
        enabled: isOpen && !showDestinationGate && resolvedState === "ready",
        rows: filteredFiles,
    });

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

    const handleDestinationGateContinue = useCallback(() => {
        setDestinationGateTried(true);
        if (!isDestinationDraftValid) return;
        const committed = destinationDraft.trim();
        onDownloadDirChange(committed);
        pushRecentPath(committed);
        setDestinationGateCompleted(true);
    }, [
        destinationDraft,
        isDestinationDraftValid,
        onDownloadDirChange,
        pushRecentPath,
    ]);

    // -- Renderers --

    const renderDestinationInput = (wrapperClass?: string) => (
        <motion.div
            layout
            layoutId={DESTINATION_INPUT_LAYOUT_ID}
            className={cn("w-full", wrapperClass)}
        >
            <Input
                autoFocus={showDestinationGate}
                value={destinationDraft}
                onChange={(e) => {
                    const next = e.target.value;
                    setDestinationDraft(next);
                }}
                onBlur={() => {
                    if (showDestinationGate) {
                        setDestinationGateTried(true);
                        return;
                    }
                    const committed = destinationDraft.trim();
                    if (isValidDestinationForMode(committed, uiMode)) {
                        onDownloadDirChange(committed);
                    }
                }}
                onKeyDown={(e) => {
                    if (showDestinationGate && e.key === "Enter") {
                        // Step 1 must support keyboard-only progression.
                        // Handle Enter at the input level because HeroUI input handling
                        // can swallow bubbling key events.
                        e.preventDefault();
                        e.stopPropagation();
                        handleDestinationGateContinue();
                        return;
                    }
                    if (!showDestinationGate && e.key === "Enter" && !canConfirm) {
                        // UX guardrail: invalid destination in Step 2 should stay in-place
                        // and show validation, never bounce users back to Step 1.
                        e.preventDefault();
                    }
                }}
                aria-label={t("modals.add_torrent.destination_input_aria")}
                placeholder={t("modals.add_torrent.destination_placeholder")}
                variant="flat"
                autoComplete="off"
                classNames={DESTINATION_INPUT_CLASSNAMES}
                startContent={
                    <FolderOpen className="toolbar-icon-size-md text-primary mb-tight" />
                }
            />
        </motion.div>
    );

    const renderFileRow = (file: FileRow, virtualIndex: number) => {
        const priority = priorities.get(file.index) ?? "normal";
        const fileType = classifyFileKind(file.path);
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
                data-index={virtualIndex}
                ref={virtualizer.measureElement}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest(".priority-trigger"))
                        return;
                    if (
                        (e.target as HTMLElement).closest(
                            "[data-file-row-checkbox='true']"
                        )
                    )
                        return;
                    handleRowClick(file.index, e.shiftKey);
                }}
            >
                <div
                    className="flex items-center justify-center h-full"
                    data-file-row-checkbox="true"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox
                        aria-label={`${t("modals.add_torrent.col_select")}: ${file.path}`}
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

                <div
                    className="font-mono text-scaled text-foreground/50 truncate text-right pr-panel"
                    data-tt-add-col-size="true"
                >
                    {formatBytes(file.length)}
                </div>

                <div
                    className="pr-panel flex justify-end min-w-0"
                    data-tt-add-col-priority="true"
                >
                    <div className="flex items-center min-w-0">
                        <div
                            className="priority-trigger mr-tight transition-transform"
                            onClick={(e) => e.stopPropagation()}
                            title={t(
                                "modals.add_torrent.click_to_cycle_priority"
                            )}
                        >
                            <Button
                                isIconOnly
                                size="md"
                                variant="light"
                                onPress={() => cyclePriority(file.index)}
                                aria-label={t(
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
                            </Button>
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
                            className="min-w-0"
                            classNames={{
                                trigger:
                                    "h-button min-w-0 max-w-full bg-transparent data-[hover=true]:bg-content1/10 priority-trigger pl-tight",
                                value: "text-label uppercase font-bold text-right truncate",
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

    const renderFileColumnResizeHandle = (
        column: AddTorrentResizableFileColumn,
        ariaLabel: string
    ) => (
        <button
            type="button"
            onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleColumnResizeStart(column, event.clientX);
            }}
            onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleColumnAutoFit(column);
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={ariaLabel}
            className="absolute right-0 top-0 h-full w-handle cursor-col-resize touch-none select-none flex items-center justify-end z-panel"
        >
            <div
                className={cn(
                    "h-resize-h w-divider rounded-full transition-colors",
                    isColumnResizing(column)
                        ? "bg-primary"
                        : "bg-foreground/20 hover:bg-primary/50"
                )}
            />
        </button>
    );

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(o) => !o && handleModalCancel()}
            backdrop="blur"
            placement="center"
            motionProps={modalMotionProps}
            hideCloseButton
            isDismissable={!showDestinationGate && !isSubmitting && !submitLocked}
            size={modalSize} // fullscreen is a pure layout expansion; destination gate is state-based
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    MODAL_CLASSES,
                    "surface-layer-2 border-default/20",
                    !showDestinationGate && isFullscreen
                        ? "h-full"
                    : showDestinationGate
                        ? "max-h-modal-body"
                        : "max-h-modal-body"
                ),
                body: "p-tight bg-background/40",
                header:
                    "p-0 border-b border-default/20 select-none bg-content1/75 backdrop-blur-sm",
                footer: "p-0 border-t border-default/20 select-none bg-content1/80",
            }}
        >
            <ModalContent>
                {showDestinationGate ? (
                    <div
                        className="flex flex-col h-full"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                handleModalCancel();
                                return;
                            }
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleDestinationGateContinue();
                            }
                        }}
                    >
                        <ModalHeader className="flex justify-between items-center gap-panel px-stage py-panel">
                            <div className="flex flex-col overflow-hidden gap-tight">
                                <h2 className="text-scaled font-bold tracking-widest uppercase text-foreground">
                                    {t(
                                        "modals.add_torrent.destination_prompt_title"
                                    )}
                                </h2>
                                <span className="text-label text-foreground/60 truncate font-mono leading-tight">
                                    {source?.label}
                                </span>
                            </div>
                            <ToolbarIconButton
                                Icon={X}
                                onPress={handleModalCancel}
                                ariaLabel={t("torrent_modal.actions.close")}
                                iconSize="lg"
                                className="text-foreground/60 hover:text-foreground"
                            />
                        </ModalHeader>
                        <ModalBody className="flex-1 min-h-0 flex items-center justify-center">
                            <div className="w-full max-w-modal p-stage">
                                <div className="surface-layer-1 border border-default/10 rounded-panel p-panel flex flex-col gap-panel">
                                    <Tooltip
                                        content={t(
                                            "modals.add_torrent.destination_prompt_help"
                                        )}
                                    >
                                        <div className="flex items-center gap-tools text-label font-mono uppercase tracking-widest text-foreground/40">
                                            <HardDrive className="toolbar-icon-size-md text-foreground/50" />
                                            <span>
                                                {t(
                                                    "modals.add_torrent.destination_prompt_mode_full"
                                                )}
                                            </span>
                                        </div>
                                    </Tooltip>

                                    <div className="flex gap-tools items-center">
                                        {renderDestinationInput("flex-1")}
                                        {showBrowseAction && (
                                            <Tooltip
                                                content={t(
                                                    "modals.add_torrent.destination_prompt_browse"
                                                )}
                                            >
                                                <Button
                                                    onPress={handleBrowse}
                                                    isIconOnly
                                                    size="md"
                                                    variant="flat"
                                                    isLoading={isTouchingDirectory}
                                                    aria-label={t(
                                                        "modals.add_torrent.destination_prompt_browse"
                                                    )}
                                                    className="surface-layer-1 border border-default/10"
                                                >
                                                    <FolderOpen className="toolbar-icon-size-md text-foreground/50" />
                                                </Button>
                                            </Tooltip>
                                        )}
                                    </div>

                                    <div className={cn(
                                        "h-status-chip flex items-center gap-tools text-label",
                                        step1DestinationTone === "danger"
                                            ? "text-danger"
                                            : "text-foreground/60"
                                    )}>
                                        <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                        <span className="font-bold truncate">
                                            {step1DestinationMessage}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter className="flex justify-between items-center px-stage py-panel">
                            <div className="flex items-center gap-tools min-w-0">
                                {freeSpace && (
                                    <div className="flex items-center gap-tools min-w-0">
                                        <Chip
                                            size="sm"
                                            variant="flat"
                                            color={
                                                isDiskSpaceCritical
                                                    ? "warning"
                                                    : "default"
                                            }
                                            classNames={{
                                                content:
                                                    "font-mono whitespace-nowrap uppercase",
                                            }}
                                        >
                                            {formatBytes(freeSpace.sizeBytes)}{" "}
                                            {t("modals.add_torrent.free")}
                                        </Chip>
                                        <Tooltip
                                            content={t(
                                                "modals.add_torrent.selected_size_tooltip",
                                                {
                                                    size: formatBytes(selectedSize),
                                                }
                                            )}
                                        >
                                            <Progress
                                                value={
                                                    freeSpace.sizeBytes > 0
                                                        ? Math.min(
                                                              100,
                                                              (selectedSize /
                                                                  freeSpace.sizeBytes) *
                                                                  100
                                                          )
                                                        : 100
                                                }
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
                                {isCheckingSpace && !freeSpace && !spaceError && (
                                    <div className="flex items-center gap-tools text-foreground/40">
                                        <Spinner size="sm" color="primary" />
                                        <span className="text-label font-mono">
                                            {t("modals.add_torrent.free_space_loading")}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleDestinationGateContinue}
                                isDisabled={isTouchingDirectory || !isDestinationDraftValid}
                                className="font-bold px-stage min-w-button"
                            >
                                {t(
                                    "modals.add_torrent.destination_gate_continue"
                                )}
                            </Button>
                        </ModalFooter>
                    </div>
                ) : (
                    <form
                        ref={formRef}
                        className="flex flex-col min-h-0 flex-1 relative"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (!canConfirm) return;
                            if (submitLockRef.current) return;
                            submitLockRef.current = true;
                            setSubmitLocked(true);
                            setSubmitError(null);
                            setSubmitCloseConfirm(false);

                            const submitDir = destinationDraft.trim();
                            if (submitDir && submitDir !== downloadDir) {
                                onDownloadDirChange(submitDir);
                            }
                            const {
                                filesUnwanted,
                                priorityHigh,
                                priorityLow,
                                priorityNormal,
                            } = buildSelectionCommit({
                                files,
                                selected,
                                priorities,
                            });

                            try {
                                await onConfirm({
                                    downloadDir: submitDir,
                                    commitMode,
                                    filesUnwanted,
                                    priorityHigh,
                                    priorityNormal,
                                    priorityLow,
                                    options: {
                                        sequential,
                                        skipHashCheck,
                                    },
                                });
                                pushRecentPath(submitDir);
                            } catch {
                                if (isMountedRef.current) {
                                    setSubmitError(
                                        t("modals.add_error_default")
                                    );
                                }
                            } finally {
                                if (isMountedRef.current) {
                                    submitLockRef.current = false;
                                    setSubmitLocked(false);
                                }
                            }
                        }}
                        onKeyDown={(e) => {
                            // ESCAPE HATCH: Local submit shortcut kept at modal level for convenience.
                            // TODO: Consider registering this in the central keyboard command registry.
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                                formRef.current?.requestSubmit();
                            if (e.key === "Escape") {
                                e.preventDefault();
                                if (isSubmitting || submitLocked) {
                                    if (!submitCloseConfirm) {
                                        setSubmitCloseConfirm(true);
                                        return;
                                    }
                                }
                                handleModalCancel();
                            }
                        }}
                    >
                    {(isSubmitting || submitLocked) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/50 gap-tools z-modal-internal bg-background/40 backdrop-blur-sm">
                            {!submitCloseConfirm ? (
                                <>
                                    <Spinner color="primary" />
                                    <p className="font-mono text-label uppercase tracking-widest">
                                        {t("modals.add_torrent.submitting")}
                                    </p>
                                    <p className="text-label font-mono text-foreground/40 text-center max-w-modal">
                                        {t(
                                            "modals.add_torrent.submitting_close_hint"
                                        )}
                                    </p>
                                    <Button
                                        variant="flat"
                                        onPress={() =>
                                            setSubmitCloseConfirm(true)
                                        }
                                    >
                                        {t("modals.add_torrent.close_overlay")}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <StatusIcon
                                        Icon={AlertTriangle}
                                        className="text-warning"
                                    />
                                    <p className="font-mono text-label uppercase tracking-widest text-foreground/70">
                                        {t(
                                            "modals.add_torrent.close_while_submitting_title"
                                        )}
                                    </p>
                                    <p className="text-label font-mono text-foreground/40 text-center max-w-modal">
                                        {t(
                                            "modals.add_torrent.close_while_submitting_body"
                                        )}
                                    </p>
                                    <div className="flex gap-tools">
                                        <Button
                                            variant="flat"
                                            onPress={() =>
                                                setSubmitCloseConfirm(false)
                                            }
                                        >
                                            {t(
                                                "modals.add_torrent.keep_waiting"
                                            )}
                                        </Button>
                                        <Button
                                            color="danger"
                                            variant="shadow"
                                            onPress={handleModalCancel}
                                        >
                                            {t(
                                                "modals.add_torrent.close_anyway"
                                            )}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
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
                                color={
                                    isSelectionEmpty
                                        ? "default"
                                        : hasDestination
                                          ? "primary"
                                        : "warning"
                                }
                                startContent={
                                    hasDestination ? (
                                        <Inbox className="toolbar-icon-size-md" />
                                    ) : (
                                        <HardDrive className="toolbar-icon-size-md" />
                                    )
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
                                        ? t("modals.add_torrent.exit_fullscreen")
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
                                     onPress={() => setIsFullscreen(!isFullscreen)}
                                    isDisabled={isSubmitting || submitLocked}
                                     iconSize="lg"
                                     className="text-foreground/60 hover:text-foreground"
                                 />
                             </Tooltip>
                             <ToolbarIconButton
                                Icon={X}
                                onPress={() =>
                                    !isSubmitting &&
                                    !submitLocked &&
                                    handleModalCancel()
                                }
                                ariaLabel={t("torrent_modal.actions.close")}
                                iconSize="lg"
                                isDisabled={isSubmitting || submitLocked}
                                className="text-foreground/60 hover:text-foreground"
                            />
                        </div>
                    </ModalHeader>

                    {/* --- SPLIT VIEW BODY --- */}
                    <ModalBody className="flex-1 min-h-0 relative p-add-modal-pane-gap">
                        {dropActive && (
                            <div className="absolute inset-0 z-drop-overlay bg-primary/20 backdrop-blur-sm border-(--tt-divider-width) border-primary border-dashed m-panel rounded-xl flex items-center justify-center pointer-events-none">
                                <div className="bg-background px-stage py-tight rounded-full shadow-xl flex items-center gap-tools animate-pulse">
                                    <FolderOpen className="toolbar-icon-size-lg text-primary" />
                                    <span className="text-scaled font-bold">
                                        {hasDestination
                                            ? t(
                                                  "modals.add_torrent.drop_to_change_destination"
                                              )
                                            : uiMode === "Rpc"
                                            ? t(
                                                  "modals.add_torrent.paste_to_set_destination"
                                              )
                                            : t(
                                                  "modals.add_torrent.drop_to_set_destination"
                                              )}
                                    </span>
                                </div>
                            </div>
                        )}

                        <LayoutGroup>
                            {/* Keep the full layout mounted to avoid resize-panel mount flicker.
                               IMPORTANT: this wrapper must remain in-flow (not absolute), otherwise
                               ModalBody can collapse in normal mode and hide Step 2 controls. */}
                            <motion.div
                                className={cn(
                                    "flex flex-col flex-1 min-h-settings",
                                    isFullscreen && "h-full min-h-0"
                                )}
                                initial={false}
                                animate={FULL_CONTENT_ANIMATION.visible}
                                transition={FULL_CONTENT_ANIMATION.transition}
                                style={{ pointerEvents: "auto" }}
                            >
                                <PanelGroup
                                    direction="horizontal"
                                    className="flex-1 min-h-0"
                                >
                            {/* === LEFT PANEL: CONFIGURATION === */}
                            <Panel
                                ref={settingsPanelRef}
                                defaultSize={SETTINGS_PANEL_DEFAULT}
                                minSize={SETTINGS_PANEL_MIN}
                                collapsible={canCollapseSettings}
                                onCollapse={handleSettingsPanelCollapse}
                                onExpand={handleSettingsPanelExpand}
                                className={cn(
                                    GLASS_PANEL_SURFACE,
                                    PANE_SURFACE,
                                    "bg-background/65",
                                    isSettingsCollapsed && "min-w-0 w-0 border-none"
                                )}
                            >
                                <div className="p-panel flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                    {/* ... [Content of Left Panel same as before] ... */}
                                    <div
                                        className="flex flex-col gap-panel mb-panel"
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex flex-col gap-tools">
                                            <Tooltip
                                                content={t(
                                                    "modals.add_torrent.destination_prompt_help"
                                                )}
                                            >
                                                <label className={SECTION_LABEL}>
                                                    <HardDrive className="toolbar-icon-size-md" />{" "}
                                                    {t(
                                                        "modals.add_torrent.destination"
                                                    )}
                                                </label>
                                            </Tooltip>
                                        </div>
                                        <div className="flex gap-tools group">
                                            {renderDestinationInput("flex-1")}
                                            {showBrowseAction && (
                                                <Tooltip
                                                    content={t(
                                                            "modals.add_torrent.destination_prompt_browse"
                                                        )}
                                                    >
                                                        <Button
                                                            onPress={handleBrowse}
                                                            isIconOnly
                                                            size="md"
                                                            variant="flat"
                                                            isLoading={
                                                                isTouchingDirectory
                                                            }
                                                            aria-label={t(
                                                                "modals.add_torrent.destination_prompt_browse"
                                                            )}
                                                            className="surface-layer-1 border border-default/10"
                                                        >
                                                            <FolderOpen className="toolbar-icon-size-md text-foreground/50" />
                                                        </Button>
                                                    </Tooltip>
                                                )}
                                                <Dropdown>
                                                    <DropdownTrigger>
                                                        <Button
                                                            isIconOnly
                                                            size="md"
                                                            variant="flat"
                                                            aria-label={t(
                                                                "modals.add_torrent.history"
                                                            )}
                                                            title={t(
                                                                "modals.add_torrent.history"
                                                            )}
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
                                                        recentPaths.map((p: string) => (
                                                            <DropdownItem
                                                                key={p}
                                                                description={(() => {
                                                                    const kind =
                                                                        describePathKind(
                                                                            p
                                                                        );
                                                                    if (
                                                                        kind.kind ===
                                                                        "drive"
                                                                    )
                                                                        return t(
                                                                            "modals.add_torrent.path_kind_drive",
                                                                            {
                                                                                drive: kind.drive,
                                                                            }
                                                                        );
                                                                    if (
                                                                        kind.kind ===
                                                                        "network"
                                                                    )
                                                                        return t(
                                                                            "modals.add_torrent.path_kind_network"
                                                                        );
                                                                    if (
                                                                        kind.kind ===
                                                                        "posix"
                                                                    )
                                                                        return t(
                                                                            "modals.add_torrent.path_kind_posix"
                                                                        );
                                                                    return t(
                                                                        "modals.add_torrent.path_kind_unknown"
                                                                    );
                                                                })()}
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

                                        <div className={cn(
                                            "h-status-chip flex items-center gap-tools text-label font-mono min-w-0",
                                            step2StatusTone === "danger"
                                                ? "text-danger"
                                                : step2StatusTone === "warning"
                                                  ? "text-warning"
                                                  : "text-foreground/60"
                                        )}>
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                            <span className="truncate">
                                                {step2StatusMessage}
                                            </span>
                                        </div>

                                        {/* submitError + disk warnings are rendered in the footer so they're always visible */}
                                    </div>

                                    {source?.kind === "file" && (
                                        <Divider
                                            className="my-panel bg-foreground/25"
                                            aria-hidden="true"
                                        />
                                    )}

                                    {source?.kind === "file" && (
                                        <div className="flex flex-col gap-tools">
                                        <label className={SECTION_LABEL}>
                                            <Hash className="toolbar-icon-size-md" />{" "}
                                            {t(
                                                "modals.add_torrent.transfer_flags"
                                            )}
                                        </label>
                                        <div className="flex flex-col gap-tools">
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
                                    )}
                                </div>
                            </Panel>
                            {/* === RESIZE HANDLE === */}
                            {/* Keep splitter footprint always mounted to preserve stable modal geometry.
                                Collapse should reallocate pane width only, never alter overall modal size. */}
                            <PanelResizeHandle
                                onDragging={
                                    isSettingsCollapsed
                                        ? undefined
                                        : setIsPanelResizeActive
                                }
                                className={cn(
                                    "w-add-modal-pane-gap flex items-stretch justify-center bg-transparent z-panel transition-colors group focus:outline-none relative",
                                    isSettingsCollapsed
                                        ? "cursor-default pointer-events-none"
                                        : "cursor-col-resize"
                                )}
                            >
                                <div className="absolute inset-x-0 py-panel flex justify-center pointer-events-none">
                                    <div
                                        className={cn(
                                            "h-full w-divider transition-colors",
                                            isSettingsCollapsed
                                                ? "bg-transparent"
                                                : isPanelResizeActive
                                                  ? "bg-primary"
                                                  : "bg-default/30 group-hover:bg-primary/45"
                                        )}
                                    />
                                </div>
                            </PanelResizeHandle>
                            {/* === RIGHT PANEL: FILE MANAGER === */}
                            <Panel
                                defaultSize={FILE_PANEL_DEFAULT}
                                minSize={FILE_PANEL_MIN}
                                className={cn(
                                    GLASS_PANEL_SURFACE,
                                    PANE_SURFACE,
                                    "bg-content1/55"
                                )}
                            >
                                <div
                                    className="flex flex-col flex-1 min-h-0 outline-none"
                                    tabIndex={0}
                                    onKeyDown={handleFilesKeyDown}
                                >
                                    {/* Toolbar */}
                                    <div className="p-tight border-b border-default/20 flex gap-tools items-center bg-content1/10 backdrop-blur-sm">
                                        {/* 3. Panel Toggle Button */}
                                        <Tooltip
                                            content={
                                                isSettingsCollapsed
                                                    ? t(
                                                          "modals.add_torrent.show_settings"
                                                      )
                                                    : t(
                                                          "modals.add_torrent.hide_settings"
                                                      )
                                            }
                                        >
                                            <Button
                                                isIconOnly
                                                size="md"
                                                variant="light"
                                                onPress={toggleSettingsPanel}
                                                aria-label={
                                                    isSettingsCollapsed
                                                        ? t(
                                                              "modals.add_torrent.show_settings"
                                                          )
                                                        : t(
                                                              "modals.add_torrent.hide_settings"
                                                          )
                                                }
                                                className="mr-tight text-foreground/35 hover:text-foreground/70"
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
                                            aria-label={t(
                                                "modals.add_torrent.filter_aria"
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
                                                    aria-label={t(
                                                        "modals.add_torrent.smart_select_aria"
                                                    )}
                                                >
                                                    <Sparkles className="toolbar-icon-size-md text-primary" />
                                                </Button>
                                            </DropdownTrigger>
                                            <DropdownMenu
                                                aria-label={t(
                                                    "modals.add_torrent.smart_select"
                                                )}
                                                onAction={(key) =>
                                                    handleSmartSelect(
                                                        key as SmartSelectCommand
                                                    )
                                                }
                                            >
                                                <DropdownItem
                                                    key="all"
                                                    shortcut="Ctrl+A"
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
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden custom-scrollbar">
                                                    <div
                                                        ref={tableLayoutRef}
                                                        className="w-full min-w-add-file-table h-full flex flex-col min-h-0"
                                                    >
                                                        {/* Sticky Table Header */}
                                                        <div
                                                            className="grid border-b border-default/20 bg-content1/10 backdrop-blur-md uppercase font-bold tracking-wider text-foreground/50 select-none z-sticky box-border h-row"
                                                            style={{
                                                                gridTemplateColumns:
                                                                    FILE_GRID_TEMPLATE,
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-center h-full">
                                                                <div
                                                                    onClick={(event) =>
                                                                        event.stopPropagation()
                                                                    }
                                                                >
                                                                    <Checkbox
                                                                        aria-label={t(
                                                                            "modals.add_torrent.col_select"
                                                                        )}
                                                                        isSelected={
                                                                            allFilesSelected
                                                                        }
                                                                        isIndeterminate={
                                                                            someFilesSelected &&
                                                                            !allFilesSelected
                                                                        }
                                                                        onValueChange={() =>
                                                                            handleSmartSelect(
                                                                                allFilesSelected
                                                                                    ? "none"
                                                                                    : "all"
                                                                            )
                                                                        }
                                                                        classNames={{
                                                                            wrapper:
                                                                                "after:bg-primary",
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center h-full pr-panel min-w-0">
                                                                <span className="text-label">
                                                                    {t(
                                                                        "modals.add_torrent.col_name"
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div
                                                                className="relative flex items-center justify-end h-full font-mono pr-panel whitespace-nowrap"
                                                                data-tt-add-col-size="true"
                                                            >
                                                                <span className="text-label">
                                                                    {t(
                                                                        "modals.add_torrent.col_size"
                                                                    )}
                                                                </span>
                                                                {renderFileColumnResizeHandle(
                                                                    "size",
                                                                    t(
                                                                        "modals.add_torrent.resize_size_column"
                                                                    )
                                                                )}
                                                            </div>
                                                            <div
                                                                className="relative flex items-center h-full pl-tight min-w-0"
                                                                data-tt-add-col-priority="true"
                                                            >
                                                                <span className="text-label">
                                                                    {t(
                                                                        "modals.add_torrent.col_priority"
                                                                    )}
                                                                </span>
                                                                {renderFileColumnResizeHandle(
                                                                    "priority",
                                                                    t(
                                                                        "modals.add_torrent.resize_priority_column"
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Virtual List */}
                                                        <div
                                                            ref={scrollParentRef}
                                                            className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
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
                                                                                    ],
                                                                                    virtualItem.index
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    )}
                                                            </div>
                                                        </div>

                                                        {/* Selection Footer Stats */}
                                                        <div className="border-t border-default/20 p-tight text-label font-mono text-center text-foreground/40 bg-content1/10 flex justify-between px-panel">
                                                            <span>
                                                                {t(
                                                                    "modals.add_torrent.selection_footer",
                                                                    {
                                                                        selected:
                                                                            selected.size,
                                                                        total: files.length,
                                                                    }
                                                                )}
                                                            </span>
                                                            <span>
                                                                {formatBytes(
                                                                    selectedSize
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                                </PanelGroup>
                            </motion.div>

                        </LayoutGroup>
                    </ModalBody>

                    {/* --- FOOTER --- */}
                    <ModalFooter
                        // Keep footer geometry invariant across collapse/expand.
                        // Collapse should only reallocate pane space, not resize modal chrome.
                        className="flex flex-col gap-panel px-stage py-panel sm:flex-row sm:items-end sm:justify-between"
                    >
                        <div className="flex items-center gap-tools min-w-0">
                            {freeSpace && (
                                <div className="flex items-center gap-tools min-w-0">
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        color={
                                            isDiskSpaceCritical
                                                ? "warning"
                                                : "default"
                                        }
                                        classNames={{
                                            content:
                                                "font-mono whitespace-nowrap uppercase",
                                        }}
                                    >
                                        {formatBytes(freeSpace.sizeBytes)}{" "}
                                        {t("modals.add_torrent.free")}
                                    </Chip>
                                    <Tooltip
                                        content={t(
                                            "modals.add_torrent.selected_size_tooltip",
                                            {
                                                size: formatBytes(selectedSize),
                                            }
                                        )}
                                    >
                                        <Progress
                                            value={
                                                freeSpace.sizeBytes > 0
                                                    ? Math.min(
                                                          100,
                                                          (selectedSize /
                                                              freeSpace.sizeBytes) *
                                                              100
                                                      )
                                                    : 100
                                            }
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
                            {isCheckingSpace && !freeSpace && !spaceError && (
                                <div className="flex items-center gap-tools text-foreground/40">
                                    <Spinner size="sm" color="primary" />
                                    <span className="text-label font-mono">
                                        {t("modals.add_torrent.free_space_loading")}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-tools sm:items-end shrink-0 sm:ml-auto">
                            {submitError && (
                                <div className="flex items-center gap-tools text-danger text-label bg-danger/10 p-tight rounded-panel border border-danger/20 max-w-modal-compact">
                                    <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                    <span className="font-bold truncate">
                                        {submitError}
                                    </span>
                                </div>
                            )}
                            {isDiskSpaceCritical && (
                                <div className="flex items-center gap-tools text-warning text-label bg-warning/10 p-tight rounded-panel border border-warning/20 max-w-modal-compact">
                                    <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                    <span className="font-bold truncate">
                                        {t("modals.add_torrent.disk_full_paused")}
                                    </span>
                                </div>
                            )}
                            {primaryBlockReason && (
                                <div className="flex items-center gap-tools text-foreground/70 text-label bg-content1/5 p-tight rounded-panel border border-default/10 max-w-modal-compact">
                                    <AlertTriangle className="toolbar-icon-size-md shrink-0 text-foreground/50" />
                                    <span className="font-bold truncate">
                                        {primaryBlockReason}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center justify-end gap-tools">
                                {isSubmitting || submitLocked ? (
                                    <Tooltip
                                        content={t(
                                            "modals.add_torrent.submitting"
                                        )}
                                    >
                                        <div className="inline-block">
                                            <Button
                                                variant="light"
                                                onPress={handleModalCancel}
                                                isDisabled={
                                                    isSubmitting || submitLocked
                                                }
                                                className="font-medium"
                                            >
                                                {t("modals.cancel")}
                                            </Button>
                                        </div>
                                    </Tooltip>
                                ) : (
                                    <div className="inline-block">
                                        <Button
                                            variant="light"
                                            onPress={handleModalCancel}
                                            isDisabled={
                                                isSubmitting || submitLocked
                                            }
                                            className="font-medium"
                                        >
                                            {t("modals.cancel")}
                                        </Button>
                                    </div>
                                )}

                                <ButtonGroup
                                    color={canConfirm ? "primary" : "default"}
                                    variant={canConfirm ? "shadow" : "flat"}
                                >
                                    <Button
                                        onPress={() =>
                                            formRef.current?.requestSubmit()
                                        }
                                        isLoading={isSubmitting || submitLocked}
                                        isDisabled={!canConfirm}
                                        startContent={
                                            !isSubmitting &&
                                            !submitLocked &&
                                            (commitMode === "paused" ? (
                                                <PauseCircle className="toolbar-icon-size-md" />
                                            ) : (
                                                <PlayCircle className="toolbar-icon-size-md" />
                                            ))
                                        }
                                        className="font-bold px-stage min-w-button"
                                    >
                                        {commitMode === "paused"
                                            ? t("modals.add_torrent.add_paused")
                                            : t("modals.add_torrent.add_and_start")}
                                    </Button>
                                    <Dropdown placement="bottom-end">
                                        <DropdownTrigger>
                                            <Button
                                                isIconOnly
                                                aria-label={t(
                                                    "modals.add_torrent.commit_mode_aria"
                                                )}
                                                isDisabled={
                                                    isSubmitting || submitLocked
                                                }
                                            >
                                                <ChevronDown className="toolbar-icon-size-md" />
                                            </Button>
                                        </DropdownTrigger>
                                        <DropdownMenu
                                            aria-label={t(
                                                "modals.add_torrent.commit_mode_aria"
                                            )}
                                            disallowEmptySelection
                                            selectionMode="single"
                                            selectedKeys={[commitMode]}
                                            onAction={(key) =>
                                                onCommitModeChange(
                                                    key as AddTorrentCommitMode
                                                )
                                            }
                                        >
                                            <DropdownItem
                                                key="start"
                                                startContent={
                                                    <PlayCircle className="toolbar-icon-size-md text-success" />
                                                }
                                            >
                                                {t("modals.add_torrent.add_and_start")}
                                            </DropdownItem>
                                            <DropdownItem
                                                key="paused"
                                                startContent={
                                                    <PauseCircle className="toolbar-icon-size-md text-warning" />
                                                }
                                            >
                                                {t("modals.add_torrent.add_paused")}
                                            </DropdownItem>
                                        </DropdownMenu>
                                    </Dropdown>
                                </ButtonGroup>
                            </div>
                        </div>
                        </ModalFooter>
                    </form>
                )}
            </ModalContent>
        </Modal>
    );
}
