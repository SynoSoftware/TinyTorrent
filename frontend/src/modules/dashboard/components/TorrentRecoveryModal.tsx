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
import {
    APP_MODAL_CLASS,
    STANDARD_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";
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
    showRecreate: boolean;
    onRecreate?: () => void;
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
            classNames={STANDARD_SURFACE_CLASS.modal.compactClassNames}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader
                            className={APP_MODAL_CLASS.dialogHeader}
                        >
                            <div className={APP_MODAL_CLASS.dialogHeaderLead}>
                                <div className={APP_MODAL_CLASS.dialogHeaderIconWrap}>
                                    <AlertTriangle className={APP_MODAL_CLASS.dialogHeaderWarningIcon} />
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

                        <ModalBody className={APP_MODAL_CLASS.dialogBody}>
                            <div className={APP_MODAL_CLASS.dialogSectionStack}>
                                <p className={TEXT_ROLE.bodyStrong}>
                                    {viewModel.statusText}
                                </p>
                                <p className={TEXT_ROLE.bodySmall}>
                                    {viewModel.bodyText}
                                </p>
                            </div>
                            <div className={APP_MODAL_CLASS.dialogLocationRow}>
                                <HardDrive className={APP_MODAL_CLASS.dialogLocationIcon} />
                                <span
                                    className={APP_MODAL_CLASS.dialogLocationLabel}
                                    title={viewModel.locationLabel}
                                >
                                    {viewModel.locationLabel}
                                </span>
                            </div>
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
                                <div
                                    className={APP_MODAL_CLASS.dialogOutcomePanel}
                                >
                                    {viewModel.recoveryOutcomeMessage}
                                </div>
                            )}
                            {viewModel.inbox.visible && (
                                <div className={STANDARD_SURFACE_CLASS.atom.insetRounded}>
                                    <div className={APP_MODAL_CLASS.dialogInsetStack}>
                                        <p className={APP_MODAL_CLASS.dialogInsetTitle}>
                                            {viewModel.inbox.title}
                                        </p>
                                        <p className={TEXT_ROLE.bodySmall}>
                                            {viewModel.inbox.subtitle}
                                        </p>
                                        <div className={APP_MODAL_CLASS.dialogInsetStack}>
                                            {viewModel.inbox.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className={STANDARD_SURFACE_CLASS.atom.insetBorderedItem}
                                                >
                                                    <p className={APP_MODAL_CLASS.dialogInsetLabel}>
                                                        {item.label}
                                                    </p>
                                                    <p className={APP_MODAL_CLASS.dialogInsetDescription}>
                                                        {item.description}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        {viewModel.inbox.moreCount > 0 && (
                                            <p className={TEXT_ROLE.caption}>
                                                {t("recovery.inbox.more", {
                                                    count: viewModel.inbox.moreCount,
                                                })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </ModalBody>

                        <ModalFooter
                            className={APP_MODAL_CLASS.dialogFooter}
                        >
                            <div className={APP_MODAL_CLASS.dialogFooterGroup}>
                                {viewModel.showRecreate && (
                                    <Button
                                        variant="light"
                                        size="md"
                                        onPress={viewModel.onRecreate}
                                        isDisabled={viewModel.busy}
                                        className={APP_MODAL_CLASS.dialogSecondaryAction}
                                    >
                                        {t("recovery.action_recreate")}
                                    </Button>
                                )}
                            </div>
                            <div className={APP_MODAL_CLASS.dialogFooterGroup}>
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={viewModel.onClose}
                                    isDisabled={viewModel.busy}
                                    className={APP_MODAL_CLASS.dialogSecondaryAction}
                                >
                                    {viewModel.cancelLabel}
                                </Button>
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="lg"
                                    onPress={viewModel.primaryAction.onPress}
                                    isDisabled={
                                        viewModel.primaryAction.isDisabled
                                    }
                                    className={APP_MODAL_CLASS.dialogPrimaryAction}
                                >
                                    {viewModel.primaryAction.label}
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

