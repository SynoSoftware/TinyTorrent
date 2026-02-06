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

import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { SetLocationInlineEditor } from "@/modules/dashboard/components/SetLocationInlineEditor";

export interface RecoveryModalViewModel {
    isOpen: boolean;
    busy: boolean;
    title: string;
    bodyText: string;
    statusText: string;
    locationLabel: string;
    inlineEditor: {
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
    showRecreate: boolean;
    onRecreate?: () => void;
    onClose: () => void;
    primaryAction: {
        label: string;
        onPress: () => void;
        isDisabled: boolean;
    };
}

const MODAL_CLASSES =
    "w-full max-w-modal-compact flex flex-col overflow-hidden";

export interface TorrentRecoveryModalProps {
    viewModel: RecoveryModalViewModel;
}

export default function TorrentRecoveryModal({ viewModel }: TorrentRecoveryModalProps) {
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
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, MODAL_CLASSES),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="flex items-center justify-between gap-tools px-panel py-panel border-b border-divider">
                            <div className="flex items-center gap-tools">
                                <div className="surface-layer-1 rounded-full p-tight">
                                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
                                </div>
                                <h2 className="text-scaled font-bold uppercase tracking-label text-foreground">
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
                                <p className="text-scaled font-semibold text-foreground">
                                    {viewModel.statusText}
                                </p>
                                <p className="text-label text-foreground/70">
                                    {viewModel.bodyText}
                                </p>
                            </div>
                            <div className="flex items-center gap-tools surface-layer-1 rounded-panel p-tight">
                                <HardDrive className="toolbar-icon-size-md text-foreground" />
                                <span
                                    className="font-mono text-label text-foreground truncate"
                                    title={viewModel.locationLabel}
                                >
                                    {viewModel.locationLabel}
                                </span>
                            </div>
                            {viewModel.inlineEditor.visible && (
                                <SetLocationInlineEditor
                                    value={viewModel.inlineEditor.value}
                                    error={viewModel.inlineEditor.error}
                                    isBusy={viewModel.inlineEditor.isBusy}
                                    caption={viewModel.inlineEditor.caption}
                                    statusMessage={viewModel.inlineEditor.statusMessage}
                                    disableCancel={viewModel.inlineEditor.disableCancel}
                                    onChange={viewModel.inlineEditor.onChange}
                                    onSubmit={viewModel.inlineEditor.onSubmit}
                                    onCancel={viewModel.inlineEditor.onCancel}
                                />
                            )}
                            {viewModel.showWaitingForDrive && (
                                <div className="text-label text-foreground/60">
                                    {t("recovery.status.waiting_for_drive")}
                                </div>
                            )}
                            {viewModel.recoveryOutcomeMessage && (
                                <div className="surface-layer-1 rounded-panel p-tight text-label text-foreground/70">
                                    {viewModel.recoveryOutcomeMessage}
                                </div>
                            )}
                        </ModalBody>

                        <ModalFooter className="flex items-center justify-between gap-tools px-panel py-panel border-t border-divider">
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
                                    {t("modals.cancel")}
                                </Button>
                                <Button
                                    variant="shadow"
                                    color="primary"
                                    size="lg"
                                    onPress={viewModel.primaryAction.onPress}
                                    isDisabled={viewModel.primaryAction.isDisabled}
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
