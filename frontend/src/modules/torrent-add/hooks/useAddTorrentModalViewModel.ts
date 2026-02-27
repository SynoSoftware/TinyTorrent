import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ImperativePanelHandle } from "react-resizable-panels";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import {
    INTERACTION_CONFIG,
    KEY_SCOPE,
    SET_LOCATION_VALIDATION_DEBOUNCE_MS,
} from "@/config/logic";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { useAddTorrentDestinationViewModel } from "@/modules/torrent-add/hooks/useAddTorrentDestinationViewModel";
import { useAddTorrentFileSelectionViewModel } from "@/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel";
import { useAddTorrentViewportViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewportViewModel";
import {
    buildFiles,
    buildSelectionCommit,
    type SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";
import {
    getAddTorrentDestinationStatus,
    type AddTorrentDestinationStatusKind,
} from "@/modules/torrent-add/utils/destinationStatus";
import type {
    AddTorrentBrowseOutcome,
    AddTorrentCommitMode,
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import { useDestinationPathValidation } from "@/shared/hooks/useDestinationPathValidation";
import { getDestinationValidationReasonMessage } from "@/shared/utils/destinationPathValidationMessage";

type ResolvedState = "pending" | "ready" | "error";

export interface UseAddTorrentModalViewModelParams {
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    skipHashCheck: boolean;
    downloadDir: string;
    isOpen: boolean;
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: (
        selection: AddTorrentSelection
    ) => Promise<AddTorrentCommandOutcome>;
    onDownloadDirChange: (value: string) => void;
    onSequentialDownloadChange: (value: boolean) => void;
    onSkipHashCheckChange: (value: boolean) => void;
    source: AddTorrentSource | null;
}

export interface UseAddTorrentModalViewModelResult {
    modal: {
        formRef: React.RefObject<HTMLFormElement | null>;
        handleFormKeyDown: (event: ReactKeyboardEvent<HTMLFormElement>) => void;
        handleFormSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
        handleModalCancel: () => void;
        modalMotionProps: {
            initial: { opacity: number; scale: number; y: number };
            animate: {
                opacity: number;
                scale: number;
                y: number;
                transition: typeof INTERACTION_CONFIG.modalBloom.transition;
            };
            exit: {
                opacity: number;
                scale: number;
                y: number;
                transition: typeof INTERACTION_CONFIG.modalBloom.transition;
            };
        };
        modalSize: "lg" | "5xl" | "full";
        requestSubmit: () => void;
        shouldShowCloseConfirm: boolean;
        shouldShowSubmittingOverlay: boolean;
        requestCloseConfirm: () => void;
        cancelCloseConfirm: () => void;
        submitError: string | null;
        submitLocked: boolean;
    };
    destination: {
        destinationDraft: string;
        handleBrowse: () => Promise<AddTorrentBrowseOutcome>;
        handleDestinationGateContinue: () => void;
        handleDestinationInputBlur: () => void;
        handleDestinationInputKeyDown: (
            event: ReactKeyboardEvent<HTMLInputElement>
        ) => void;
        hasDestination: boolean;
        isDestinationDraftValid: boolean;
        isTouchingDirectory: boolean;
        recentPaths: string[];
        showBrowseAction: boolean;
        showDestinationGate: boolean;
        step1DestinationMessage: string;
        step1StatusKind: AddTorrentDestinationStatusKind;
        step2StatusKind: AddTorrentDestinationStatusKind;
        step2StatusMessage: string;
        spaceErrorDetail: string | null;
        uiMode: "Full" | "Rpc";
        updateDestinationDraft: (value: string) => void;
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
        filteredFiles: ReturnType<typeof buildFiles>;
        handleRowClick: (index: number, shiftKey: boolean) => void;
        handleSmartSelect: (command: SmartSelectCommand) => void;
        isFileTableInteractive: boolean;
        isSelectionEmpty: boolean;
        layout: {
            rowHeight: number;
        };
        onCyclePriority: (index: number) => void;
        onSetPriority: (index: number, value: "low" | "normal" | "high") => void;
        onRowSelectionChange: (
            next:
                | import("@tanstack/react-table").RowSelectionState
                | ((prev: import("@tanstack/react-table").RowSelectionState) => import("@tanstack/react-table").RowSelectionState)
        ) => void;
        priorities: Map<number, "low" | "normal" | "high">;
        resolvedState: ResolvedState;
        rowSelection: import("@tanstack/react-table").RowSelectionState;
        selectedCount: number;
        selectedSize: number;
    };
    settings: {
        canCollapseSettings: boolean;
        isFullscreen: boolean;
        isPanelResizeActive: boolean;
        isSettingsCollapsed: boolean;
        sequential: boolean;
        setIsFullscreen: (next: boolean) => void;
        setIsPanelResizeActive: (active: boolean) => void;
        setSequential: (next: boolean) => void;
        setSkipHashCheck: (next: boolean) => void;
        settingsPanelRef: React.RefObject<ImperativePanelHandle | null>;
        skipHashCheck: boolean;
        toggleSettingsPanel: () => void;
        handleSettingsPanelCollapse: () => void;
        handleSettingsPanelExpand: () => void;
    };
    submission: {
        canConfirm: boolean;
        isDiskSpaceCritical: boolean;
        primaryBlockReason: string | null;
    };
    source: {
        sourceLabel: string | undefined;
    };
}

export function useAddTorrentModalViewModel({
    checkFreeSpace,
    commitMode,
    sequentialDownload,
    skipHashCheck,
    downloadDir,
    isOpen,
    isSubmitting,
    onCancel,
    onConfirm,
    onDownloadDirChange,
    onSequentialDownloadChange,
    onSkipHashCheckChange,
    source,
}: UseAddTorrentModalViewModelParams): UseAddTorrentModalViewModelResult {
    const { t } = useTranslation();
    const { rowHeight } = useLayoutMetrics();
    const {
        daemonPathStyle,
        uiCapabilities: { uiMode, canBrowse },
    } = useSession();
    const { preferences: { addTorrentHistory }, setAddTorrentHistory } = usePreferences();

    const formRef = useRef<HTMLFormElement | null>(null);
    const settingsPanelRef = useRef<ImperativePanelHandle | null>(null);
    const isMountedRef = useRef(false);
    const submitLockRef = useRef(false);
    const wasOpenForResetRef = useRef(false);
    const prevSourceRef = useRef<AddTorrentSource | null>(null);

    const [submitLocked, setSubmitLocked] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitCloseConfirm, setSubmitCloseConfirm] = useState(false);

    const {
        isFullscreen,
        isSettingsCollapsed,
        isPanelResizeActive,
        setIsFullscreen,
        setIsPanelResizeActive,
        toggleSettingsPanel,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = useAddTorrentViewportViewModel(settingsPanelRef);

    const {
        destinationDraft,
        updateDestinationDraft,
        destinationGateCompleted,
        destinationGateTried,
        markGateTried,
        completeGate,
        resetForOpen,
        dropActive,
        isTouchingDirectory,
        handleDrop,
        handleDragOver,
        handleDragLeave,
        handleBrowse,
        pushRecentPath,
        applyDroppedPath,
    } = useAddTorrentDestinationViewModel({
        downloadDir,
        addTorrentHistory,
        setAddTorrentHistory,
    });

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

    const files = useMemo(() => buildFiles(source?.metadata), [source?.metadata]);
    const {
        rowSelection,
        selectedIndexes,
        selectedCount,
        selectedSize,
        isSelectionEmpty,
        priorities,
        filteredFiles,
        handleSmartSelect,
        setRowSelection,
        handleRowClick,
        setPriority,
        cyclePriority,
        resetForSource,
    } = useAddTorrentFileSelectionViewModel({ files });

    useEffect(() => {
        const wasOpen = wasOpenForResetRef.current;
        const sourceChanged = prevSourceRef.current !== source;
        const shouldReset = isOpen && (!wasOpen || sourceChanged);

        if (shouldReset) {
            const initialFiles = buildFiles(source?.metadata);
            resetForSource(initialFiles);
            setSubmitLocked(false);
            submitLockRef.current = false;
            setSubmitError(null);
            setSubmitCloseConfirm(false);
            resetForOpen();
            setIsFullscreen(false);
            handleSettingsPanelExpand();
        }

        wasOpenForResetRef.current = isOpen;
        prevSourceRef.current = source;
    }, [
        handleSettingsPanelExpand,
        isOpen,
        resetForOpen,
        resetForSource,
        setIsFullscreen,
        source,
    ]);

    const destinationValidation = useDestinationPathValidation({
        isOpen,
        candidatePath: destinationDraft,
        daemonPathStyle,
        checkFreeSpace:
            typeof checkFreeSpace === "function" ? checkFreeSpace : undefined,
        debounceMs: SET_LOCATION_VALIDATION_DEBOUNCE_MS,
    });

    const resolvedState = useMemo<ResolvedState>(() => {
        if (source?.kind === "magnet" && !source.metadata) {
            if (source.status === "error") return "error";
            return "pending";
        }
        return files.length ? "ready" : "pending";
    }, [files.length, source]);

    const activeDestination = destinationValidation.normalizedPath.trim();
    const isValidationUnavailable =
        destinationValidation.reason === "validation_unavailable";
    const isDestinationValid =
        destinationValidation.status === "valid" ||
        (isValidationUnavailable && destinationValidation.hasValue);
    const isDestinationDraftValid = isDestinationValid;
    const isDestinationDraftInvalid =
        destinationValidation.status === "invalid" && !isValidationUnavailable;
    const freeSpace = destinationValidation.freeSpace;
    const hasSpaceWarning =
        destinationValidation.status === "valid" &&
        destinationValidation.probeWarning === "free_space_unavailable";
    const destinationValidationMessage =
        destinationValidation.status === "invalid" &&
        destinationValidation.reason &&
        !isValidationUnavailable
            ? getDestinationValidationReasonMessage(destinationValidation.reason, t)
            : null;
    const spaceErrorDetail = null;
    const showDestinationGate = !destinationGateCompleted;
    const isDestinationGateRequiredError =
        destinationGateTried && !destinationDraft.trim();
    const isDestinationGateInvalidError =
        isDestinationDraftInvalid && Boolean(destinationDraft.trim());

    const destinationStatus = useMemo(
        () =>
            getAddTorrentDestinationStatus({
                activeDestination,
                destinationDraft,
                freeSpaceBytes: freeSpace?.sizeBytes ?? null,
                hasSpaceError: hasSpaceWarning,
                isDestinationDraftValid,
                isDestinationGateInvalidError,
                isDestinationGateRequiredError,
                isDestinationValid,
                uiMode,
                t,
            }),
        [
            activeDestination,
            destinationDraft,
            freeSpace?.sizeBytes,
            hasSpaceWarning,
            isDestinationDraftValid,
            isDestinationGateInvalidError,
            isDestinationGateRequiredError,
            isDestinationValid,
            t,
            uiMode,
        ]
    );

    const isDiskSpaceCritical = freeSpace
        ? selectedSize > freeSpace.sizeBytes
        : false;
    const canConfirm =
        !isSelectionEmpty &&
        isDestinationValid &&
        !submitLocked &&
        !isSubmitting &&
        resolvedState === "ready";
    const primaryBlockReason = (() => {
        if (submitError) return null;
        if (isDiskSpaceCritical) return null;
        if (!isDestinationValid && destinationValidationMessage) {
            return destinationValidationMessage;
        }
        if (isSelectionEmpty) return t("modals.add_torrent.tooltip_select_one");
        if (resolvedState !== "ready") {
            return t("modals.add_torrent.tooltip_resolving_metadata");
        }
        return null;
    })();

    const modalSize: "lg" | "5xl" | "full" = showDestinationGate
        ? "lg"
        : isFullscreen
          ? "full"
          : "5xl";

    const handleModalCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);

    const handleDestinationGateContinue = useCallback(() => {
        markGateTried();
        if (!isDestinationDraftValid) return;
        const committed = destinationValidation.normalizedPath.trim();
        onDownloadDirChange(committed);
        pushRecentPath(committed);
        completeGate();
    }, [
        completeGate,
        destinationValidation.normalizedPath,
        isDestinationDraftValid,
        markGateTried,
        onDownloadDirChange,
        pushRecentPath,
    ]);

    const handleDestinationInputBlur = useCallback(() => {
        if (showDestinationGate) {
            markGateTried();
            return;
        }
        if (!isDestinationDraftValid) return;
        const committed = destinationValidation.normalizedPath.trim();
        onDownloadDirChange(committed);
    }, [
        destinationValidation.normalizedPath,
        isDestinationDraftValid,
        markGateTried,
        onDownloadDirChange,
        showDestinationGate,
    ]);

    const handleDestinationInputKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (showDestinationGate && event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                handleDestinationGateContinue();
                return;
            }
            if (!showDestinationGate && event.key === "Enter" && !canConfirm) {
                event.preventDefault();
            }
        },
        [canConfirm, handleDestinationGateContinue, showDestinationGate]
    );

    const handleFormSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!canConfirm) return;
            if (submitLockRef.current) return;

            submitLockRef.current = true;
            setSubmitLocked(true);
            setSubmitError(null);
            setSubmitCloseConfirm(false);

            const submitDir = destinationValidation.normalizedPath.trim();
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
                selected: selectedIndexes,
                priorities,
            });

            try {
                const outcome = await onConfirm({
                    downloadDir: submitDir,
                    commitMode,
                    filesUnwanted,
                    priorityHigh,
                    priorityNormal,
                    priorityLow,
                    options: {
                        sequential: sequentialDownload,
                        skipHashCheck,
                    },
                });
                if (outcome.status === "added" || outcome.status === "finalized") {
                    pushRecentPath(submitDir);
                    return;
                }
                if (
                    outcome.status === "failed" ||
                    outcome.status === "invalid_input" ||
                    outcome.status === "blocked_pending_delete"
                ) {
                    if (isMountedRef.current) {
                        setSubmitError(t("modals.add_error_default"));
                    }
                }
            } catch {
                if (isMountedRef.current) {
                    setSubmitError(t("modals.add_error_default"));
                }
            } finally {
                if (isMountedRef.current) {
                    submitLockRef.current = false;
                    setSubmitLocked(false);
                }
            }
        },
        [
            canConfirm,
            commitMode,
            destinationValidation.normalizedPath,
            downloadDir,
            files,
            onConfirm,
            onDownloadDirChange,
            priorities,
            pushRecentPath,
            selectedIndexes,
            sequentialDownload,
            skipHashCheck,
            t,
        ]
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
                if (isSubmitting || submitLocked) {
                    if (!submitCloseConfirm) {
                        setSubmitCloseConfirm(true);
                        return;
                    }
                }
                handleModalCancel();
            }
        },
        [
            handleModalCancel,
            isSubmitting,
            requestSubmit,
            submitCloseConfirm,
            submitLocked,
        ]
    );

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

    const requestCloseConfirm = useCallback(() => {
        setSubmitCloseConfirm(true);
    }, []);

    const cancelCloseConfirm = useCallback(() => {
        setSubmitCloseConfirm(false);
    }, []);

    return {
        modal: {
            formRef,
            handleFormKeyDown,
            handleFormSubmit,
            handleModalCancel,
            modalMotionProps,
            modalSize,
            requestSubmit,
            shouldShowCloseConfirm: submitCloseConfirm,
            shouldShowSubmittingOverlay: isSubmitting || submitLocked,
            requestCloseConfirm,
            cancelCloseConfirm,
            submitError,
            submitLocked,
        },
        destination: {
            destinationDraft,
            handleBrowse,
            handleDestinationGateContinue,
            handleDestinationInputBlur,
            handleDestinationInputKeyDown,
            hasDestination: isDestinationValid,
            isDestinationDraftValid,
            isTouchingDirectory,
            recentPaths: addTorrentHistory,
            showBrowseAction: canBrowse,
            showDestinationGate,
            step1DestinationMessage: destinationStatus.step1StatusMessage,
            step1StatusKind: destinationStatus.step1StatusKind,
            step2StatusKind: destinationStatus.step2StatusKind,
            step2StatusMessage: destinationStatus.step2StatusMessage,
            spaceErrorDetail,
            uiMode,
            updateDestinationDraft,
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
            filteredFiles,
            handleRowClick,
            handleSmartSelect,
            isFileTableInteractive:
                isOpen && !showDestinationGate && resolvedState === "ready",
            isSelectionEmpty,
            layout: { rowHeight },
            onCyclePriority: cyclePriority,
            onSetPriority: setPriority,
            onRowSelectionChange: setRowSelection,
            priorities,
            resolvedState,
            rowSelection,
            selectedCount,
            selectedSize,
        },
        settings: {
            canCollapseSettings: true,
            isFullscreen,
            isPanelResizeActive,
            isSettingsCollapsed,
            sequential: sequentialDownload,
            setIsFullscreen,
            setIsPanelResizeActive,
            setSequential: onSequentialDownloadChange,
            setSkipHashCheck: onSkipHashCheckChange,
            settingsPanelRef,
            skipHashCheck,
            toggleSettingsPanel,
            handleSettingsPanelCollapse,
            handleSettingsPanelExpand,
        },
        submission: {
            canConfirm,
            isDiskSpaceCritical,
            primaryBlockReason,
        },
        source: {
            sourceLabel: source?.label,
        },
    };
}
