import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, cn } from "@heroui/react";
import type { CapabilityState } from "@/app/types/capabilities";
import { registry } from "@/config/logic";

const SETTINGS_PANEL_DEFAULT = 40;
const SETTINGS_PANEL_MIN = 25;
const FILE_PANEL_DEFAULT = 60;
const FILE_PANEL_MIN = 30;
const DESTINATION_INPUT_ID = "add-torrent-settings-destination";

import { FolderOpen, HardDrive, Magnet, type LucideIcon } from "lucide-react";

import { form as formStyles, input, modal as modalStyles } from "@/shared/ui/layout/glass-surface";
import { formControl } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import type { AddTorrentCommitMode, AddTorrentSelection, AddTorrentSource } from "@/modules/torrent-add/types";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { AddTorrentFileTable } from "@/modules/torrent-add/components/AddTorrentFileTable";
import { AddTorrentDestinationGatePanel } from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { AddTorrentSettingsPanel } from "@/modules/torrent-add/components/AddTorrentSettingsPanel";
import { AddTorrentModalContextProvider } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { useAddTorrentModalViewModel } from "@/modules/torrent-add/hooks/useAddTorrentModalViewModel";
const { interaction, visuals } = registry;

export interface AddTorrentModalProps {
    isOpen: boolean;
    titleIcon?: LucideIcon;
    source: AddTorrentSource;
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    sequentialDownload: boolean;
    showAddDialog: boolean;
    sequentialDownloadCapability: CapabilityState;
    onCommitModeChange: (value: AddTorrentCommitMode) => void;
    onShowAddDialogChange: (value: boolean) => void;
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
    showAddDialog,
    sequentialDownloadCapability,
    onCommitModeChange,
    onShowAddDialogChange,
    onCancel,
    onConfirm,
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const viewModel = useAddTorrentModalViewModel({
        commitMode,
        downloadDir,
        sequentialDownload,
        isOpen,
        onCancel,
        onConfirm,
        source,
    });
    const { modal, destination, magnet, dragDrop, table, settings, submission, source: sourceViewModel } = viewModel;
    const { formRef, handleFormKeyDown, handleFormSubmit, handleModalCancel, modalSize, requestSubmit } = modal;
    const { hasDestination, showDestinationGate, uiMode } = destination;
    const isMagnetMode = source?.kind === "magnet";
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
    const magnetInputRef = useRef<HTMLTextAreaElement | null>(null);
    const focusDestinationInput = useCallback(() => {
        const destinationInput = document.querySelector<HTMLInputElement>(
            `[data-destination-editor-root-id="${DESTINATION_INPUT_ID}"] input`,
        );
        if (!destinationInput) {
            return;
        }
        destinationInput.focus();
        destinationInput.select();
    }, []);

