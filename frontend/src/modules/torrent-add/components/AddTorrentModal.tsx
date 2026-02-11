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
    GLASS_MODAL_SURFACE,
    MODAL_SURFACE_FOOTER,
    MODAL_SURFACE_FRAME,
    MODAL_SURFACE_HEADER,
    GLASS_PANEL_SURFACE,
    PANE_SURFACE_FRAME,
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
import type { AddTorrentModalContextValue } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { AddTorrentModalContextProvider } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { AddTorrentSettingsPanel } from "@/modules/torrent-add/components/AddTorrentSettingsPanel";
import { useAddTorrentModalViewModel } from "@/modules/torrent-add/hooks/useAddTorrentModalViewModel";

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
    const viewModel = useAddTorrentModalViewModel({
        checkFreeSpace,
        commitMode,
        downloadDir,
        isOpen,
        isSubmitting,
        onCancel,
        onConfirm,
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
        destinationDraft,
        handleBrowse,
        handleDestinationGateContinue,
        handleDestinationInputBlur,
        handleDestinationInputKeyDown,
        hasDestination,
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
        uiMode,
        updateDestinationDraft,
    } = destination;
    const {
        applyDroppedPath,
        dropActive,
        handleDragLeave,
        handleDragOver,
        handleDrop,
    } = dragDrop;
    const {
        files,
        handleRowClick,
        handleSmartSelect,
        isSelectionEmpty,
        layout,
        onCyclePriority,
        onSetPriority,
        onRowSelectionChange,
        priorities,
        resolvedState,
        rowSelection,
        selectedCount,
        selectedSize,
    } = table;
    const {
        canCollapseSettings,
        isFullscreen,
        isPanelResizeActive,
        isSettingsCollapsed,
        sequential,
        setIsFullscreen,
        setIsPanelResizeActive,
        setSequential,
        setSkipHashCheck,
        settingsPanelRef,
        skipHashCheck,
        toggleSettingsPanel,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = settings;
    const { canConfirm, isDiskSpaceCritical, primaryBlockReason } = submission;
    const { sourceLabel } = sourceViewModel;

    const modalContextValue: AddTorrentModalContextValue = {
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
            showTransferFlags: source?.kind === "file",
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
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(o) => !o && handleModalCancel()}
            backdrop="blur"
            placement="center"
            motionProps={modalMotionProps}
            hideCloseButton
            isDismissable={
                !showDestinationGate && !isSubmitting && !submitLocked
            }
            size={modalSize} // fullscreen is a pure layout expansion; destination gate is state-based
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    MODAL_SURFACE_FRAME,
                    "w-full",
                    !showDestinationGate && isFullscreen
                        ? "h-full"
                        : showDestinationGate
                          ? "max-h-modal-body"
                          : "max-h-modal-body",
                ),
                body: "p-tight  ",
                header: "p-none select-none blur-glass",
                footer: "p-none select-none",
            }}
        >
            <ModalContent>
                <AddTorrentModalContextProvider value={modalContextValue}>
                    {showDestinationGate ? (
                        <div
                            className="flex flex-col h-full"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    handleModalCancel();
                                    return;
                                }
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleDestinationGateContinue();
                                }
                            }}
                        >
                            <ModalHeader
                                className={cn(
                                    MODAL_SURFACE_HEADER,
                                    "flex justify-between items-center gap-panel px-stage py-panel",
                                )}
                            >
                                <div className="flex flex-col overflow-hidden gap-tight">
                                    <h2 className="text-scaled font-bold tracking-widest uppercase text-foreground">
                                        {t(
                                            "modals.add_torrent.destination_prompt_title",
                                        )}
                                    </h2>
                                    <span className="text-label text-foreground/60 truncate font-mono leading-tight">
                                        {sourceLabel}
                                    </span>
                                </div>
                                <ToolbarIconButton
                                    Icon={X}
                                    onPress={handleModalCancel}
                                    ariaLabel={t("torrent_modal.actions.close")}
                                    iconSize="lg"
                                    className="text-foreground/60 hover:text-foreground"
                                />
                            </ModalHeader>
                            <ModalBody className="flex-1 min-h-0 flex items-center justify-center">
                                <div className="w-full max-w-modal">
                                    <AddTorrentDestinationGatePanel />
                                </div>
                            </ModalBody>
                        </div>
                    ) : (
                        <form
                            ref={formRef}
                            className="flex flex-col min-h-0 flex-1 relative"
                            onSubmit={handleFormSubmit}
                            onKeyDown={handleFormKeyDown}
                        >
                            {shouldShowSubmittingOverlay && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/50 gap-tools z-modal-internal bg-background/40 blur-glass">
                                    {!shouldShowCloseConfirm ? (
                                        <>
                                            <Spinner color="primary" />
                                            <p className="font-mono text-label uppercase tracking-widest">
                                                {t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            </p>
                                            <p className="text-label font-mono text-foreground/40 text-center max-w-modal">
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
                                            <p className="font-mono text-label uppercase tracking-widest text-foreground/70">
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_title",
                                                )}
                                            </p>
                                            <p className="text-label font-mono text-foreground/40 text-center max-w-modal">
                                                {t(
                                                    "modals.add_torrent.close_while_submitting_body",
                                                )}
                                            </p>
                                            <div className="flex gap-tools">
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
                                    "flex justify-between items-center gap-panel px-stage py-panel",
                                )}
                            >
                                <div className="flex flex-col overflow-hidden gap-tight">
                                    <h2 className="text-label font-bold tracking-widest uppercase text-foreground">
                                        {t("modals.add_torrent.title")}
                                    </h2>
                                    <span className="text-scaled text-foreground/50 truncate font-mono leading-tight">
                                        {sourceLabel}
                                    </span>
                                </div>
                                <div className="flex items-center gap-tools">
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
                                        classNames={{
                                            content: "font-mono font-bold",
                                        }}
                                    >
                                        {t("modals.add_torrent.file_count", {
                                            count: files.length,
                                        })}
                                    </Chip>
                                    <div className="h-status-chip w-px bg-content1/10 mx-tight" />
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
                                            className="text-foreground/60 hover:text-foreground"
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
                                        className="text-foreground/60 hover:text-foreground"
                                    />
                                </div>
                            </ModalHeader>

                            {/* --- SPLIT VIEW BODY --- */}
                            <ModalBody className="flex-1 min-h-0 relative p-add-modal-pane-gap">
                                {dropActive && (
                                    <div className="absolute inset-0 z-drop-overlay bg-primary/20 blur-glass border-divider border-primary border-dashed m-panel rounded-panel flex items-center justify-center pointer-events-none">
                                        <div className="bg-background px-stage py-tight rounded-pill shadow-small flex items-center gap-tools animate-pulse">
                                            <FolderOpen className="toolbar-icon-size-lg text-primary" />
                                            <span className="text-scaled font-bold">
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
                                        className={cn(
                                            "flex flex-col flex-1 min-h-settings",
                                            isFullscreen && "h-full min-h-0",
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
                                            className="flex-1 min-h-0"
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
                                                className={cn(
                                                    GLASS_PANEL_SURFACE,
                                                    PANE_SURFACE_FRAME,
                                                    "bg-background/65",
                                                    isSettingsCollapsed &&
                                                        "min-w-0 w-0 border-none",
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
                                                    "w-add-modal-pane-gap flex items-stretch justify-center bg-transparent z-panel transition-colors group focus:outline-none relative",
                                                    isSettingsCollapsed
                                                        ? "cursor-default pointer-events-none"
                                                        : "cursor-col-resize",
                                                )}
                                            >
                                                <div className="absolute inset-x-0 py-panel flex justify-center pointer-events-none">
                                                    <div
                                                        className={cn(
                                                            "h-full w-divider transition-colors",
                                                            isSettingsCollapsed
                                                                ? "bg-transparent"
                                                                : isPanelResizeActive
                                                                  ? "bg-primary"
                                                                  : "bg-default/30 group-hover:bg-primary/45",
                                                        )}
                                                    />
                                                </div>
                                            </PanelResizeHandle>
                                            {/* === RIGHT PANEL: FILE MANAGER === */}
                                            <Panel
                                                defaultSize={FILE_PANEL_DEFAULT}
                                                minSize={FILE_PANEL_MIN}
                                                className={cn(
                                                    GLASS_PANEL_SURFACE,
                                                    PANE_SURFACE_FRAME,
                                                    "bg-content1/55",
                                                )}
                                            >
                                                <div className="flex flex-col flex-1 min-h-0 outline-none border-default">
                                                    {/* Toolbar */}
                                                    <div className="p-tight border-b border-default/50 flex gap-tools items-center surface-layer-1 blur-glass">
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
                                                                className="mr-tight text-foreground/35 hover:text-foreground/70"
                                                            >
                                                                {isSettingsCollapsed ? (
                                                                    <SidebarOpen className="toolbar-icon-size-md" />
                                                                ) : (
                                                                    <SidebarClose className="toolbar-icon-size-md" />
                                                                )}
                                                            </Button>
                                                        </Tooltip>

                                                        {/* Search removed - FileExplorerTree has its own integrated search */}
                                                        <div className="flex-1 text-label text-foreground/40 font-semibold uppercase tracking-wider pl-tight select-none">
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
                                                                    className="surface-layer-1 border border-default/10 min-w-badge px-tight"
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
                                                                    className="text-danger"
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
                                    "flex flex-col gap-panel px-stage py-panel sm:flex-row sm:items-end sm:justify-between",
                                )}
                            >
                                <div className="flex flex-col gap-tools">
                                    {submitError && (
                                        <div className="flex items-center gap-tools text-danger text-label bg-danger/10 p-tight rounded-panel border border-danger/20 max-w-modal-compact">
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                            <span className="font-bold truncate">
                                                {submitError}
                                            </span>
                                        </div>
                                    )}
                                    {isDiskSpaceCritical && (
                                        <div className="flex items-center gap-tools text-warning text-label bg-warning/10 p-tight rounded-panel border border-warning/20 max-w-modal-compact">
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0" />
                                            <span className="font-bold truncate">
                                                {t(
                                                    "modals.add_torrent.disk_full_paused",
                                                )}
                                            </span>
                                        </div>
                                    )}
                                    {primaryBlockReason && (
                                        <div className="flex items-center gap-tools text-foreground/70 text-label bg-content1/5 p-tight rounded-panel border border-default/10 max-w-modal-compact">
                                            <AlertTriangle className="toolbar-icon-size-md shrink-0 text-foreground/50" />
                                            <span className="font-bold truncate">
                                                {primaryBlockReason}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-tools sm:items-end sm:justify-end">
                                    <div className="flex flex-wrap items-center justify-end gap-tools">
                                        {isSubmitting || submitLocked ? (
                                            <Tooltip
                                                content={t(
                                                    "modals.add_torrent.submitting",
                                                )}
                                            >
                                                <div className="inline-block">
                                                    <Button
                                                        variant="light"
                                                        onPress={
                                                            handleModalCancel
                                                        }
                                                        isDisabled={
                                                            isSubmitting ||
                                                            submitLocked
                                                        }
                                                        className="font-medium"
                                                    >
                                                        {t("modals.cancel")}
                                                    </Button>
                                                </div>
                                            </Tooltip>
                                        ) : (
                                            <div className="inline-block">
                                                <Button
                                                    variant="light"
                                                    onPress={handleModalCancel}
                                                    isDisabled={
                                                        isSubmitting ||
                                                        submitLocked
                                                    }
                                                    className="font-medium"
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
                                                className="font-bold px-stage min-w-button"
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
                                                    onAction={(key) =>
                                                        onCommitModeChange(
                                                            key as AddTorrentCommitMode,
                                                        )
                                                    }
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
