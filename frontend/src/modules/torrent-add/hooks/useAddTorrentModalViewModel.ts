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
import { shellAgent } from "@/app/agents/shell-agent";
import { registry } from "@/config/logic";
import { KeyboardScope } from "@/app/controlPlane/shortcuts";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { useAddTorrentDestinationViewModel } from "@/modules/torrent-add/hooks/useAddTorrentDestinationViewModel";
import { useAddTorrentFileSelectionViewModel } from "@/modules/torrent-add/hooks/useAddTorrentFileSelectionViewModel";
import { useAddTorrentSubmissionFlow } from "@/modules/torrent-add/hooks/useAddTorrentSubmissionFlow";
import { useAddTorrentViewportViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewportViewModel";
import {
    buildFiles,
} from "@/modules/torrent-add/services/fileSelection";
import {
    resolveAddTorrentDestinationDecision,
    resolveAddTorrentModalSize,
    resolveAddTorrentResolvedState,
    resolveAddTorrentSubmissionDecision,
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
const { timing, shell } = registry;

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
    const destinationCapabilityPlane = useMemo(
        () => ({
            daemonPathStyle,
            dropEnabled: uiMode === "Full",
            browseDirectory: canBrowse
                ? async (startPath?: string) =>
                      (await shellAgent.browseDirectory(startPath)) ?? null
                : undefined,
        }),
        [canBrowse, daemonPathStyle, uiMode],
    );
    const showBrowseAction = canBrowse;

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
        capabilityPlane: destinationCapabilityPlane,
    });

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
        debounceMs: timing.debounce.setLocationValidationMs,
    });

    const resolvedState = useMemo(
        () => resolveAddTorrentResolvedState({ source, fileCount: files.length }),
        [files.length, source],
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
    const spaceErrorDetail = null;

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

    const submissionDecision = useMemo(
        () =>
            resolveAddTorrentSubmissionDecision({
                isSelectionEmpty,
                isDestinationValid: destinationState.isDestinationValid,
                resolvedState,
            }),
        [destinationState.isDestinationValid, isSelectionEmpty, resolvedState],
    );
    const {
        submit: submitSelection,
    } = useAddTorrentSubmissionFlow({
        canSubmit: submissionDecision.canConfirm,
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
        const committed = destinationDecision.normalizedPath.trim();
        onDownloadDirChange(committed);
        pushRecentPath(committed);
        completeGate();
    }, [
        completeGate,
        destinationState.isDestinationValid,
        destinationDecision.normalizedPath,
        markGateTried,
        onDownloadDirChange,
        pushRecentPath,
    ]);

    const handleDestinationInputBlur = useCallback(() => {
        if (destinationState.showDestinationGate) {
            markGateTried();
            return;
        }
        if (!destinationState.isDestinationValid) return;
        const committed = destinationDecision.normalizedPath.trim();
        onDownloadDirChange(committed);
    }, [
        destinationState.isDestinationValid,
        destinationState.showDestinationGate,
        destinationDecision.normalizedPath,
        markGateTried,
        onDownloadDirChange,
    ]);

    const handleDestinationInputKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (destinationState.showDestinationGate && event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                handleDestinationGateContinue();
                return;
            }
            if (
                !destinationState.showDestinationGate &&
                event.key === "Enter" &&
                !submissionDecision.canConfirm
            ) {
                event.preventDefault();
            }
        },
        [
            destinationState.showDestinationGate,
            handleDestinationGateContinue,
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
            hasDestination: destinationState.isDestinationValid,
            isTouchingDirectory,
            recentPaths: addTorrentHistory,
            showBrowseAction,
            showDestinationGate: destinationState.showDestinationGate,
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

