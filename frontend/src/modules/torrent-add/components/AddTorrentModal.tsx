import {
    Button,
    ButtonGroup,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Spinner,
    cn,
    Tooltip,
} from "@heroui/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LayoutGroup, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { INTERACTION_CONFIG } from "@/config/logic";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";

const SETTINGS_PANEL_DEFAULT = 40;
const SETTINGS_PANEL_MIN = 25;
const FILE_PANEL_DEFAULT = 60;
const FILE_PANEL_MIN = 30;

import {
    ArrowDown,
    ChevronDown,
    FolderOpen,
    HardDrive,
    Inbox,
    Sparkles,
    X,
    FileVideo,
    AlertTriangle,
    PlayCircle,
    PauseCircle,
    Maximize2,
    Minimize2,
    SidebarClose,
    SidebarOpen,
} from "lucide-react";

import {
    IMPORT_MODAL_CLASS,
    buildImportModalBodyPanelsClass,
    buildAddTorrentModalClassNames,
    buildImportResizeHandleBarClass,
    buildImportSettingsPanelClass,
    MODAL_SURFACE_FOOTER,
    MODAL_SURFACE_HEADER,
    IMPORT_FORM_CLASS,
} from "@/shared/ui/layout/glass-surface";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import type {
    AddTorrentCommitMode,
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { AddTorrentFileTable } from "@/modules/torrent-add/components/AddTorrentFileTable";
import type { SmartSelectCommand } from "@/modules/torrent-add/services/fileSelection";
import { AddTorrentDestinationGatePanel } from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { AddTorrentModalContextProvider } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { AddTorrentSettingsPanel } from "@/modules/torrent-add/components/AddTorrentSettingsPanel";
import { useAddTorrentViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewModel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";

export interface AddTorrentModalProps {
    isOpen: boolean;
    source: AddTorrentSource | null;
    downloadDir: string;
    commitMode: AddTorrentCommitMode;
    onDownloadDirChange: (value: string) => void;
    onCommitModeChange: (value: AddTorrentCommitMode) => void;
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: (
        selection: AddTorrentSelection,
    ) => Promise<AddTorrentCommandOutcome>;
    checkFreeSpace?: (path: string) => Promise<TransmissionFreeSpace>;
}

// --- CONSTANTS & HELPERS ---

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
}: AddTorrentModalProps) {
    const { t } = useTranslation();
    const viewModel = useAddTorrentViewModel({
        checkFreeSpace,
        commitMode,
        downloadDir,
        isOpen,
        isSubmitting,
        onCancel,
        onConfirm,
        onCommitModeChange,
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
        isDismissable,
        handleDestinationGateKeyDown,
        handleCommitModeAction,
        modalContextValue,
    } = viewModel;
    const {
        formRef,
        handleFormKeyDown,
        handleFormSubmit,
        handleModalCancel,
        modalMotionProps,
        modalSize,
        requestSubmit,
        shouldShowCloseConfirm,
        shouldShowSubmittingOverlay,
        requestCloseConfirm,
        cancelCloseConfirm,
        submitError,
        submitLocked,
    } = modal;
    const {
        hasDestination,
        showDestinationGate,
        uiMode,
    } = destination;
    const {
        dropActive,
        handleDragLeave,
        handleDragOver,
        handleDrop,
    } = dragDrop;
    const {
        files,
        handleSmartSelect,
        isSelectionEmpty,
    } = table;
    const {
        canCollapseSettings,
        isFullscreen,
        isPanelResizeActive,
        isSettingsCollapsed,
        setIsFullscreen,
        setIsPanelResizeActive,
        settingsPanelRef,
        toggleSettingsPanel,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = settings;
    const { canConfirm, isDiskSpaceCritical, primaryBlockReason } = submission;
    const { sourceLabel } = sourceViewModel;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(o) => !o && handleModalCancel()}
            backdrop="blur"
            placement="center"
            motionProps={modalMotionProps}
            hideCloseButton
            isDismissable={isDismissable}
            size={modalSize} // fullscreen is a pure layout expansion; destination gate is state-based
            classNames={buildAddTorrentModalClassNames({
                showDestinationGate,
                isFullscreen,
            })}
        >
            <ModalContent>
                <AddTorrentModalContextProvider value={modalContextValue}>
                    {showDestinationGate ? (
                        <div
                            className={IMPORT_MODAL_CLASS.gateRoot}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onKeyDown={handleDestinationGateKeyDown}
                        >
                            <ModalHeader
                                className={cn(
                                    MODAL_SURFACE_HEADER,
                                    IMPORT_MODAL_CLASS.headerLayout,
                                )}
                            >
                                <div className={IMPORT_MODAL_CLASS.titleStack}>
                                    <h2 className={TEXT_ROLE_EXTENDED.modalTitle}>
                                        {t(
                                            "modals.add_torrent.destination_prompt_title",
                                        )}
                                    </h2>
                                    <span
                                        className={cn(
                                            TEXT_ROLE.caption,
                                            IMPORT_MODAL_CLASS.sourceLabel,
                                        )}
                                    >
                                        {sourceLabel}
                                    </span>
                                </div>
                                <ToolbarIconButton
                                    Icon={X}
                                    onPress={handleModalCancel}
                                    ariaLabel={t("torrent_modal.actions.close")}
                                    iconSize="lg"
                                    className={IMPORT_MODAL_CLASS.headerIconButton}
                                />
                            </ModalHeader>
                            <ModalBody className={IMPORT_MODAL_CLASS.gateBody}>
                                <div className={IMPORT_MODAL_CLASS.gateContent}>
                                    <AddTorrentDestinationGatePanel />
                                </div>
                            </ModalBody>
                        </div>
                    ) : (
                        <form
                            ref={formRef}
                            className={IMPORT_MODAL_CLASS.formRoot}
                            onSubmit={handleFormSubmit}
                            onKeyDown={handleFormKeyDown}
                        >
                            {shouldShowSubmittingOverlay && (
                                <div className={IMPORT_MODAL_CLASS.submitOverlay}>
                                    {!shouldShowCloseConfirm ? (
                                        <>
                                            <Spinner color="primary" />
                                            <p className={TEXT_ROLE.codeCaption}>
                                                {t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            </p>
                                            <p
                                                className={cn(
                                                    TEXT_ROLE.codeMuted,
                                                    IMPORT_MODAL_CLASS.submitHint,
                                                )}
                                            >
                                                {t(
                                                    "modals.add_torrent.submitting_close_hint",
                                                )}
                                            </p>
                                            <Button
                                                variant="flat"
                                                onPress={requestCloseConfirm}
                                            >
                                                {t(
                                                    "modals.add_torrent.close_overlay",
                                                )}
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <StatusIcon
                                                Icon={AlertTriangle}
                                                className="text-warning"
                                            />
                                            <p
                                                className={cn(
                                                    TEXT_ROLE.codeCaption,
                                                    IMPORT_MODAL_CLASS.submitWarningTitle,
                                                )}
                                            >
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_title",
                                                )}
                                            </p>
                                            <p
                                                className={cn(
                                                    TEXT_ROLE.codeMuted,
                                                    IMPORT_MODAL_CLASS.submitHint,
                                                )}
                                            >
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_body",
                                                )}
                                            </p>
                                            <div className={IMPORT_MODAL_CLASS.submitActions}>
                                                <Button
                                                    variant="flat"
                                                    onPress={cancelCloseConfirm}
                                                >
                                                    {t(
                                                        "modals.add_torrent.keep_waiting",
                                                    )}
                                                </Button>
                                                <Button
                                                    color="danger"
                                                    variant="shadow"
                                                    onPress={handleModalCancel}
                                                >
                                                    {t(
                                                        "modals.add_torrent.close_anyway",
                                                    )}
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            {/* --- HEADER --- */}
                            <ModalHeader
                                className={cn(
                                    MODAL_SURFACE_HEADER,
                                    IMPORT_MODAL_CLASS.headerLayout,
                                )}
                            >
                                <div className={IMPORT_MODAL_CLASS.titleStack}>
                                    <h2 className={TEXT_ROLE_EXTENDED.modalTitle}>
                                        {t("modals.add_torrent.title")}
                                    </h2>
                                    <span
                                        className={cn(
                                            TEXT_ROLE.codeMuted,
                                            IMPORT_MODAL_CLASS.sourceMuted,
                                        )}
                                    >
                                        {sourceLabel}
                                    </span>
                                </div>
                                <div className={IMPORT_MODAL_CLASS.headerActions}>
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
                                        classNames={IMPORT_MODAL_CLASS.fileCountChipClassNames}
                                    >
                                        {t("modals.add_torrent.file_count", {
                                            count: files.length,
                                        })}
                                    </Chip>
                                    <div className={IMPORT_MODAL_CLASS.headerDivider} />

                                    {/* 2. Fullscreen Toggle */}
                                    <Tooltip
                                        content={
                                            isFullscreen
                                                ? t(
                                                      "modals.add_torrent.exit_fullscreen",
                                                  )
                                                : t(
                                                      "modals.add_torrent.fullscreen",
                                                  )
                                        }
                                    >
                                        <ToolbarIconButton
                                            Icon={
                                                isFullscreen
                                                    ? Minimize2
                                                    : Maximize2
                                            }
                                            ariaLabel={
                                                isFullscreen
                                                    ? t(
                                                          "modals.add_torrent.exit_fullscreen",
                                                      )
                                                    : t(
                                                          "modals.add_torrent.fullscreen",
                                                      )
                                            }
                                            onPress={() =>
                                                setIsFullscreen(!isFullscreen)
                                            }
                                            isDisabled={
                                                isSubmitting || submitLocked
                                            }
                                            iconSize="lg"
                                            className={IMPORT_MODAL_CLASS.headerIconButton}
                                        />
                                    </Tooltip>
                                    <ToolbarIconButton
                                        Icon={X}
                                        onPress={() =>
                                            !isSubmitting &&
                                            !submitLocked &&
                                            handleModalCancel()
                                        }
                                        ariaLabel={t(
                                            "torrent_modal.actions.close",
                                        )}
                                        iconSize="lg"
                                        isDisabled={
                                            isSubmitting || submitLocked
                                        }
                                        className={IMPORT_MODAL_CLASS.headerIconButton}
                                    />
                                </div>
                            </ModalHeader>

                            {/* --- SPLIT VIEW BODY --- */}
                            <ModalBody className={IMPORT_MODAL_CLASS.body}>
                                {dropActive && (
                                    <div className={IMPORT_MODAL_CLASS.dropOverlay}>
                                        <div className={IMPORT_MODAL_CLASS.dropOverlayChip}>
                                            <FolderOpen className="toolbar-icon-size-lg text-primary" />
                                            <span className={TEXT_ROLE.heading}>
                                                {hasDestination
                                                    ? t(
                                                          "modals.add_torrent.drop_to_change_destination",
                                                      )
                                                    : uiMode === "Rpc"
                                                      ? t(
                                                            "modals.add_torrent.paste_to_set_destination",
                                                        )
                                                      : t(
                                                            "modals.add_torrent.drop_to_set_destination",
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
                                        className={buildImportModalBodyPanelsClass(
                                            isFullscreen,
                                        )}
                                        initial={false}
                                        animate={FULL_CONTENT_ANIMATION.visible}
                                        transition={
                                            FULL_CONTENT_ANIMATION.transition
                                        }
                                        style={{ pointerEvents: "auto" }}
                                    >
                                        <PanelGroup
                                            direction="horizontal"
                                            className={IMPORT_MODAL_CLASS.panelGroup}
                                        >
                                            {/* === LEFT PANEL: CONFIGURATION === */}
                                            <Panel
                                                ref={settingsPanelRef}
                                                defaultSize={
                                                    SETTINGS_PANEL_DEFAULT
                                                }
                                                minSize={SETTINGS_PANEL_MIN}
                                                collapsible={
                                                    canCollapseSettings
                                                }
                                                onCollapse={
                                                    handleSettingsPanelCollapse
                                                }
                                                onExpand={
                                                    handleSettingsPanelExpand
                                                }
                                                className={buildImportSettingsPanelClass(
                                                    isSettingsCollapsed,
                                                )}
                                            >
                                                <AddTorrentSettingsPanel />
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
                                                    IMPORT_MODAL_CLASS.paneHandle,
                                                    isSettingsCollapsed
                                                        ? "cursor-default pointer-events-none"
                                                        : "cursor-col-resize",
                                                )}
                                            >
                                                <div className={IMPORT_MODAL_CLASS.resizeHandleBarWrap}>
                                                    <div
                                                        className={buildImportResizeHandleBarClass(
                                                            {
                                                                isSettingsCollapsed,
                                                                isPanelResizeActive,
                                                            },
                                                        )}
                                                    />
                                                </div>
                                            </PanelResizeHandle>
                                            {/* === RIGHT PANEL: FILE MANAGER === */}
                                            <Panel
                                                defaultSize={FILE_PANEL_DEFAULT}
                                                minSize={FILE_PANEL_MIN}
                                                className={IMPORT_MODAL_CLASS.filePanel}
                                            >
                                                <div className={IMPORT_MODAL_CLASS.filePanelContent}>
                                                    {/* Toolbar */}
                                                    <div className={IMPORT_MODAL_CLASS.filePanelToolbar}>
                                                        {/* 3. Panel Toggle Button */}
                                                        <Tooltip
                                                            content={
                                                                isSettingsCollapsed
                                                                    ? t(
                                                                          "modals.add_torrent.show_settings",
                                                                      )
                                                                    : t(
                                                                          "modals.add_torrent.hide_settings",
                                                                      )
                                                            }
                                                        >
                                                            <Button
                                                                isIconOnly
                                                                size="md"
                                                                variant="light"
                                                                onPress={
                                                                    toggleSettingsPanel
                                                                }
                                                                aria-label={
                                                                    isSettingsCollapsed
                                                                        ? t(
                                                                              "modals.add_torrent.show_settings",
                                                                          )
                                                                        : t(
                                                                              "modals.add_torrent.hide_settings",
                                                                          )
                                                                }
                                                                className={IMPORT_FORM_CLASS.settingsToggleButton}
                                                            >
                                                                {isSettingsCollapsed ? (
                                                                    <SidebarOpen className="toolbar-icon-size-md" />
                                                                ) : (
                                                                    <SidebarClose className="toolbar-icon-size-md" />
                                                                )}
                                                            </Button>
                                                        </Tooltip>

                                                        {/* Search removed - FileExplorerTree has its own integrated search */}
                                                        <div
                                                            className={IMPORT_MODAL_CLASS.filesTitle}
                                                        >
                                                            {files.length > 0
                                                                ? t(
                                                                      "torrent_modal.files_title",
                                                                  )
                                                                : ""}
                                                        </div>

                                                        <Dropdown>
                                                            <DropdownTrigger>
                                                                <Button
                                                                    variant="flat"
                                                                    className={IMPORT_MODAL_CLASS.smartSelectButton}
                                                                    aria-label={t(
                                                                        "modals.add_torrent.smart_select_aria",
                                                                    )}
                                                                >
                                                                    <Sparkles className="toolbar-icon-size-md text-primary" />
                                                                </Button>
                                                            </DropdownTrigger>
                                                            <DropdownMenu
                                                                aria-label={t(
                                                                    "modals.add_torrent.smart_select",
                                                                )}
                                                                onAction={(
                                                                    key,
                                                                ) =>
                                                                    handleSmartSelect(
                                                                        key as SmartSelectCommand,
                                                                    )
                                                                }
                                                            >
                                                                <DropdownItem
                                                                    key="all"
                                                                    shortcut="Ctrl+A"
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.select_all",
                                                                    )}
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    key="videos"
                                                                    startContent={
                                                                        <FileVideo className="toolbar-icon-size-md" />
                                                                    }
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.smart_select_videos",
                                                                    )}
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    key="largest"
                                                                    startContent={
                                                                        <ArrowDown className="toolbar-icon-size-md" />
                                                                    }
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.smart_select_largest",
                                                                    )}
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    key="invert"
                                                                    showDivider
                                                                    shortcut="Ctrl+I"
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.smart_select_invert",
                                                                    )}
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    key="none"
                                                                    className={IMPORT_MODAL_CLASS.dropdownDangerItem}
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.select_none",
                                                                    )}
                                                                </DropdownItem>
                                                            </DropdownMenu>
                                                        </Dropdown>
                                                    </div>

                                                    {/* Content Area */}
                                                    <AddTorrentFileTable />
                                                </div>
                                            </Panel>
                                        </PanelGroup>
                                    </motion.div>
                                </LayoutGroup>
                            </ModalBody>

                            {/* --- FOOTER --- */}
                            <ModalFooter
                                className={cn(
                                    MODAL_SURFACE_FOOTER,
                                    IMPORT_MODAL_CLASS.footerLayout,
                                )}
                            >
                                <div className={IMPORT_MODAL_CLASS.footerAlerts}>
                                    {submitError && (
                                        <AlertPanel
                                            severity="danger"
                                            className={IMPORT_MODAL_CLASS.footerAlert}
                                        >
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                            <span className={cn(TEXT_ROLE.bodyStrong, "truncate")}>
                                                {submitError}
                                            </span>
                                        </AlertPanel>
                                    )}
                                    {isDiskSpaceCritical && (
                                        <AlertPanel
                                            severity="warning"
                                            className={IMPORT_MODAL_CLASS.footerAlert}
                                        >
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                            <span className={cn(TEXT_ROLE.bodyStrong, "truncate")}>
                                                {t(
                                                    "modals.add_torrent.disk_full_paused",
                                                )}
                                            </span>
                                        </AlertPanel>
                                    )}
                                    {primaryBlockReason && (
                                        <AlertPanel
                                            severity="info"
                                            className={IMPORT_MODAL_CLASS.footerInfoAlert}
                                        >
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0 text-foreground/50" />
                                            <span className={cn(TEXT_ROLE.bodyStrong, "truncate")}>
                                                {primaryBlockReason}
                                            </span>
                                        </AlertPanel>
                                    )}
                                </div>
                                <div className={IMPORT_MODAL_CLASS.footerActionsStack}>
                                    <div className={IMPORT_MODAL_CLASS.footerActionsRow}>
                                        {isSubmitting || submitLocked ? (
                                            <Tooltip
                                                content={t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            >
                                                <div className={IMPORT_MODAL_CLASS.inlineBlock}>
                                                    <Button
                                                        variant="light"
                                                        onPress={
                                                            handleModalCancel
                                                        }
                                                        isDisabled={
                                                            isSubmitting ||
                                                            submitLocked
                                                        }
                                                        className={IMPORT_MODAL_CLASS.cancelButton}
                                                    >
                                                        {t("modals.cancel")}
                                                    </Button>
                                                </div>
                                            </Tooltip>
                                        ) : (
                                            <div className={IMPORT_MODAL_CLASS.inlineBlock}>
                                                <Button
                                                    variant="light"
                                                    onPress={handleModalCancel}
                                                    isDisabled={
                                                        isSubmitting ||
                                                        submitLocked
                                                    }
                                                    className={IMPORT_MODAL_CLASS.cancelButton}
                                                >
                                                    {t("modals.cancel")}
                                                </Button>
                                            </div>
                                        )}

                                        <ButtonGroup
                                            color={
                                                canConfirm
                                                    ? "primary"
                                                    : "default"
                                            }
                                            variant={
                                                canConfirm ? "shadow" : "flat"
                                            }
                                        >
                                            <Button
                                                onPress={() => requestSubmit()}
                                                isLoading={
                                                    isSubmitting || submitLocked
                                                }
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
                                                className={IMPORT_MODAL_CLASS.primaryButton}
                                            >
                                                {commitMode === "paused"
                                                    ? t(
                                                          "modals.add_torrent.add_paused",
                                                      )
                                                    : t(
                                                          "modals.add_torrent.add_and_start",
                                                      )}
                                            </Button>
                                            <Dropdown placement="bottom-end">
                                                <DropdownTrigger>
                                                    <Button
                                                        isIconOnly
                                                        aria-label={t(
                                                            "modals.add_torrent.commit_mode_aria",
                                                        )}
                                                        isDisabled={
                                                            isSubmitting ||
                                                            submitLocked
                                                        }
                                                    >
                                                        <ChevronDown className="toolbar-icon-size-md" />
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu
                                                    aria-label={t(
                                                        "modals.add_torrent.commit_mode_aria",
                                                    )}
                                                    disallowEmptySelection
                                                    selectionMode="single"
                                                    selectedKeys={[commitMode]}
                                                    onAction={handleCommitModeAction}
                                                >
                                                    <DropdownItem
                                                        key="start"
                                                        startContent={
                                                            <PlayCircle className="toolbar-icon-size-md text-success" />
                                                        }
                                                    >
                                                        {t(
                                                            "modals.add_torrent.add_and_start",
                                                        )}
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        key="paused"
                                                        startContent={
                                                            <PauseCircle className="toolbar-icon-size-md text-warning" />
                                                        }
                                                    >
                                                        {t(
                                                            "modals.add_torrent.add_paused",
                                                        )}
                                                    </DropdownItem>
                                                </DropdownMenu>
                                            </Dropdown>
                                        </ButtonGroup>
                                    </div>
                                </div>
                            </ModalFooter>
                        </form>
                    )}
                </AddTorrentModalContextProvider>
            </ModalContent>
        </Modal>
    );
}

