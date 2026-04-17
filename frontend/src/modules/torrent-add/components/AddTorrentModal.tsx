import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox, cn } from "@heroui/react";
import type { CapabilityState } from "@/app/types/capabilities";
import { registry } from "@/config/logic";

const SETTINGS_PANEL_DEFAULT = 40;
const SETTINGS_PANEL_MIN = 25;
const FILE_PANEL_DEFAULT = 60;
const FILE_PANEL_MIN = 30;
const DESTINATION_INPUT_ID = "add-torrent-settings-destination";

import { FolderOpen, HardDrive, Magnet, type LucideIcon } from "lucide-react";

import { form as formStyles, input } from "@/shared/ui/layout/glass-surface";
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

const addTorrentModalLayout = {
    titleSourceLabel: `${registry.tokens.primitive.typography.text.caption} truncate font-mono leading-tight`,
    titleSourceMuted: `${registry.tokens.primitive.typography.text.codeMuted} text-foreground/50 truncate leading-tight`,
    titleIconAccent: "text-accent",
    panelStack: "flex flex-col flex-1 min-h-settings",
    panelStackFull: "h-full min-h-0",
    gateRoot: "flex flex-col h-full",
    gateBody: "flex-1 min-h-0 flex items-center justify-center",
    gateContent: "w-full max-w-modal",
    formRoot: "flex flex-col min-h-0 flex-1 relative",
    body: "flex-1 min-h-0 relative p-none",
    dropOverlay:
        "absolute inset-0 z-drop-overlay bg-accent-soft blur-glass border-divider border-accent border-dashed m-panel rounded-panel flex items-center justify-center pointer-events-none",
    dropOverlayChip:
        "bg-background px-stage py-tight rounded-pill shadow-small flex items-center gap-tools animate-pulse",
    panelGroup: "flex-1 min-h-0",
    paneHandle: `w-add-modal-pane-gap flex items-stretch justify-center z-panel ${registry.tokens.primitive.motion.fast} group focus:outline-none relative border-x border-default/20 hover:border-accent/45`,
    paneHandleEnabled: "cursor-col-resize",
    settingsPanelCollapsed: "min-w-0 w-0",
    resizeHandleBarBase: `h-full w-divider ${registry.tokens.primitive.motion.fast}`,
    resizeHandleBarActive: "bg-accent",
    resizeHandleBarIdle: "bg-accent/70 group-hover:bg-accent/85",
    resizeHandleBarWrap: "absolute inset-x-0 py-panel flex justify-center pointer-events-none",
    settingsPanel: "glass-panel surface-layer-1 text-foreground border-none shadow-none flex flex-col min-h-0 overflow-hidden",
    filePanel:
        "glass-panel surface-layer-2 text-foreground border-none shadow-none flex flex-col min-h-0 overflow-hidden",
    filePanelContent: "flex flex-col flex-1 min-h-0 outline-none",
} as const;

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
                            ? addTorrentModalLayout.titleSourceLabel
                            : addTorrentModalLayout.titleSourceMuted
                    }
                >
                    {sourceLabel}
                </span>
            ) : null}
        </>
    );
    const primaryActionLabel =
        commitMode === "paused" ? t("modals.add_torrent.add_paused") : t("modals.add_torrent.add_and_start");
    const footerStartContent = !isMagnetMode ? (
        <Checkbox
            isSelected={!showAddDialog}
            onChange={(value) => onShowAddDialogChange(!value)}
            className={formControl.checkboxLabelBodySmallClassNames.base}
        >
            {t("modals.add_torrent.dont_show_again")}
        </Checkbox>
    ) : null;
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
            size={modalSize === "5xl" ? "lg" : modalSize}
            maximize={!showDestinationGate}
            bodyVariant={showDestinationGate ? "padded" : "flush"}
            footerStartContent={footerStartContent}
            secondaryAction={{
                label: t("modals.cancel"),
                onPress: handleModalCancel,
            }}
            primaryAction={{
                label: primaryActionLabel,
                onPress: requestSubmit,
                disabled: !canConfirm,
            }}
        >
            <AddTorrentModalContextProvider value={modalContextValue}>
                {showDestinationGate ? (
                    <div
                        className={addTorrentModalLayout.gateRoot}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onKeyDown={handleDestinationGateKeyDown}
                    >
                        <div className={addTorrentModalLayout.gateBody}>
                            <div className={addTorrentModalLayout.gateContent}>
                                <AddTorrentDestinationGatePanel />
                            </div>
                        </div>
                    </div>
                ) : (
                    <form
                        ref={formRef}
                        className={addTorrentModalLayout.formRoot}
                        onSubmit={handleFormSubmit}
                        onKeyDown={handleFormKeyDown}
                    >
                        <div className={addTorrentModalLayout.body}>
                            {dropActive ? (
                                <div className={addTorrentModalLayout.dropOverlay}>
                                    <div className={addTorrentModalLayout.dropOverlayChip}>
                                        <FolderOpen
                                            className={cn(
                                                "toolbar-icon-size-lg",
                                                addTorrentModalLayout.titleIconAccent,
                                            )}
                                        />
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
                                        addTorrentModalLayout.panelStack,
                                        addTorrentModalLayout.panelStackFull,
                                    )}
                                    initial={false}
                                    animate={FULL_CONTENT_ANIMATION.visible}
                                    transition={FULL_CONTENT_ANIMATION.transition}
                                    style={{ pointerEvents: "auto" }}
                                >
                                    <PanelGroup direction="horizontal" className={addTorrentModalLayout.panelGroup}>
                                        <Panel
                                            ref={settingsPanelRef}
                                            defaultSize={SETTINGS_PANEL_DEFAULT}
                                            minSize={SETTINGS_PANEL_MIN}
                                            collapsible={canCollapseSettings}
                                            onCollapse={handleSettingsPanelCollapse}
                                            onExpand={handleSettingsPanelExpand}
                                            className={cn(
                                                addTorrentModalLayout.settingsPanel,
                                                isSettingsCollapsed && addTorrentModalLayout.settingsPanelCollapsed,
                                            )}
                                        >
                                            <AddTorrentSettingsPanel />
                                        </Panel>
                                        <PanelResizeHandle
                                            onDragging={isSettingsCollapsed ? undefined : setIsPanelResizeActive}
                                            className={cn(
                                                addTorrentModalLayout.paneHandle,
                                                addTorrentModalLayout.paneHandleEnabled,
                                            )}
                                        >
                                            <div className={addTorrentModalLayout.resizeHandleBarWrap}>
                                                <div
                                                    className={cn(
                                                        addTorrentModalLayout.resizeHandleBarBase,
                                                        isPanelResizeActive
                                                            ? addTorrentModalLayout.resizeHandleBarActive
                                                            : addTorrentModalLayout.resizeHandleBarIdle,
                                                    )}
                                                />
                                            </div>
                                        </PanelResizeHandle>
                                        <Panel
                                            defaultSize={FILE_PANEL_DEFAULT}
                                            minSize={FILE_PANEL_MIN}
                                            className={addTorrentModalLayout.filePanel}
                                        >
                                            <div className={addTorrentModalLayout.filePanelContent}>
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
                    </form>
                )}
            </AddTorrentModalContextProvider>
        </ModalEx>
    );
}