    useEffect(() => {
        if (!isOpen || showDestinationGate) {
            return;
        }
        const frame = window.requestAnimationFrame(() => {
            if (isMagnetMode) {
                magnetInputRef.current?.focus();
                return;
            }
            focusDestinationInput();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [focusDestinationInput, isMagnetMode, isOpen, showDestinationGate]);
    const handleMagnetInputKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                focusDestinationInput();
                return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                requestSubmit();
            }
        },
        [focusDestinationInput, requestSubmit],
    );
    const modalTitle = showDestinationGate
        ? t("modals.add_torrent.destination_prompt_title")
        : t("modals.add_torrent.title");
    const modalTitleContent = (
        <>
            <span className={cn(visuals.typography.text.headingCaps, "truncate")}>{modalTitle}</span>
            {sourceLabel ? (
                <span
                    className={
                        showDestinationGate
                            ? modalStyles.workflow.sourceLabelCaption
                            : modalStyles.workflow.sourceMutedLabel
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
            if (event.defaultPrevented) {
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                handleModalCancel();
                return;
            }
        },
        [handleModalCancel],
    );

    const destinationInput = useMemo(
        () => ({
            value: destination.destinationDraft,
            history: destination.recentPaths,
            onBlur: destination.handleDestinationInputBlur,
            onChange: destination.updateDestinationDraft,
            onEscape: handleModalCancel,
        }),
        [
            destination.destinationDraft,
            destination.recentPaths,
            destination.handleDestinationInputBlur,
            destination.updateDestinationDraft,
            handleModalCancel,
        ],
    );
    const destinationGate = useMemo(
        () => ({
            isDestinationValid: destination.hasDestination,
            isTouchingDirectory: destination.isTouchingDirectory,
            showBrowseAction: destination.showBrowseAction,
            onConfirm: destination.handleDestinationGateContinue,
            onEnter: destination.handleDestinationGateContinue,
            onBrowse: destination.handleBrowse,
            feedback: destination.step1Feedback,
        }),
        [
            destination.hasDestination,
            destination.isTouchingDirectory,
            destination.showBrowseAction,
            destination.handleDestinationGateContinue,
            destination.handleBrowse,
            destination.step1Feedback,
        ],
    );
    const settingsPanel = useMemo(
        () => ({
            onDrop: dragDrop.handleDrop,
            onDragOver: dragDrop.handleDragOver,
            onDragLeave: dragDrop.handleDragLeave,
            onEnter: requestSubmit,
            feedback: destination.step2Feedback,
            startPaused: commitMode === "paused",
            setStartPaused: (next: boolean) => onCommitModeChange(next ? "paused" : "start"),
            showTransferFlags: true,
            sequentialDownloadCapability,
            autoFocusDestination: source?.kind !== "magnet",
            sequential: settings.sequential,
            setSequential: settings.setSequential,
        }),
        [
            dragDrop.handleDrop,
            dragDrop.handleDragOver,
            dragDrop.handleDragLeave,
            requestSubmit,
            destination.step2Feedback,
            commitMode,
            onCommitModeChange,
            sequentialDownloadCapability,
            source?.kind,
            settings.sequential,
            settings.setSequential,
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
        [table.files, table.priorities, table.rowSelection, table.onRowSelectionChange, table.onSetPriority],
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
        >
            <AddTorrentModalContextProvider value={modalContextValue}>
                {showDestinationGate ? (
                    <div
                        className={modalStyles.workflow.gateRoot}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onKeyDown={handleDestinationGateKeyDown}
                    >
                        <div className={modalStyles.workflow.gateBody}>
                            <div className={modalStyles.workflow.gateContent}>
                                <AddTorrentDestinationGatePanel />
                            </div>
                        </div>
                    </div>
                ) : (
                    <form
                        ref={formRef}
                        className={modalStyles.workflow.formRoot}
                        onSubmit={handleFormSubmit}
                        onKeyDown={handleFormKeyDown}
                    >
                        <div className={modalStyles.workflow.body}>
                            {dropActive ? (
                                <div className={modalStyles.workflow.dropOverlay}>
                                    <div className={modalStyles.workflow.dropOverlayChip}>
                                        <FolderOpen className={modalStyles.workflow.iconLgPrimary} />
                                        <span className={visuals.typography.text.heading}>
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
                                    className={cn(
                                        modalStyles.addTorrentBodyPanelsBase,
                                        modalStyles.addTorrentBodyPanelsFullscreen,
                                    )}
                                    initial={false}
                                    animate={FULL_CONTENT_ANIMATION.visible}
                                    transition={FULL_CONTENT_ANIMATION.transition}
                                    style={{ pointerEvents: "auto" }}
                                >
                                    <PanelGroup direction="horizontal" className={modalStyles.workflow.panelGroup}>
                                        <Panel
                                            ref={settingsPanelRef}
                                            defaultSize={SETTINGS_PANEL_DEFAULT}
                                            minSize={SETTINGS_PANEL_MIN}
                                            collapsible={canCollapseSettings}
                                            onCollapse={handleSettingsPanelCollapse}
                                            onExpand={handleSettingsPanelExpand}
                                            className={cn(
                                                modalStyles.workflow.settingsPanel,
                                                isSettingsCollapsed && modalStyles.workflow.settingsPanelCollapsed,
                                            )}
                                        >
                                            <AddTorrentSettingsPanel />
                                        </Panel>
                                        <PanelResizeHandle
                                            onDragging={isSettingsCollapsed ? undefined : setIsPanelResizeActive}
                                            className={cn(
                                                modalStyles.workflow.paneHandle,
                                                modalStyles.workflow.paneHandleEnabled,
                                            )}
                                        >
                                            <div className={modalStyles.workflow.resizeHandleBarWrap}>
                                                <div
                                                    className={cn(
                                                        modalStyles.workflow.resizeHandleBarBase,
                                                        isPanelResizeActive
                                                            ? modalStyles.workflow.resizeHandleBarActive
                                                            : modalStyles.workflow.resizeHandleBarIdle,
                                                    )}
                                                />
                                            </div>
                                        </PanelResizeHandle>
                                        <Panel
                                            defaultSize={FILE_PANEL_DEFAULT}
                                            minSize={FILE_PANEL_MIN}
                                            className={modalStyles.workflow.filePanel}
                                        >
                                            <div className={modalStyles.workflow.filePanelContent}>
                                                {isMagnetMode ? (
                                                    <div className={formStyles.workflow.fillRoot}>
                                                        <div className={formStyles.workflow.fillSection}>
                                                            <label className={formStyles.workflow.label}>
                                                                <Magnet className={formStyles.workflow.labelIcon} />
                                                                {t("modals.magnet_label")}
                                                            </label>
                                                            <div className={formStyles.workflow.fillBody}>
                                                                <div className={input.fillCodeTextareaFrame}>
                                                                    <textarea
                                                                        ref={magnetInputRef}
                                                                        autoFocus
                                                                        value={magnet.value}
                                                                        onChange={(event) =>
                                                                            magnet.setValue(event.target.value)
                                                                        }
                                                                        placeholder={t("modals.add_magnet.placeholder")}
                                                                        className={input.fillCodeTextarea}
                                                                        spellCheck={false}
                                                                        onKeyDown={handleMagnetInputKeyDown}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <AddTorrentFileTable />
                                                )}
                                            </div>
                                        </Panel>
                                    </PanelGroup>
                                </motion.div>
                            </LayoutGroup>
                        </div>
                        <div className={modalStyles.workflow.footer}>
                            {!isMagnetMode ? (
                                <Checkbox
                                    isSelected={!showAddDialog}
                                    onValueChange={(value) => onShowAddDialogChange(!value)}
                                    classNames={formControl.checkboxLabelBodySmallClassNames}
                                >
                                    {t("modals.add_torrent.dont_show_again")}
                                </Checkbox>
                            ) : null}
                            <div className={modalStyles.footerButtonRow}>
                                <Button
                                    variant="light"
                                    onPress={handleModalCancel}
                                    className={modalStyles.workflow.cancelButton}
                                >
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    color="primary"
                                    variant="shadow"
                                    onPress={requestSubmit}
                                    isDisabled={!canConfirm}
                                    className={modalStyles.workflow.primaryButton}
                                >
                                    {primaryActionLabel}
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </AddTorrentModalContextProvider>
        </ModalEx>
    );
}
