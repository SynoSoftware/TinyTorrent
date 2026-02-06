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
import { INTERACTION_CONFIG, KEY_SCOPE } from "@/config/logic";
import { useAddTorrentDestinationViewModel } from "@/modules/torrent-add/hooks/useAddTorrentDestinationViewModel";
import { useAddTorrentFileSelectionViewModel } from "@/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel";
import { useAddTorrentViewportViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewportViewModel";
import { useFreeSpaceProbe } from "@/modules/torrent-add/hooks/useFreeSpaceProbe";
import {
    buildFiles,
    buildSelectionCommit,
    type SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";
import { isValidDestinationForMode } from "@/modules/torrent-add/utils/destination";
import {
    getAddTorrentDestinationStatus,
    type AddTorrentDestinationStatusKind,
} from "@/modules/torrent-add/utils/destinationStatus";
import type {
    AddTorrentCommitMode,
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";

type ResolvedState = "pending" | "ready" | "error";

export interface UseAddTorrentModalViewModelParams {
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
    commitMode: AddTorrentCommitMode;
    downloadDir: string;
    isOpen: boolean;
    isSubmitting: boolean;
    onBrowseDirectory?: (
        currentPath: string
    ) => Promise<string | null | undefined>;
    onCancel: () => void;
    onConfirm: (selection: AddTorrentSelection) => Promise<void>;
    onDownloadDirChange: (value: string) => void;
    source: AddTorrentSource | null;
}

export interface UseAddTorrentModalViewModelResult {
    applyDroppedPath: (path?: string) => void;
    canCollapseSettings: boolean;
    canConfirm: boolean;
    completeGate: () => void;
    destinationDraft: string;
    destinationGateCompleted: boolean;
    destinationGateTried: boolean;
    dropActive: boolean;
    files: ReturnType<typeof buildFiles>;
    filter: string;
    filteredFiles: ReturnType<typeof buildFiles>;
    formRef: React.RefObject<HTMLFormElement | null>;
    handleBrowse: () => Promise<void>;
    handleDestinationGateContinue: () => void;
    handleDestinationInputBlur: () => void;
    handleDestinationInputKeyDown: (
        event: ReactKeyboardEvent<HTMLInputElement>
    ) => void;
    handleDragLeave: () => void;
    handleDragOver: (event: React.DragEvent) => void;
    handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    handleFormKeyDown: (event: ReactKeyboardEvent<HTMLFormElement>) => void;
    handleFormSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
    handleModalCancel: () => void;
    handleRowClick: (index: number, shiftKey: boolean) => void;
    handleSettingsPanelCollapse: () => void;
    handleSettingsPanelExpand: () => void;
    handleSmartSelect: (command: SmartSelectCommand) => void;
    hasDestination: boolean;
    isDiskSpaceCritical: boolean;
    isDestinationDraftValid: boolean;
    isFileTableInteractive: boolean;
    isFullscreen: boolean;
    isPanelResizeActive: boolean;
    isSelectionEmpty: boolean;
    isSettingsCollapsed: boolean;
    isTouchingDirectory: boolean;
    layout: {
        rowHeight: number;
    };
    markGateTried: () => void;
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
    onCyclePriority: (index: number) => void;
    onSetPriority: (index: number, value: "low" | "normal" | "high") => void;
    onRowSelectionChange: (
        next:
            | import("@tanstack/react-table").RowSelectionState
            | ((prev: import("@tanstack/react-table").RowSelectionState) => import("@tanstack/react-table").RowSelectionState)
    ) => void;
    primaryBlockReason: string | null;
    priorities: Map<number, "low" | "normal" | "high">;
    recentPaths: string[];
    requestSubmit: () => void;
    requestCloseConfirm: () => void;
    resolvedState: ResolvedState;
    rowSelection: import("@tanstack/react-table").RowSelectionState;
    selectedCount: number;
    selectedIndexes: Set<number>;
    selectedSize: number;
    sequential: boolean;
    setFilter: (value: string) => void;
    setIsFullscreen: (next: boolean) => void;
    setIsPanelResizeActive: (active: boolean) => void;
    setSequential: (next: boolean) => void;
    setSkipHashCheck: (next: boolean) => void;
    settingsPanelRef: React.RefObject<ImperativePanelHandle | null>;
    shouldShowCloseConfirm: boolean;
    shouldShowSubmittingOverlay: boolean;
    showBrowseAction: boolean;
    showDestinationGate: boolean;
    skipHashCheck: boolean;
    sourceLabel: string | undefined;
    spaceErrorDetail: string | null;
    step1DestinationMessage: string;
    step1StatusKind: AddTorrentDestinationStatusKind;
    step2StatusKind: AddTorrentDestinationStatusKind;
    step2StatusMessage: string;
    submitError: string | null;
    submitLocked: boolean;
    toggleSettingsPanel: () => void;
    uiMode: "Full" | "Rpc";
    updateDestinationDraft: (value: string) => void;
    cancelCloseConfirm: () => void;
}

export function useAddTorrentModalViewModel({
    checkFreeSpace,
    commitMode,
    downloadDir,
    isOpen,
    isSubmitting,
    onBrowseDirectory,
    onCancel,
    onConfirm,
    onDownloadDirChange,
    source,
}: UseAddTorrentModalViewModelParams): UseAddTorrentModalViewModelResult {
    const { t } = useTranslation();
    const { rowHeight } = useLayoutMetrics();
    const {
        uiCapabilities: { uiMode, canBrowse },
    } = useSession();
    const { preferences: { addTorrentHistory }, setAddTorrentHistory } = usePreferences();

    const formRef = useRef<HTMLFormElement | null>(null);
    const settingsPanelRef = useRef<ImperativePanelHandle | null>(null);
    const isMountedRef = useRef(false);
    const submitLockRef = useRef(false);
    const wasOpenForResetRef = useRef(false);
    const prevSourceRef = useRef<AddTorrentSource | null>(null);

    const [sequential, setSequential] = useState(false);
    const [skipHashCheck, setSkipHashCheck] = useState(true);
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
        uiMode,
        onDownloadDirChange,
        onBrowseDirectory,
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
        filter,
        setFilter,
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
            setSequential(false);
            setSkipHashCheck(true);
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

    const freeSpaceProbe = useFreeSpaceProbe({
        checkFreeSpace,
        path: destinationDraft,
        enabled: isValidDestinationForMode(destinationDraft.trim(), uiMode),
    });
    const freeSpace =
        freeSpaceProbe.status === "ok" ? freeSpaceProbe.value : null;
    const spaceError = freeSpaceProbe.status === "error";
    const spaceErrorDetail =
        freeSpaceProbe.status === "error" ? freeSpaceProbe.message ?? null : null;

    const resolvedState = useMemo<ResolvedState>(() => {
        if (source?.kind === "magnet" && !source.metadata) {
            if (source.status === "error") return "error";
            return "pending";
        }
        return files.length ? "ready" : "pending";
    }, [files.length, source]);

    const activeDestination = destinationDraft.trim();
    const isDestinationValid = isValidDestinationForMode(activeDestination, uiMode);
    const isDestinationDraftValid = isValidDestinationForMode(
        destinationDraft,
        uiMode
    );
    const showDestinationGate = !destinationGateCompleted;
    const isDestinationGateRequiredError =
        destinationGateTried && !destinationDraft.trim();
    const isDestinationGateInvalidError =
        !isDestinationDraftValid && Boolean(destinationDraft.trim());

    const destinationStatus = useMemo(
        () =>
            getAddTorrentDestinationStatus({
                activeDestination,
                destinationDraft,
                freeSpaceBytes: freeSpace?.sizeBytes ?? null,
                hasSpaceError: spaceError,
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
            isDestinationDraftValid,
            isDestinationGateInvalidError,
            isDestinationGateRequiredError,
            isDestinationValid,
            spaceError,
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

    const handleDestinationGateContinue = useCallback(() => {
        markGateTried();
        if (!isDestinationDraftValid) return;
        const committed = destinationDraft.trim();
        onDownloadDirChange(committed);
        pushRecentPath(committed);
        completeGate();
    }, [
        completeGate,
        destinationDraft,
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
        const committed = destinationDraft.trim();
        if (isValidDestinationForMode(committed, uiMode)) {
            onDownloadDirChange(committed);
        }
    }, [
        destinationDraft,
        markGateTried,
        onDownloadDirChange,
        showDestinationGate,
        uiMode,
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
                selected: selectedIndexes,
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
            destinationDraft,
            downloadDir,
            files,
            onConfirm,
            onDownloadDirChange,
            priorities,
            pushRecentPath,
            selectedIndexes,
            sequential,
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
        applyDroppedPath,
        canCollapseSettings: true,
        canConfirm,
        completeGate,
        destinationDraft,
        destinationGateCompleted,
        destinationGateTried,
        dropActive,
        files,
        filter,
        filteredFiles,
        formRef,
        handleBrowse,
        handleDestinationGateContinue,
        handleDestinationInputBlur,
        handleDestinationInputKeyDown,
        handleDragLeave,
        handleDragOver,
        handleDrop,
        handleFormKeyDown,
        handleFormSubmit,
        handleModalCancel,
        handleRowClick,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
        handleSmartSelect,
        hasDestination: isDestinationValid,
        isDiskSpaceCritical,
        isDestinationDraftValid,
        isFileTableInteractive:
            isOpen && !showDestinationGate && resolvedState === "ready",
        isFullscreen,
        isPanelResizeActive,
        isSelectionEmpty,
        isSettingsCollapsed,
        isTouchingDirectory,
        layout: { rowHeight },
        markGateTried,
        modalMotionProps,
        modalSize,
        onCyclePriority: cyclePriority,
        onSetPriority: setPriority,
        onRowSelectionChange: setRowSelection,
        primaryBlockReason,
        priorities,
        recentPaths: addTorrentHistory,
        requestSubmit,
        requestCloseConfirm,
        resolvedState,
        rowSelection,
        selectedCount,
        selectedIndexes,
        selectedSize,
        sequential,
        setFilter,
        setIsFullscreen,
        setIsPanelResizeActive,
        setSequential,
        setSkipHashCheck,
        settingsPanelRef,
        shouldShowCloseConfirm: submitCloseConfirm,
        shouldShowSubmittingOverlay: isSubmitting || submitLocked,
        showBrowseAction: Boolean(onBrowseDirectory) && canBrowse,
        showDestinationGate,
        skipHashCheck,
        sourceLabel: source?.label,
        spaceErrorDetail,
        step1DestinationMessage: destinationStatus.step1StatusMessage,
        step1StatusKind: destinationStatus.step1StatusKind,
        step2StatusKind: destinationStatus.step2StatusKind,
        step2StatusMessage: destinationStatus.step2StatusMessage,
        submitError,
        submitLocked,
        toggleSettingsPanel,
        uiMode,
        updateDestinationDraft,
        cancelCloseConfirm,
    };
}
