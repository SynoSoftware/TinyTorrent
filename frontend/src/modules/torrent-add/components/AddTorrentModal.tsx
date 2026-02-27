import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LayoutGroup, motion } from "framer-motion";
import { useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { registry } from "@/config/logic";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";

const SETTINGS_PANEL_DEFAULT = 40;
const SETTINGS_PANEL_MIN = 25;
const FILE_PANEL_DEFAULT = 60;
const FILE_PANEL_MIN = 30;

import { FolderOpen, HardDrive, type LucideIcon } from "lucide-react";

import { MODAL } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import type { AddTorrentCommitMode, AddTorrentSelection, AddTorrentSource } from "@/modules/torrent-add/types";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { AddTorrentFileTable } from "@/modules/torrent-add/components/AddTorrentFileTable";
import { AddTorrentDestinationGatePanel } from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { AddTorrentSettingsPanel } from "@/modules/torrent-add/components/AddTorrentSettingsPanel";
import { AddTorrentModalContextProvider } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { useAddTorrentModalViewModel } from "@/modules/torrent-add/hooks/useAddTorrentModalViewModel";
const { interaction } = registry;

export interface AddTorrentModalProps {
    isOpen: boolean;
    titleIcon?: LucideIcon;
    source: AddTorrentSource;
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    skipHashCheck: boolean;
    onDownloadDirChange: (value: string) => void;
    onCommitModeChange: (value: AddTorrentCommitMode) => void;
    onSequentialDownloadChange: (value: boolean) => void;
    onSkipHashCheckChange: (value: boolean) => void;
    onCancel: () => void;
    onConfirm: (selection: AddTorrentSelection) => Promise<AddTorrentCommandOutcome>;
}

const FULL_CONTENT_ANIMATION = {
    transition: interaction.config.modalBloom.transition,
    visible: {
        opacity: 1,
        y: 0,
    },
    hidden: {
        opacity: 0,
        y: interaction.config.modalBloom.fallbackOffsetY,
    },
};

export function AddTorrentModal({
    isOpen,
    titleIcon = HardDrive,
    source,
    downloadDir,
    commitMode,
    sequentialDownload,
    skipHashCheck,
    onDownloadDirChange,
    onCommitModeChange,
    onSequentialDownloadChange,
    onSkipHashCheckChange,
    onCancel,
    onConfirm,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const viewModel = useAddTorrentModalViewModel({
        commitMode,
        downloadDir,
        sequentialDownload,
        skipHashCheck,
        isOpen,
        onCancel,
        onConfirm,
        onSequentialDownloadChange,
        onSkipHashCheckChange,
        onDownloadDirChange,
        source,
    });
    const {
        modal,
        destination,
        dragDrop,
        table,
        settings,
        submission,
        source: sourceViewModel,
    } = viewModel;
    const {
        formRef,
        handleFormKeyDown,
        handleFormSubmit,
        handleModalCancel,
        modalSize,
        requestSubmit,
    } = modal;
    const { hasDestination, showDestinationGate, uiMode } = destination;
    const { dropActive, handleDragLeave, handleDragOver, handleDrop } = dragDrop;
    const {
        canCollapseSettings,
        isPanelResizeActive,
        isSettingsCollapsed,
        setIsPanelResizeActive,
        settingsPanelRef,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = settings;
    const { canConfirm } = submission;
    const { sourceLabel } = sourceViewModel;
    const TitleIcon = titleIcon;
    const modalTitle = showDestinationGate
        ? t("modals.add_torrent.destination_prompt_title")
        : t("modals.add_torrent.title");
    const modalTitleContent = (
        <>
            <span className={`${TEXT_ROLE_EXTENDED.modalTitle} truncate`}>{modalTitle}</span>
            {sourceLabel ? (
                <span
                    className={
                        showDestinationGate ? MODAL.workflow.sourceLabelCaption : MODAL.workflow.sourceMutedLabel
                    }
                >
                    {sourceLabel}
                </span>
            ) : null}
        </>
    );
    const primaryActionLabel =
        commitMode === "paused" ? t("modals.add_torrent.add_paused") : t("modals.add_torrent.add_and_start");
    const handleDestinationGateKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleModalCancel();
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                destination.handleDestinationGateContinue();
            }
        },
        [destination.handleDestinationGateContinue, handleModalCancel],
    );

    const destinationInput = useMemo(
        () => ({
            value: destination.destinationDraft,
            onBlur: destination.handleDestinationInputBlur,
            onChange: destination.updateDestinationDraft,
            onKeyDown: destination.handleDestinationInputKeyDown,
        }),
        [
            destination.destinationDraft,
            destination.handleDestinationInputBlur,
            destination.updateDestinationDraft,
            destination.handleDestinationInputKeyDown,
        ],
    );
    const destinationGate = useMemo(
        () => ({
            statusKind: destination.step1StatusKind,
            statusMessage: destination.step1DestinationMessage,
            isDestinationValid: destination.hasDestination,
            isTouchingDirectory: destination.isTouchingDirectory,
            showBrowseAction: destination.showBrowseAction,
            onConfirm: destination.handleDestinationGateContinue,
            onBrowse: destination.handleBrowse,
        }),
        [
            destination.step1StatusKind,
            destination.step1DestinationMessage,
            destination.hasDestination,
            destination.isTouchingDirectory,
            destination.showBrowseAction,
            destination.handleDestinationGateContinue,
            destination.handleBrowse,
        ],
    );
    const settingsPanel = useMemo(
        () => ({
            onDrop: dragDrop.handleDrop,
            onDragOver: dragDrop.handleDragOver,
            onDragLeave: dragDrop.handleDragLeave,
            recentPaths: destination.recentPaths,
            applyRecentPath: dragDrop.applyDroppedPath,
            statusKind: destination.step2StatusKind,
            statusMessage: destination.step2StatusMessage,
            spaceErrorDetail: destination.spaceErrorDetail,
            startPaused: commitMode === "paused",
            setStartPaused: (next: boolean) =>
                onCommitModeChange(next ? "paused" : "start"),
            showTransferFlags: source?.kind === "file",
            sequential: settings.sequential,
            skipHashCheck: settings.skipHashCheck,
            setSequential: settings.setSequential,
            setSkipHashCheck: settings.setSkipHashCheck,
        }),
        [
            dragDrop.handleDrop,
            dragDrop.handleDragOver,
            dragDrop.handleDragLeave,
            destination.recentPaths,
            dragDrop.applyDroppedPath,
            destination.step2StatusKind,
            destination.step2StatusMessage,
            destination.spaceErrorDetail,
            commitMode,
            onCommitModeChange,
            source?.kind,
            settings.sequential,
            settings.skipHashCheck,
            settings.setSequential,
            settings.setSkipHashCheck,
        ],
    );
    const fileTable = useMemo(
        () => ({
            files: table.files,
            priorities: table.priorities,
            rowSelection: table.rowSelection,
            onRowSelectionChange: table.onRowSelectionChange,
            onSetPriority: table.onSetPriority,
        }),
        [
            table.files,
            table.priorities,
            table.rowSelection,
            table.onRowSelectionChange,
            table.onSetPriority,
        ],
    );
    const modalContextValue = useMemo(
        () => ({
            destinationInput,
            destinationGate,
            settings: settingsPanel,
            fileTable,
        }),
        [destinationInput, destinationGate, settingsPanel, fileTable],
    );

    return (
        <ModalEx
            open={isOpen}
            onClose={handleModalCancel}
            title={modalTitleContent}
            icon={TitleIcon}
            size={modalSize}
            maximize={!showDestinationGate}
            bodyVariant={showDestinationGate ? "padded" : "flush"}
            secondaryAction={
                showDestinationGate
                    ? undefined
                    : {
                          label: t("modals.cancel"),
                          onPress: handleModalCancel,
                      }
            }
            primaryAction={
                showDestinationGate
                    ? undefined
                    : {
                          label: primaryActionLabel,
                          onPress: requestSubmit,
                          disabled: !canConfirm,
                }
            }
        >
            <AddTorrentModalContextProvider value={modalContextValue}>
                {showDestinationGate ? (
                    <div
                        className={MODAL.workflow.gateRoot}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onKeyDown={handleDestinationGateKeyDown}
                    >
                        <div className={MODAL.workflow.gateBody}>
                            <div className={MODAL.workflow.gateContent}>
                                <AddTorrentDestinationGatePanel />
                            </div>
                        </div>
                    </div>
                ) : (
                    <form
                        ref={formRef}
                        className={MODAL.workflow.formRoot}
                        onSubmit={handleFormSubmit}
                        onKeyDown={handleFormKeyDown}
                    >
                        <div className={MODAL.workflow.body}>
                            {dropActive ? (
                                <div className={MODAL.workflow.dropOverlay}>
                                    <div className={MODAL.workflow.dropOverlayChip}>
                                        <FolderOpen className={MODAL.workflow.iconLgPrimary} />
                                        <span className={TEXT_ROLE.heading}>
                                            {hasDestination
                                                ? t("modals.add_torrent.drop_to_change_destination")
                                                : uiMode === "Rpc"
                                                  ? t("modals.add_torrent.paste_to_set_destination")
                                                  : t("modals.add_torrent.drop_to_set_destination")}
                                        </span>
                                    </div>
                                </div>
                            ) : null}

                            <LayoutGroup>
                                <motion.div
                                    className={MODAL.builder.bodyPanelsClass(true)}
                                    initial={false}
                                    animate={FULL_CONTENT_ANIMATION.visible}
                                    transition={FULL_CONTENT_ANIMATION.transition}
                                    style={{ pointerEvents: "auto" }}
                                >
                                    <PanelGroup direction="horizontal" className={MODAL.workflow.panelGroup}>
                                        <Panel
                                            ref={settingsPanelRef}
                                            defaultSize={SETTINGS_PANEL_DEFAULT}
                                            minSize={SETTINGS_PANEL_MIN}
                                            collapsible={canCollapseSettings}
                                            onCollapse={handleSettingsPanelCollapse}
                                            onExpand={handleSettingsPanelExpand}
                                            className={MODAL.builder.settingsPanelClass(isSettingsCollapsed)}
                                        >
                                            <AddTorrentSettingsPanel />
                                        </Panel>
                                        <PanelResizeHandle
                                            onDragging={isSettingsCollapsed ? undefined : setIsPanelResizeActive}
                                            className={MODAL.builder.paneHandleClass()}
                                        >
                                            <div className={MODAL.workflow.resizeHandleBarWrap}>
                                                <div
                                                    className={MODAL.builder.resizeHandleBarClass({
                                                        isSettingsCollapsed,
                                                        isPanelResizeActive,
                                                    })}
                                                />
                                            </div>
                                        </PanelResizeHandle>
                                        <Panel
                                            defaultSize={FILE_PANEL_DEFAULT}
                                            minSize={FILE_PANEL_MIN}
                                            className={MODAL.workflow.filePanel}
                                        >
                                            <div className={MODAL.workflow.filePanelContent}>
                                                <AddTorrentFileTable />
                                            </div>
                                        </Panel>
                                    </PanelGroup>
                                </motion.div>
                            </LayoutGroup>
                        </div>
                    </form>
                )}
            </AddTorrentModalContextProvider>
        </ModalEx>
    );
}

