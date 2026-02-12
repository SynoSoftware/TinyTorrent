import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    cn,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HardDrive, X } from "lucide-react";
import { TEXT_ROLE, TEXT_ROLE_EXTENDED } from "@/config/textRoles";

import { INTERACTION_CONFIG } from "@/config/logic";
import {
    INSET_BORDERED_ITEM_SURFACE,
    INSET_ROUNDED_FULL_SURFACE,
    INSET_ROUNDED_SURFACE,
    MODAL_COMPACT_CLASSNAMES,
    MODAL_SURFACE_FOOTER,
    MODAL_SURFACE_HEADER,
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
            classNames={MODAL_COMPACT_CLASSNAMES}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader
                            className={cn(
                                MODAL_SURFACE_HEADER,
                                "flex items-center justify-between gap-tools px-panel py-panel",
                            )}
                        >
                            <div className="flex items-center gap-tools">
                                <div className={INSET_ROUNDED_FULL_SURFACE}>
                                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
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

                        <ModalBody className="flex flex-col gap-stage p-panel">
                            <div className="flex flex-col gap-tight">
                                <p className={TEXT_ROLE.bodyStrong}>
                                    {viewModel.statusText}
                                </p>
                                <p className={TEXT_ROLE.bodySmall}>
                                    {viewModel.bodyText}
                                </p>
                            </div>
                            <div className={cn("flex items-center gap-tools", INSET_ROUNDED_SURFACE)}>
                                <HardDrive className="toolbar-icon-size-md text-foreground" />
                                <span
                                    className={cn(TEXT_ROLE.code, "truncate")}
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
                                    className={cn(
                                        INSET_ROUNDED_SURFACE,
                                        TEXT_ROLE.bodySmall,
                                    )}
                                >
                                    {viewModel.recoveryOutcomeMessage}
                                </div>
                            )}
                            {viewModel.inbox.visible && (
                                <div className={INSET_ROUNDED_SURFACE}>
                                    <div className="flex flex-col gap-tight">
                                        <p className={cn(TEXT_ROLE.bodySmall, "font-semibold text-foreground")}>
                                            {viewModel.inbox.title}
                                        </p>
                                        <p className={TEXT_ROLE.bodySmall}>
                                            {viewModel.inbox.subtitle}
                                        </p>
                                        <div className="flex flex-col gap-tight">
                                            {viewModel.inbox.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className={INSET_BORDERED_ITEM_SURFACE}
                                                >
                                                    <p className={cn(TEXT_ROLE.bodySmall, "font-medium text-foreground truncate")}>
                                                        {item.label}
                                                    </p>
                                                    <p className={cn(TEXT_ROLE.bodySmall, "truncate")}>
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
                            className={cn(
                                MODAL_SURFACE_FOOTER,
                                "flex items-center justify-between gap-tools px-panel py-panel",
                            )}
                        >
                            <div className="flex items-center gap-tools">
                                {viewModel.showRecreate && (
                                    <Button
                                        variant="light"
                                        size="md"
                                        onPress={viewModel.onRecreate}
                                        isDisabled={viewModel.busy}
                                        className="font-medium text-foreground"
                                    >
                                        {t("recovery.action_recreate")}
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-tools">
                                <Button
                                    variant="light"
                                    size="md"
                                    onPress={viewModel.onClose}
                                    isDisabled={viewModel.busy}
                                    className="font-medium text-foreground"
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
                                    className="font-bold"
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

