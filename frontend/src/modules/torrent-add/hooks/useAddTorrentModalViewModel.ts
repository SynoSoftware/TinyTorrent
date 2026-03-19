import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ImperativePanelHandle } from "react-resizable-panels";
import type { RowSelectionState } from "@tanstack/react-table";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { useDownloadPaths } from "@/app/hooks/useDownloadPaths";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import { shellAgent } from "@/app/agents/shell-agent";
import { registry } from "@/config/logic";
import { KeyboardScope } from "@/app/controlPlane/shortcuts";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { useAddTorrentFileSelectionViewModel } from "@/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel";
import { useAddTorrentViewportViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewportViewModel";
import {
    buildFiles,
    buildSelectionCommit,
} from "@/modules/torrent-add/services/fileSelection";
import {
    resolveAddTorrentDestinationDecision,
    resolveAddTorrentModalSize,
    resolveAddTorrentResolvedState,
    resolveAddTorrentSubmissionDecision,
} from "@/modules/torrent-add/services/addTorrentModalDecisions";
import {
    getAddTorrentDestinationStatus,
} from "@/modules/torrent-add/utils/destinationStatus";
import type {
    AddTorrentBrowseOutcome,
    AddTorrentCommitMode,
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import { describePathKind } from "@/modules/torrent-add/utils/destination";
import { useDestinationPathValidation } from "@/shared/hooks/useDestinationPathValidation";
import {
    evaluateDestinationPathCandidate,
    normalizeDestinationPathForDaemon,
} from "@/shared/domain/destinationPath";
import { resolveDestinationValidationDecision } from "@/shared/domain/destinationValidationPolicy";
import type { DestinationPathFeedback } from "@/shared/ui/workspace/DestinationPathEditor";
const { timing } = registry;

export interface UseAddTorrentModalViewModelParams {
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    downloadDir: string;
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: (
        selection: AddTorrentSelection
    ) => Promise<AddTorrentCommandOutcome>;
    onSequentialDownloadChange: (value: boolean) => void;
    source: AddTorrentSource | null;
}

export interface UseAddTorrentModalViewModelResult {
    modal: {
        formRef: React.RefObject<HTMLFormElement | null>;
        handleFormKeyDown: (event: ReactKeyboardEvent<HTMLFormElement>) => void;
        handleFormSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
        handleModalCancel: () => void;
        modalSize: "lg" | "5xl" | "full";
        requestSubmit: () => void;
    };
    destination: {
        destinationDraft: string;
        handleBrowse: () => Promise<AddTorrentBrowseOutcome>;
        handleDestinationGateContinue: () => void;
        handleDestinationInputBlur: () => void;
        hasDestination: boolean;
        isTouchingDirectory: boolean;
        recentPaths: string[];
        showBrowseAction: boolean;
        showDestinationGate: boolean;
        step1Feedback: DestinationPathFeedback;
        step2Feedback: DestinationPathFeedback;
        uiMode: "Full" | "Rpc";
        updateDestinationDraft: (value: string) => void;
    };
    magnet: {
        value: string;
        setValue: (value: string) => void;
    };
    dragDrop: {
        applyDroppedPath: (path?: string) => void;
        dropActive: boolean;
        handleDragLeave: () => void;
        handleDragOver: (event: React.DragEvent) => void;
        handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    };
    table: {
        files: ReturnType<typeof buildFiles>;
        onSetPriority: (index: number, value: "low" | "normal" | "high") => void;
        onRowSelectionChange: (
            next:
                | RowSelectionState
                | ((prev: RowSelectionState) => RowSelectionState)
        ) => void;
        priorities: Map<number, "low" | "normal" | "high">;
        rowSelection: RowSelectionState;
    };
    settings: {
        autoFocusDestination: boolean;
        canCollapseSettings: boolean;
        isPanelResizeActive: boolean;
        isSettingsCollapsed: boolean;
        sequential: boolean;
        setIsPanelResizeActive: (active: boolean) => void;
        setSequential: (next: boolean) => void;
        settingsPanelRef: React.RefObject<ImperativePanelHandle | null>;
        handleSettingsPanelCollapse: () => void;
        handleSettingsPanelExpand: () => void;
    };
    submission: {
        canConfirm: boolean;
    };
    source: {
        sourceLabel: string | undefined;
    };
}

export function useAddTorrentModalViewModel({
    commitMode,
    sequentialDownload,
    downloadDir,
    isOpen,
    onCancel,
    onConfirm,
    onSequentialDownloadChange,
    source,
}: UseAddTorrentModalViewModelParams): UseAddTorrentModalViewModelResult {
    const { t } = useTranslation();
    const { checkFreeSpace } = useTorrentCommands();
    const {
        daemonPathStyle,
        uiCapabilities: { uiMode, canBrowse },
    } = useSession();
    const { history: recentPaths, remember } = useDownloadPaths();

    const formRef = useRef<HTMLFormElement | null>(null);
    const settingsPanelRef = useRef<ImperativePanelHandle | null>(null);

    const {
        isFullscreen,
        isSettingsCollapsed,
        isPanelResizeActive,
        setIsPanelResizeActive,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = useAddTorrentViewportViewModel(settingsPanelRef);
    const dropEnabled = uiMode === "Full";
    const showBrowseAction = canBrowse;
    const normalizedDownloadDir = normalizeDestinationPathForDaemon(
        downloadDir,
        daemonPathStyle,
    );
    const initialDestination = evaluateDestinationPathCandidate(
        normalizedDownloadDir,
        daemonPathStyle,
    );
    const isInitialDestinationValid =
        initialDestination.hasValue && initialDestination.reason === null;

    const [destinationDraft, setDestinationDraft] = useState(() =>
        isInitialDestinationValid ? normalizedDownloadDir : "",
    );
    const [destinationGateCompleted, setDestinationGateCompleted] = useState(
        isInitialDestinationValid,
    );
    const [destinationGateTried, setDestinationGateTried] = useState(false);
    const [isTouchingDirectory, setIsTouchingDirectory] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const [magnetLink, setMagnetLink] = useState(
        source?.kind === "magnet" ? source.magnetLink : "",
    );
    const dropActiveRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setMagnetLink(source?.kind === "magnet" ? source.magnetLink : "");
    }, [isOpen, source]);

    const updateDestinationDraft = useCallback((value: string) => {
        setDestinationDraft(value);
    }, []);

    const markGateTried = useCallback(() => {
        setDestinationGateTried(true);
    }, []);

    const completeGate = useCallback(() => {
        setDestinationGateCompleted(true);
    }, []);

    const applyDroppedPath = useCallback(
        (path?: string) => {
            const trimmed = path?.trim();
            if (!trimmed) {
                return;
            }
            setDestinationDraft(trimmed);
        },
        [],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDropActive(false);
            dropActiveRef.current = false;
            if (!dropEnabled) {
                return;
            }

            const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
            let path: string | undefined;

            if (droppedFiles.length > 0) {
                const file = droppedFiles[0] as File & {
                    path?: string;
                    webkitRelativePath?: string;
                };
                path = file.path || file.webkitRelativePath;
            }

            if (!path) {
                path = event.dataTransfer?.getData("text/plain")?.trim();
            }
            if (!path || /^[a-zA-Z]:[\\/]fakepath[\\/]/i.test(path)) {
                return;
            }
            if (describePathKind(path).kind === "unknown") {
                return;
            }

            if (droppedFiles.length > 0) {
                const droppedName = droppedFiles[0]?.name?.trim();
                const normalizedPath = path.replace(/\//g, "\\");
                const droppedLooksLikeFile = Boolean(
                    droppedName && /\.[^\\/.]+$/.test(droppedName),
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
        [applyDroppedPath, dropEnabled],
    );

    const handleDragOver = useCallback(
        (event: ReactDragEvent) => {
            event.preventDefault();
            if (!dropEnabled || dropActiveRef.current) {
                return;
            }
            dropActiveRef.current = true;
            setDropActive(true);
        },
        [dropEnabled],
    );

    const handleDragLeave = useCallback(() => {
        dropActiveRef.current = false;
        setDropActive(false);
    }, []);

    const handleBrowse = useCallback(async () => {
        if (!canBrowse) {
            return { status: "unsupported" } as const;
        }

        setIsTouchingDirectory(true);
        try {
            const start = destinationDraft.trim() || downloadDir;
            const next = (await shellAgent.browseDirectory(start)) ?? null;
            if (!next) {
                return { status: "cancelled" } as const;
            }
            applyDroppedPath(next);
            return { status: "picked", path: next } as const;
        } catch {
            return { status: "failed" } as const;
        } finally {
            setIsTouchingDirectory(false);
        }
    }, [applyDroppedPath, canBrowse, destinationDraft, downloadDir]);

    const { activate: activateModal, deactivate: deactivateModal } =
        useKeyboardScope(KeyboardScope.Modal);
    const { activate: activateDashboard, deactivate: deactivateDashboard } =
        useKeyboardScope(KeyboardScope.Dashboard);

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

    const files = useMemo(
        () => buildFiles(source?.kind === "file" ? source.metadata : undefined),
        [source],
    );
    const {
        rowSelection,
        selectedIndexes,
        isSelectionEmpty,
        priorities,
        setRowSelection,
        setPriority,
    } = useAddTorrentFileSelectionViewModel({ files });

    const destinationValidation = useDestinationPathValidation({
        isOpen,
        candidatePath: destinationDraft,
        daemonPathStyle,
        checkFreeSpace:
            typeof checkFreeSpace === "function" ? checkFreeSpace : undefined,
        debounceMs: timing.debounce.setLocationValidationMs,
    });

    const resolvedState = useMemo(
        () =>
            resolveAddTorrentResolvedState({
                source,
                fileCount: files.length,
                magnetLink,
            }),
        [files.length, magnetLink, source],
    );

    const destinationDecision = useMemo(
        () =>
            resolveDestinationValidationDecision({
                mode: "allow_unavailable",
                snapshot: destinationValidation,
            }),
        [destinationValidation],
    );
    const destinationState = useMemo(
        () =>
            resolveAddTorrentDestinationDecision({
                destinationDecision,
                destinationValidation,
                destinationDraft,
                destinationGateCompleted,
                destinationGateTried,
            }),
        [
            destinationDecision,
            destinationDraft,
            destinationGateCompleted,
            destinationGateTried,
            destinationValidation,
        ],
    );
    const freeSpace = destinationValidation.freeSpace;

    const destinationStatus = useMemo(
        () =>
            getAddTorrentDestinationStatus({
                activeDestination: destinationState.activeDestination,
                destinationDraft,
                freeSpaceBytes: freeSpace?.sizeBytes ?? null,
                hasSpaceError: destinationState.hasSpaceWarning,
                isDestinationGateInvalidError: destinationState.isDestinationGateInvalidError,
                isDestinationGateRequiredError: destinationState.isDestinationGateRequiredError,
                isDestinationValid: destinationState.isDestinationValid,
                uiMode,
                t,
            }),
        [
            destinationDraft,
            destinationState.activeDestination,
            destinationState.hasSpaceWarning,
            destinationState.isDestinationGateInvalidError,
            destinationState.isDestinationGateRequiredError,
            destinationState.isDestinationValid,
            freeSpace?.sizeBytes,
            t,
            uiMode,
        ]
    );
    const step1Feedback = useMemo<DestinationPathFeedback>(
        () => ({
            kind: "message",
            message: destinationStatus.step1StatusMessage,
            tone: destinationStatus.step1StatusKind,
        }),
        [destinationStatus.step1StatusKind, destinationStatus.step1StatusMessage],
    );
    const step2Feedback = useMemo<DestinationPathFeedback>(
        () => ({
            kind: "message",
            message: destinationStatus.step2StatusMessage,
            tone: destinationStatus.step2StatusKind,
        }),
        [destinationStatus.step2StatusKind, destinationStatus.step2StatusMessage],
    );

    const submissionDecision = useMemo(
        () =>
            resolveAddTorrentSubmissionDecision({
                requiresFileSelection: source?.kind === "file",
                isSelectionEmpty,
                isDestinationValid: destinationState.isDestinationValid,
                resolvedState,
            }),
        [
            destinationState.isDestinationValid,
            isSelectionEmpty,
            resolvedState,
            source?.kind,
        ],
    );
    const submitSelection = useCallback(async () => {
        if (!submissionDecision.canConfirm) {
            return;
        }

        const submitDir = destinationDecision.normalizedPath.trim();
        const { filesUnwanted, priorityHigh, priorityLow, priorityNormal } =
            buildSelectionCommit({
                files,
                selected: selectedIndexes,
                priorities,
            });

        try {
            const outcome = await onConfirm({
                downloadDir: submitDir,
                commitMode,
                magnetLink: source?.kind === "magnet" ? magnetLink.trim() : undefined,
                filesUnwanted,
                priorityHigh,
                priorityNormal,
                priorityLow,
                options: {
                    sequential: sequentialDownload,
                },
            });
            if (outcome.status === "queued") {
                remember(submitDir);
            }
        } catch {
            // no-op: command layer owns user-facing error feedback
        }
    }, [
        commitMode,
        destinationDecision.normalizedPath,
        files,
        onConfirm,
        priorities,
        remember,
        selectedIndexes,
        sequentialDownload,
        submissionDecision.canConfirm,
        magnetLink,
        source,
    ]);

    const modalSize = resolveAddTorrentModalSize({
        showDestinationGate: destinationState.showDestinationGate,
        isFullscreen,
    });

    const handleModalCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);

    const handleDestinationGateContinue = useCallback(() => {
        markGateTried();
        if (!destinationState.isDestinationValid) return;
        completeGate();
    }, [
        completeGate,
        destinationState.isDestinationValid,
        markGateTried,
    ]);

    const handleDestinationInputBlur = useCallback(() => {
        if (destinationState.showDestinationGate) {
            markGateTried();
            return;
        }
    }, [
        destinationState.showDestinationGate,
        markGateTried,
    ]);

    const handleFormSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            await submitSelection();
        },
        [submitSelection],
    );

    const requestSubmit = useCallback(() => {
        formRef.current?.requestSubmit();
    }, []);

    const handleFormKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLFormElement>) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                requestSubmit();
            }
            if (event.key === "Escape") {
                event.preventDefault();
                handleModalCancel();
            }
        },
        [
            handleModalCancel,
            requestSubmit,
        ]
    );

    return {
        modal: {
            formRef,
            handleFormKeyDown,
            handleFormSubmit,
            handleModalCancel,
            modalSize,
            requestSubmit,
        },
        destination: {
            destinationDraft,
            handleBrowse,
            handleDestinationGateContinue,
            handleDestinationInputBlur,
            hasDestination: destinationState.isDestinationValid,
            isTouchingDirectory,
            recentPaths,
            showBrowseAction,
            showDestinationGate: destinationState.showDestinationGate,
            step1Feedback,
            step2Feedback,
            uiMode,
            updateDestinationDraft,
        },
        magnet: {
            value: magnetLink,
            setValue: setMagnetLink,
        },
        dragDrop: {
            applyDroppedPath,
            dropActive,
            handleDragLeave,
            handleDragOver,
            handleDrop,
        },
        table: {
            files,
            onSetPriority: setPriority,
            onRowSelectionChange: setRowSelection,
            priorities,
            rowSelection,
        },
        settings: {
            autoFocusDestination: source?.kind !== "magnet",
            canCollapseSettings: true,
            isPanelResizeActive,
            isSettingsCollapsed,
            sequential: sequentialDownload,
            setIsPanelResizeActive,
            setSequential: onSequentialDownloadChange,
            settingsPanelRef,
            handleSettingsPanelCollapse,
            handleSettingsPanelExpand,
        },
        submission: {
            canConfirm: submissionDecision.canConfirm,
        },
        source: {
            sourceLabel: source?.label,
        },
    };
}

