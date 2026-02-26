import {
    Button,
    Spinner,
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
    FolderOpen,
    HardDrive,
    AlertTriangle,
    type LucideIcon,
} from "lucide-react";

import { MODAL } from "@/shared/ui/layout/glass-surface";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import type {
    AddTorrentCommitMode,
    AddTorrentSelection,
    AddTorrentSource,
} from "@/modules/torrent-add/types";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";
import { AddTorrentFileTable } from "@/modules/torrent-add/components/AddTorrentFileTable";
import { AddTorrentDestinationGatePanel } from "@/modules/torrent-add/components/AddTorrentDestinationGatePanel";
import { AddTorrentModalContextProvider } from "@/modules/torrent-add/components/AddTorrentModalContext";
import { AddTorrentSettingsPanel } from "@/modules/torrent-add/components/AddTorrentSettingsPanel";
import { useAddTorrentViewModel } from "@/modules/torrent-add/hooks/useAddTorrentViewModel";
import { AlertPanel } from "@/shared/ui/layout/AlertPanel";

export interface AddTorrentModalProps {
    isOpen: boolean;
    titleIcon?: LucideIcon;
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

export function AddTorrentModal({
    isOpen,
    titleIcon = HardDrive,
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
        settings,
        submission,
        source: sourceViewModel,
        handleDestinationGateKeyDown,
        modalContextValue,
    } = viewModel;
    const {
        formRef,
        handleFormKeyDown,
        handleFormSubmit,
        handleModalCancel,
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
    const {
        canCollapseSettings,
        isPanelResizeActive,
        isSettingsCollapsed,
        setIsPanelResizeActive,
        settingsPanelRef,
        handleSettingsPanelCollapse,
        handleSettingsPanelExpand,
    } = settings;
    const { canConfirm, isDiskSpaceCritical, primaryBlockReason } = submission;
    const { sourceLabel } = sourceViewModel;
    const TitleIcon = titleIcon;
    const modalTitle = showDestinationGate
        ? t("modals.add_torrent.destination_prompt_title")
        : t("modals.add_torrent.title");
    const modalExSize = showDestinationGate ? "lg" : "5xl";
    const modalTitleContent = (
        <>
            <span className={`${TEXT_ROLE_EXTENDED.modalTitle} truncate`}>
                {modalTitle}
            </span>
            {sourceLabel ? (
                <span
                    className={
                        showDestinationGate
                            ? MODAL.workflow.sourceLabelCaption
                            : MODAL.workflow.sourceMutedLabel
                    }
                >
                    {sourceLabel}
                </span>
            ) : null}
        </>
    );
    const primaryActionLabel =
        commitMode === "paused"
            ? t("modals.add_torrent.add_paused")
            : t("modals.add_torrent.add_and_start");
    const isActionLocked = isSubmitting || submitLocked;

    return (
        <ModalEx
            open={isOpen}
            onClose={handleModalCancel}
            title={modalTitleContent}
            icon={TitleIcon}
            size={modalExSize}
            maximize={!showDestinationGate}
            disableClose={isActionLocked}
            bodyVariant={showDestinationGate ? "padded" : "flush"}
            secondaryAction={
                showDestinationGate
                    ? undefined
                    : {
                          label: t("modals.cancel"),
                          onPress: handleModalCancel,
                          disabled: isActionLocked,
                      }
            }
            primaryAction={
                showDestinationGate
                    ? undefined
                    : {
                          label: primaryActionLabel,
                          onPress: requestSubmit,
                          loading: isActionLocked,
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
                        {shouldShowSubmittingOverlay ? (
                            <div className={MODAL.workflow.submitOverlay}>
                                {!shouldShowCloseConfirm ? (
                                    <>
                                        <Spinner color="primary" />
                                        <p className={TEXT_ROLE.codeCaption}>
                                            {t("modals.add_torrent.submitting")}
                                        </p>
                                        <p className={MODAL.workflow.submitHintMuted}>
                                            {t(
                                                "modals.add_torrent.submitting_close_hint",
                                            )}
                                        </p>
                                        <Button
                                            variant="flat"
                                            onPress={requestCloseConfirm}
                                        >
                                            {t("modals.add_torrent.close_overlay")}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <StatusIcon
                                            Icon={AlertTriangle}
                                            className={MODAL.workflow.warningTone}
                                        />
                                        <p className={MODAL.workflow.submitWarningTitleCaption}>
                                            {t(
                                                "modals.add_torrent.close_while_submitting_title",
                                            )}
                                        </p>
                                        <p className={MODAL.workflow.submitHintMuted}>
                                            {t(
                                                "modals.add_torrent.close_while_submitting_body",
                                            )}
                                        </p>
                                        <div className={MODAL.workflow.submitActions}>
                                            <Button
                                                variant="flat"
                                                onPress={cancelCloseConfirm}
                                            >
                                                {t("modals.add_torrent.keep_waiting")}
                                            </Button>
                                            <Button
                                                color="danger"
                                                variant="shadow"
                                                onPress={handleModalCancel}
                                            >
                                                {t("modals.add_torrent.close_anyway")}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : null}

                        <div className={MODAL.workflow.body}>
                            {dropActive ? (
                                <div className={MODAL.workflow.dropOverlay}>
                                    <div className={MODAL.workflow.dropOverlayChip}>
                                        <FolderOpen className={MODAL.workflow.iconLgPrimary} />
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
                            ) : null}

                            <LayoutGroup>
                                <motion.div
                                    className={MODAL.builder.bodyPanelsClass(true)}
                                    initial={false}
                                    animate={FULL_CONTENT_ANIMATION.visible}
                                    transition={FULL_CONTENT_ANIMATION.transition}
                                    style={{ pointerEvents: "auto" }}
                                >
                                    <PanelGroup
                                        direction="horizontal"
                                        className={MODAL.workflow.panelGroup}
                                    >
                                        <Panel
                                            ref={settingsPanelRef}
                                            defaultSize={SETTINGS_PANEL_DEFAULT}
                                            minSize={SETTINGS_PANEL_MIN}
                                            collapsible={canCollapseSettings}
                                            onCollapse={handleSettingsPanelCollapse}
                                            onExpand={handleSettingsPanelExpand}
                                            className={MODAL.builder.settingsPanelClass(
                                                isSettingsCollapsed,
                                            )}
                                        >
                                            <AddTorrentSettingsPanel />
                                        </Panel>
                                        <PanelResizeHandle
                                            onDragging={
                                                isSettingsCollapsed
                                                    ? undefined
                                                    : setIsPanelResizeActive
                                            }
                                            className={MODAL.builder.paneHandleClass()}
                                        >
                                            <div className={MODAL.workflow.resizeHandleBarWrap}>
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

                            <div className={MODAL.workflow.footerAlerts}>
                                {submitError ? (
                                    <AlertPanel
                                        severity="danger"
                                        className={MODAL.workflow.footerAlert}
                                    >
                                        <AlertTriangle className={MODAL.workflow.iconAlert} />
                                        <span className={MODAL.workflow.footerAlertText}>
                                            {submitError}
                                        </span>
                                    </AlertPanel>
                                ) : null}
                                {isDiskSpaceCritical ? (
                                    <AlertPanel
                                        severity="warning"
                                        className={MODAL.workflow.footerAlert}
                                    >
                                        <AlertTriangle className={MODAL.workflow.iconAlert} />
                                        <span className={MODAL.workflow.footerAlertText}>
                                            {t("modals.add_torrent.disk_full_paused")}
                                        </span>
                                    </AlertPanel>
                                ) : null}
                                {primaryBlockReason ? (
                                    <AlertPanel
                                        severity="info"
                                        className={MODAL.workflow.footerInfoAlert}
                                    >
                                        <AlertTriangle
                                            className={MODAL.workflow.iconAlertMuted}
                                        />
                                        <span className={MODAL.workflow.footerAlertText}>
                                            {primaryBlockReason}
                                        </span>
                                    </AlertPanel>
                                ) : null}
                            </div>
                        </div>
                    </form>
                )}
            </AddTorrentModalContextProvider>
        </ModalEx>
    );
}
