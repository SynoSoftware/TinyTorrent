import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useKeyboardScope } from "@/shared/hooks/useKeyboardScope";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import { useTorrentCommands } from "@/app/context/AppCommandContext";
import {
    KEY_SCOPE,
    SET_LOCATION_VALIDATION_DEBOUNCE_MS,
} from "@/config/logic";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { useAddTorrentDestinationViewModel } from "@/modules/torrent-add/hooks/useAddTorrentDestinationViewModel";
import { useAddTorrentFileSelectionViewModel } from "@/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel";
import { useAddTorrentSubmissionFlow } from "@/modules/torrent-add/hooks/useAddTorrentSubmissionFlow";
import { useAddTorrentViewportViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewportViewModel";
import {
    buildFiles,
} from "@/modules/torrent-add/services/fileSelection";
import {
    resolveAddTorrentModalSize,
    resolveAddTorrentSubmissionDecision,
    type AddTorrentResolvedState,
} from "@/modules/torrent-add/services/addTorrentModalDecisions";
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
import { resolveDestinationValidationDecision } from "@/shared/domain/destinationValidationPolicy";

export interface UseAddTorrentModalViewModelParams {
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    skipHashCheck: boolean;
    downloadDir: string;
    isOpen: boolean;
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
        modalSize: "lg" | "5xl" | "full";
        requestSubmit: () => void;
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
        onSetPriority: (index: number, value: "low" | "normal" | "high") => void;
        onRowSelectionChange: (
            next:
                | import("@tanstack/react-table").RowSelectionState
                | ((prev: import("@tanstack/react-table").RowSelectionState) => import("@tanstack/react-table").RowSelectionState)
        ) => void;
        priorities: Map<number, "low" | "normal" | "high">;
        rowSelection: import("@tanstack/react-table").RowSelectionState;
    };
    settings: {
        canCollapseSettings: boolean;
        isPanelResizeActive: boolean;
        isSettingsCollapsed: boolean;
        sequential: boolean;
        setIsPanelResizeActive: (active: boolean) => void;
        setSequential: (next: boolean) => void;
        setSkipHashCheck: (next: boolean) => void;
        settingsPanelRef: React.RefObject<ImperativePanelHandle | null>;
        skipHashCheck: boolean;
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
    skipHashCheck,
    downloadDir,
    isOpen,
    onCancel,
    onConfirm,
    onDownloadDirChange,
    onSequentialDownloadChange,
    onSkipHashCheckChange,
    source,
}: UseAddTorrentModalViewModelParams): UseAddTorrentModalViewModelResult {
    const { t } = useTranslation();
    const { checkFreeSpace } = useTorrentCommands();
    const {
        daemonPathStyle,
        uiCapabilities: { uiMode, canBrowse },
    } = useSession();
    const { preferences: { addTorrentHistory }, setAddTorrentHistory } = usePreferences();

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

    const {
        destinationDraft,
        updateDestinationDraft,
        destinationGateCompleted,
        destinationGateTried,
        markGateTried,
        completeGate,
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

    const files = useMemo(() => buildFiles(source?.metadata), [source?.metadata]);
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
        debounceMs: SET_LOCATION_VALIDATION_DEBOUNCE_MS,
    });

    const resolvedState = useMemo<AddTorrentResolvedState>(() => {
        if (source?.kind === "magnet" && !source.metadata) {
            if (source.status === "error") return "error";
            return "pending";
        }
        return files.length ? "ready" : "pending";
    }, [files.length, source]);

    const destinationDecision = useMemo(
        () =>
            resolveDestinationValidationDecision({
                mode: "allow_unavailable",
                snapshot: destinationValidation,
            }),
        [destinationValidation],
    );
    const freeSpace = destinationValidation.freeSpace;
    const activeDestination = destinationDecision.normalizedPath.trim();
    const isDestinationValid = destinationDecision.canProceed;
    const hasSpaceWarning =
        destinationValidation.status === "valid" &&
        destinationValidation.probeWarning === "free_space_unavailable";
    const isDestinationGateRequiredError =
        destinationGateTried && destinationDraft.trim().length === 0;
    const isDestinationGateInvalidError =
        destinationDecision.blockReason === "invalid" &&
        destinationValidation.hasValue;
    const showDestinationGate = !destinationGateCompleted;
    const spaceErrorDetail = null;

    const destinationStatus = useMemo(
        () =>
            getAddTorrentDestinationStatus({
                activeDestination,
                destinationDraft,
                freeSpaceBytes: freeSpace?.sizeBytes ?? null,
                hasSpaceError: hasSpaceWarning,
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
            isDestinationGateInvalidError,
            isDestinationGateRequiredError,
            isDestinationValid,
            t,
            uiMode,
        ]
    );

    const canSubmitByInputs =
        !isSelectionEmpty &&
        isDestinationValid &&
        resolvedState === "ready";
    const {
        submit: submitSelection,
    } = useAddTorrentSubmissionFlow({
        canSubmit: canSubmitByInputs,
        destinationPath: destinationDecision.normalizedPath,
        downloadDir,
        commitMode,
        files,
        selectedIndexes,
        priorities,
        sequentialDownload,
        skipHashCheck,
        onConfirm,
        onDownloadDirChange,
        onSubmitSuccess: pushRecentPath,
    });
    const submissionDecision = useMemo(
        () =>
            resolveAddTorrentSubmissionDecision({
                isSelectionEmpty,
                isDestinationValid,
                resolvedState,
            }),
        [isSelectionEmpty, isDestinationValid, resolvedState],
    );

    const modalSize = resolveAddTorrentModalSize({
        showDestinationGate,
        isFullscreen,
    });

    const handleModalCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);

    const handleDestinationGateContinue = useCallback(() => {
        markGateTried();
        if (!isDestinationValid) return;
        const committed = destinationDecision.normalizedPath.trim();
        onDownloadDirChange(committed);
        pushRecentPath(committed);
        completeGate();
    }, [
        completeGate,
        destinationDecision.normalizedPath,
        isDestinationValid,
        markGateTried,
        onDownloadDirChange,
        pushRecentPath,
    ]);

    const handleDestinationInputBlur = useCallback(() => {
        if (showDestinationGate) {
            markGateTried();
            return;
        }
        if (!isDestinationValid) return;
        const committed = destinationDecision.normalizedPath.trim();
        onDownloadDirChange(committed);
    }, [
        destinationDecision.normalizedPath,
        isDestinationValid,
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
            if (
                !showDestinationGate &&
                event.key === "Enter" &&
                !submissionDecision.canConfirm
            ) {
                event.preventDefault();
            }
        },
        [
            handleDestinationGateContinue,
            showDestinationGate,
            submissionDecision.canConfirm,
        ]
    );

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
            handleDestinationInputKeyDown,
            hasDestination: isDestinationValid,
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
            onSetPriority: setPriority,
            onRowSelectionChange: setRowSelection,
            priorities,
            rowSelection,
        },
        settings: {
            canCollapseSettings: true,
            isPanelResizeActive,
            isSettingsCollapsed,
            sequential: sequentialDownload,
            setIsPanelResizeActive,
            setSequential: onSequentialDownloadChange,
            setSkipHashCheck: onSkipHashCheckChange,
            settingsPanelRef,
            skipHashCheck,
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
