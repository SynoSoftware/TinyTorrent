import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HardDrive, X } from "lucide-react";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";

import { INTERACTION_CONFIG } from "@/config/logic";
import { MODAL } from "@/shared/ui/layout/glass-surface";
import { SetLocationEditor } from "@/modules/dashboard/components/SetLocationEditor";

export interface RecoveryModalViewModel {
    isOpen: boolean;
    busy: boolean;
    title: string;
    bodyText: string;
    statusText: string;
    locationLabel: string;
    locationEditor: {
        visible: boolean;
        value: string;
        error?: string;
        caption: string;
        statusMessage?: string;
        isBusy: boolean;
        onChange: (value: string) => void;
        onSubmit: () => void;
        onCancel: () => void;
        disableCancel: boolean;
    };
    showWaitingForDrive: boolean;
    recoveryOutcomeMessage: string | null;
    inbox: {
        visible: boolean;
        title: string;
        subtitle: string;
        items: Array<{
            id: string;
            label: string;
            description: string;
        }>;
        moreCount: number;
    };
    onClose: () => void;
    cancelLabel: string;
    primaryAction: {
        label: string;
        onPress: () => void;
        isDisabled: boolean;
    };
}

export interface TorrentRecoveryModalProps {
    viewModel: RecoveryModalViewModel;
}

export default function TorrentRecoveryModal({
    viewModel,
}: TorrentRecoveryModalProps) {
    const { t } = useTranslation();
    const isLocationEditorMode = viewModel.locationEditor.visible;
    const locationEditorValue = viewModel.locationEditor.value.trim();
    const cancelAction = viewModel.onClose;
    const cancelLabel = isLocationEditorMode
        ? t("modals.cancel")
        : viewModel.cancelLabel;
    const cancelDisabled = isLocationEditorMode
        ? viewModel.locationEditor.disableCancel || viewModel.busy
        : viewModel.busy;
    const primaryAction = isLocationEditorMode
        ? viewModel.locationEditor.onSubmit
        : viewModel.primaryAction.onPress;
    const primaryLabel = isLocationEditorMode
        ? t("recovery.action.change_location")
        : viewModel.primaryAction.label;
    const primaryDisabled = isLocationEditorMode
        ? viewModel.locationEditor.isBusy || !locationEditorValue
        : viewModel.primaryAction.isDisabled;

    return (
        <Modal
            isOpen={viewModel.isOpen}
            onOpenChange={(open) => {
                if (!open) viewModel.onClose();
            }}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            isDismissable={!viewModel.busy}
            classNames={MODAL.compactClassNames}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className={MODAL.dialogHeader}>
                            <div className={MODAL.dialogHeaderLead}>
                                <div className={MODAL.dialogHeaderIconWrap}>
                                    <AlertTriangle
                                        className={
                                            MODAL.dialogHeaderWarningIcon
                                        }
                                    />
                                </div>
                                <h2 className={TEXT_ROLE_EXTENDED.modalTitle}>
                                    {viewModel.title}
                                </h2>
                            </div>
                            <Button
                                variant="ghost"
                                color="default"
                                size="md"
                                onPress={viewModel.onClose}
                                isDisabled={viewModel.busy}
                            >
                                <X />
                            </Button>
                        </ModalHeader>

                        <ModalBody className={MODAL.dialogBody}>
                            <div className={MODAL.dialogSectionStack}>
                                <p className={TEXT_ROLE.bodyStrong}>
                                    {viewModel.statusText}
                                </p>
                                <p className={TEXT_ROLE.bodySmall}>
                                    {viewModel.bodyText}
                                </p>
                            </div>
                            {!viewModel.locationEditor.visible && (
                                <div className={MODAL.dialogLocationRow}>
                                    <HardDrive
                                        className={MODAL.dialogLocationIcon}
                                    />
                                    <span
                                        className={MODAL.dialogLocationLabel}
                                        title={viewModel.locationLabel}
                                    >
                                        {viewModel.locationLabel}
                                    </span>
                                </div>
                            )}
                            {viewModel.locationEditor.visible && (
                                <SetLocationEditor
                                    value={viewModel.locationEditor.value}
                                    error={viewModel.locationEditor.error}
                                    isBusy={viewModel.locationEditor.isBusy}
                                    caption={viewModel.locationEditor.caption}
                                    statusMessage={
                                        viewModel.locationEditor.statusMessage
                                    }
                                    disableCancel={
                                        viewModel.locationEditor.disableCancel
                                    }
                                    showActions={false}
                                    onChange={viewModel.locationEditor.onChange}
                                    onSubmit={viewModel.locationEditor.onSubmit}
                                    onCancel={viewModel.locationEditor.onCancel}
                                />
                            )}
                            {viewModel.showWaitingForDrive && (
                                <div className={TEXT_ROLE.caption}>
                                    {t("recovery.status.waiting_for_drive")}
                                </div>
                            )}
                            {viewModel.recoveryOutcomeMessage && (
                                <div className={MODAL.dialogOutcomePanel}>
                                    {viewModel.recoveryOutcomeMessage}
                                </div>
                            )}
                            {viewModel.inbox.visible && (
                                <div className={MODAL.dialogInsetPanel}>
                                    <div className={MODAL.dialogInsetStack}>
                                        <p className={MODAL.dialogInsetTitle}>
                                            {viewModel.inbox.title}
                                        </p>
                                        <p className={TEXT_ROLE.bodySmall}>
                                            {viewModel.inbox.subtitle}
                                        </p>
                                        <div className={MODAL.dialogInsetStack}>
                                            {viewModel.inbox.items.map(
                                                (item) => (
                                                    <div
                                                        key={item.id}
                                                        className={
                                                            MODAL.dialogInsetItem
                                                        }
                                                    >
                                                        <p
                                                            className={
                                                                MODAL.dialogInsetLabel
                                                            }
                                                        >
                                                            {item.label}
                                                        </p>
                                                        <p
                                                            className={
                                                                MODAL.dialogInsetDescription
                                                            }
                                                        >
                                                            {item.description}
                                                        </p>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                        {viewModel.inbox.moreCount > 0 && (
                                            <p className={TEXT_ROLE.caption}>
                                                {t("recovery.inbox.more", {
                                                    count: viewModel.inbox
                                                        .moreCount,
                                                })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </ModalBody>

                        <ModalFooter className={MODAL.dialogFooter}>
                            <div className={MODAL.dialogFooterGroup}>
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={cancelAction}
                                    isDisabled={cancelDisabled}
                                    className={MODAL.dialogSecondaryAction}
                                >
                                    {cancelLabel}
                                </Button>
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="lg"
                                    onPress={primaryAction}
                                    isDisabled={primaryDisabled}
                                    className={MODAL.dialogPrimaryAction}
                                >
                                    {primaryLabel}
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
