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
    MODAL,
    FORM,
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
    const { hasDestination, showDestinationGate, uiMode } = destination;
    const { dropActive, handleDragLeave, handleDragOver, handleDrop } =
        dragDrop;
    const { files, handleSmartSelect, isSelectionEmpty } = table;
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
            classNames={MODAL.builder.addTorrentModalClassNames({
                showDestinationGate,
                isFullscreen,
            })}
        >
            <ModalContent>
                <AddTorrentModalContextProvider value={modalContextValue}>
                    {showDestinationGate ? (
                        <div
                            className={MODAL.workflow.gateRoot}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onKeyDown={handleDestinationGateKeyDown}
                        >
                            <ModalHeader className={MODAL.workflow.header}>
                                <div className={MODAL.workflow.titleStack}>
                                    <h2
                                        className={
                                            TEXT_ROLE_EXTENDED.modalTitle
                                        }
                                    >
                                        {t(
                                            "modals.add_torrent.destination_prompt_title",
                                        )}
                                    </h2>
                                    <span
                                        className={
                                            MODAL.workflow.sourceLabelCaption
                                        }
                                    >
                                        {sourceLabel}
                                    </span>
                                </div>
                                <ToolbarIconButton
                                    Icon={X}
                                    onPress={handleModalCancel}
                                    ariaLabel={t("torrent_modal.actions.close")}
                                    iconSize="lg"
                                    className={MODAL.workflow.headerIconButton}
                                />
                            </ModalHeader>
                            <ModalBody className={MODAL.workflow.gateBody}>
                                <div className={MODAL.workflow.gateContent}>
                                    <AddTorrentDestinationGatePanel />
                                </div>
                            </ModalBody>
                        </div>
                    ) : (
                        <form
                            ref={formRef}
                            className={MODAL.workflow.formRoot}
                            onSubmit={handleFormSubmit}
                            onKeyDown={handleFormKeyDown}
                        >
                            {shouldShowSubmittingOverlay && (
                                <div className={MODAL.workflow.submitOverlay}>
                                    {!shouldShowCloseConfirm ? (
                                        <>
                                            <Spinner color="primary" />
                                            <p
                                                className={
                                                    TEXT_ROLE.codeCaption
                                                }
                                            >
                                                {t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            </p>
                                            <p
                                                className={
                                                    MODAL.workflow
                                                        .submitHintMuted
                                                }
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
                                                className={
                                                    MODAL.workflow.warningTone
                                                }
                                            />
                                            <p
                                                className={
                                                    MODAL.workflow
                                                        .submitWarningTitleCaption
                                                }
                                            >
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_title",
                                                )}
                                            </p>
                                            <p
                                                className={
                                                    MODAL.workflow
                                                        .submitHintMuted
                                                }
                                            >
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_body",
                                                )}
                                            </p>
                                            <div
                                                className={
                                                    MODAL.workflow.submitActions
                                                }
                                            >
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
                            <ModalHeader className={MODAL.workflow.header}>
                                <div className={MODAL.workflow.titleStack}>
                                    <h2
                                        className={
                                            TEXT_ROLE_EXTENDED.modalTitle
                                        }
                                    >
                                        {t("modals.add_torrent.title")}
                                    </h2>
                                    <span
                                        className={
                                            MODAL.workflow.sourceMutedLabel
                                        }
                                    >
                                        {sourceLabel}
                                    </span>
                                </div>
                                <div className={MODAL.workflow.headerActions}>
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
                                                <Inbox
                                                    className={
                                                        MODAL.workflow.iconMd
                                                    }
                                                />
                                            ) : (
                                                <HardDrive
                                                    className={
                                                        MODAL.workflow.iconMd
                                                    }
                                                />
                                            )
                                        }
                                        classNames={
                                            MODAL.workflow
                                                .fileCountChipClassNames
                                        }
                                    >
                                        {t("modals.add_torrent.file_count", {
                                            count: files.length,
                                        })}
                                    </Chip>
                                    <div
                                        className={MODAL.workflow.headerDivider}
                                    />

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
                                            className={
                                                MODAL.workflow.headerIconButton
                                            }
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
                                        className={
                                            MODAL.workflow.headerIconButton
                                        }
                                    />
                                </div>
                            </ModalHeader>

                            {/* --- SPLIT VIEW BODY --- */}
                            <ModalBody className={MODAL.workflow.body}>
                                {dropActive && (
                                    <div className={MODAL.workflow.dropOverlay}>
                                        <div
                                            className={
                                                MODAL.workflow.dropOverlayChip
                                            }
                                        >
                                            <FolderOpen
                                                className={
                                                    MODAL.workflow.iconLgPrimary
                                                }
                                            />
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
                                        className={MODAL.builder.bodyPanelsClass(
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
                                            className={
                                                MODAL.workflow.panelGroup
                                            }
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
                                                className={MODAL.builder.settingsPanelClass(
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
                                                className={MODAL.builder.paneHandleClass(
                                                    isSettingsCollapsed,
                                                )}
                                            >
                                                <div
                                                    className={
                                                        MODAL.workflow
                                                            .resizeHandleBarWrap
                                                    }
                                                >
                                                    <div
                                                        className={MODAL.builder.resizeHandleBarClass(
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
                                                className={
                                                    MODAL.workflow.filePanel
                                                }
                                            >
                                                <div
                                                    className={
                                                        MODAL.workflow
                                                            .filePanelContent
                                                    }
                                                >
                                                    {/* Toolbar */}
                                                    <div
                                                        className={
                                                            MODAL.workflow
                                                                .filePanelToolbar
                                                        }
                                                    >
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
                                                                className={
                                                                    FORM
                                                                        .workflow
                                                                        .settingsToggleButton
                                                                }
                                                            >
                                                                {isSettingsCollapsed ? (
                                                                    <SidebarOpen
                                                                        className={
                                                                            MODAL
                                                                                .workflow
                                                                                .iconMd
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <SidebarClose
                                                                        className={
                                                                            MODAL
                                                                                .workflow
                                                                                .iconMd
                                                                        }
                                                                    />
                                                                )}
                                                            </Button>
                                                        </Tooltip>

                                                        {/* Search removed - FileExplorerTree has its own integrated search */}
                                                        <div
                                                            className={
                                                                MODAL.workflow
                                                                    .filesTitle
                                                            }
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
                                                                    className={
                                                                        MODAL
                                                                            .workflow
                                                                            .smartSelectButton
                                                                    }
                                                                    aria-label={t(
                                                                        "modals.add_torrent.smart_select_aria",
                                                                    )}
                                                                >
                                                                    <Sparkles
                                                                        className={
                                                                            MODAL
                                                                                .workflow
                                                                                .iconMdPrimary
                                                                        }
                                                                    />
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
                                                                        <FileVideo
                                                                            className={
                                                                                MODAL
                                                                                    .workflow
                                                                                    .iconMd
                                                                            }
                                                                        />
                                                                    }
                                                                >
                                                                    {t(
                                                                        "modals.add_torrent.smart_select_videos",
                                                                    )}
                                                                </DropdownItem>
                                                                <DropdownItem
                                                                    key="largest"
                                                                    startContent={
                                                                        <ArrowDown
                                                                            className={
                                                                                MODAL
                                                                                    .workflow
                                                                                    .iconMd
                                                                            }
                                                                        />
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
                                                                    className={
                                                                        MODAL
                                                                            .workflow
                                                                            .dropdownDangerItem
                                                                    }
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
                            <ModalFooter className={MODAL.workflow.footer}>
                                <div className={MODAL.workflow.footerAlerts}>
                                    {submitError && (
                                        <AlertPanel
                                            severity="danger"
                                            className={
                                                MODAL.workflow.footerAlert
                                            }
                                        >
                                            <AlertTriangle
                                                className={
                                                    MODAL.workflow.iconAlert
                                                }
                                            />
                                            <span
                                                className={
                                                    MODAL.workflow
                                                        .footerAlertText
                                                }
                                            >
                                                {submitError}
                                            </span>
                                        </AlertPanel>
                                    )}
                                    {isDiskSpaceCritical && (
                                        <AlertPanel
                                            severity="warning"
                                            className={
                                                MODAL.workflow.footerAlert
                                            }
                                        >
                                            <AlertTriangle
                                                className={
                                                    MODAL.workflow.iconAlert
                                                }
                                            />
                                            <span
                                                className={
                                                    MODAL.workflow
                                                        .footerAlertText
                                                }
                                            >
                                                {t(
                                                    "modals.add_torrent.disk_full_paused",
                                                )}
                                            </span>
                                        </AlertPanel>
                                    )}
                                    {primaryBlockReason && (
                                        <AlertPanel
                                            severity="info"
                                            className={
                                                MODAL.workflow.footerInfoAlert
                                            }
                                        >
                                            <AlertTriangle
                                                className={
                                                    MODAL.workflow
                                                        .iconAlertMuted
                                                }
                                            />
                                            <span
                                                className={
                                                    MODAL.workflow
                                                        .footerAlertText
                                                }
                                            >
                                                {primaryBlockReason}
                                            </span>
                                        </AlertPanel>
                                    )}
                                </div>
                                <div
                                    className={
                                        MODAL.workflow.footerActionsStack
                                    }
                                >
                                    <div
                                        className={
                                            MODAL.workflow.footerActionsRow
                                        }
                                    >
                                        {isSubmitting || submitLocked ? (
                                            <Tooltip
                                                content={t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            >
                                                <div
                                                    className={
                                                        MODAL.workflow
                                                            .inlineBlock
                                                    }
                                                >
                                                    <Button
                                                        variant="light"
                                                        onPress={
                                                            handleModalCancel
                                                        }
                                                        isDisabled={
                                                            isSubmitting ||
                                                            submitLocked
                                                        }
                                                        className={
                                                            MODAL.workflow
                                                                .cancelButton
                                                        }
                                                    >
                                                        {t("modals.cancel")}
                                                    </Button>
                                                </div>
                                            </Tooltip>
                                        ) : (
                                            <div
                                                className={
                                                    MODAL.workflow.inlineBlock
                                                }
                                            >
                                                <Button
                                                    variant="light"
                                                    onPress={handleModalCancel}
                                                    isDisabled={
                                                        isSubmitting ||
                                                        submitLocked
                                                    }
                                                    className={
                                                        MODAL.workflow
                                                            .cancelButton
                                                    }
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
                                                        <PauseCircle
                                                            className={
                                                                MODAL.workflow
                                                                    .iconMd
                                                            }
                                                        />
                                                    ) : (
                                                        <PlayCircle
                                                            className={
                                                                MODAL.workflow
                                                                    .iconMd
                                                            }
                                                        />
                                                    ))
                                                }
                                                className={
                                                    MODAL.workflow.primaryButton
                                                }
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
                                                        <ChevronDown
                                                            className={
                                                                MODAL.workflow
                                                                    .iconMd
                                                            }
                                                        />
                                                    </Button>
                                                </DropdownTrigger>
                                                <DropdownMenu
                                                    aria-label={t(
                                                        "modals.add_torrent.commit_mode_aria",
                                                    )}
                                                    disallowEmptySelection
                                                    selectionMode="single"
                                                    selectedKeys={[commitMode]}
                                                    onAction={
                                                        handleCommitModeAction
                                                    }
                                                >
                                                    <DropdownItem
                                                        key="start"
                                                        startContent={
                                                            <PlayCircle
                                                                className={
                                                                    MODAL
                                                                        .workflow
                                                                        .iconMdSuccess
                                                                }
                                                            />
                                                        }
                                                    >
                                                        {t(
                                                            "modals.add_torrent.add_and_start",
                                                        )}
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        key="paused"
                                                        startContent={
                                                            <PauseCircle
                                                                className={
                                                                    MODAL
                                                                        .workflow
                                                                        .iconMdWarning
                                                                }
                                                            />
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
