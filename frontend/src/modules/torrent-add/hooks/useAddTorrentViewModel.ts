import {
    useCallback,
    useMemo,
    type Key,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { AddTorrentModalContextValue } from "@/modules/torrent-add/components/AddTorrentModalContext";
import type { AddTorrentCommitMode } from "@/modules/torrent-add/types";
import {
    useAddTorrentModalViewModel,
    type UseAddTorrentModalViewModelParams,
} from "@/modules/torrent-add/hooks/useAddTorrentModalViewModel";

interface UseAddTorrentViewModelParams extends UseAddTorrentModalViewModelParams {
    onCommitModeChange: (value: AddTorrentCommitMode) => void;
}

const isAddTorrentCommitMode = (key: Key): key is AddTorrentCommitMode => {
    return key === "start" || key === "paused";
};

export function useAddTorrentViewModel({
    onCommitModeChange,
    ...params
}: UseAddTorrentViewModelParams) {
    const viewModel = useAddTorrentModalViewModel(params);
    const {
        modal,
        destination,
        dragDrop,
        table,
        settings,
        submission,
        source,
    } = viewModel;

    const {
        handleModalCancel,
    } = modal;
    const {
        handleBrowse,
        handleDestinationGateContinue,
        handleDestinationInputBlur,
        handleDestinationInputKeyDown,
        destinationDraft,
        isDestinationDraftValid,
        isTouchingDirectory,
        recentPaths,
        showBrowseAction,
        showDestinationGate,
        step1DestinationMessage,
        step1StatusKind,
        step2StatusKind,
        step2StatusMessage,
        spaceErrorDetail,
        updateDestinationDraft,
    } = destination;
    const {
        applyDroppedPath,
        handleDragLeave,
        handleDragOver,
        handleDrop,
    } = dragDrop;
    const {
        files,
        layout,
        onCyclePriority,
        handleRowClick,
        onRowSelectionChange,
        onSetPriority,
        handleSmartSelect,
        priorities,
        resolvedState,
        selectedCount,
        selectedSize,
        rowSelection,
    } = table;
    const {
        sequential,
        setSequential,
        skipHashCheck,
        setSkipHashCheck,
    } = settings;

    const isDismissable =
        !showDestinationGate && !params.isSubmitting && !modal.submitLocked;

    const handleDestinationGateKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleModalCancel();
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                handleDestinationGateContinue();
            }
        },
        [handleDestinationGateContinue, handleModalCancel],
    );

    const handleCommitModeAction = useCallback(
        (key: Key) => {
            if (!isAddTorrentCommitMode(key)) {
                return;
            }
            onCommitModeChange(key);
        },
        [onCommitModeChange],
    );

    const modalContextValue: AddTorrentModalContextValue = useMemo(
        () => ({
            destinationInput: {
                value: destinationDraft,
                onBlur: handleDestinationInputBlur,
                onChange: updateDestinationDraft,
                onKeyDown: handleDestinationInputKeyDown,
            },
            destinationGate: {
                statusKind: step1StatusKind,
                statusMessage: step1DestinationMessage,
                isDestinationValid: isDestinationDraftValid,
                isTouchingDirectory,
                showBrowseAction,
                onConfirm: handleDestinationGateContinue,
                onBrowse: handleBrowse,
            },
            settings: {
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                recentPaths,
                applyRecentPath: applyDroppedPath,
                statusKind: step2StatusKind,
                statusMessage: step2StatusMessage,
                spaceErrorDetail,
                startPaused: params.commitMode === "paused",
                setStartPaused: (next) =>
                    onCommitModeChange(next ? "paused" : "start"),
                showTransferFlags: params.source?.kind === "file",
                sequential,
                skipHashCheck,
                setSequential,
                setSkipHashCheck,
            },
            fileTable: {
                files,
                priorities,
                resolvedState,
                rowHeight: layout.rowHeight,
                selectedCount,
                selectedSize,
                rowSelection,
                onCyclePriority,
                onRowClick: handleRowClick,
                onRowSelectionChange,
                onSetPriority,
                onSmartSelect: handleSmartSelect,
            },
        }),
        [
            applyDroppedPath,
            destinationDraft,
            files,
            handleBrowse,
            handleDestinationGateContinue,
            handleDestinationInputBlur,
            handleDestinationInputKeyDown,
            handleDragLeave,
            handleDragOver,
            handleDrop,
            handleRowClick,
            handleSmartSelect,
            isDestinationDraftValid,
            isTouchingDirectory,
            layout.rowHeight,
            onCyclePriority,
            onRowSelectionChange,
            onSetPriority,
            params.source?.kind,
            params.commitMode,
            priorities,
            recentPaths,
            resolvedState,
            rowSelection,
            selectedCount,
            selectedSize,
            sequential,
            onCommitModeChange,
            setSequential,
            setSkipHashCheck,
            showBrowseAction,
            skipHashCheck,
            spaceErrorDetail,
            step1DestinationMessage,
            step1StatusKind,
            step2StatusKind,
            step2StatusMessage,
            updateDestinationDraft,
        ],
    );

    return {
        modal,
        destination,
        dragDrop,
        table,
        settings,
        submission,
        source,
        isDismissable,
        handleDestinationGateKeyDown,
        handleCommitModeAction,
        modalContextValue,
    };
}
