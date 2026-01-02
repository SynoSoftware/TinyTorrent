import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea, cn } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";

export interface AddMagnetModalProps {
    isOpen: boolean;
    initialMagnetLink?: string;
    isResolving: boolean;
    onCancel: () => void;
    onConfirm: (magnetLink: string) => void;
}

export function AddMagnetModal({
    isOpen,
    initialMagnetLink,
    isResolving,
    onCancel,
    onConfirm,
}: AddMagnetModalProps) {
    const { t } = useTranslation();
    const [value, setValue] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setValue(initialMagnetLink?.trim() ?? "");
    }, [initialMagnetLink, isOpen]);

    const trimmed = useMemo(() => value.trim(), [value]);
    const canConfirm = Boolean(trimmed) && !isResolving;

    const handleConfirm = useCallback(() => {
        if (!canConfirm) return;
        onConfirm(trimmed);
    }, [canConfirm, onConfirm, trimmed]);

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? onCancel() : null)}
            backdrop="blur"
            motionProps={INTERACTION_CONFIG.modalBloom}
            isDismissable={!isResolving}
            classNames={{
                base: cn(GLASS_MODAL_SURFACE, "max-w-modal-add w-full overflow-hidden flex flex-col"),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="px-stage py-panel border-b border-default flex flex-col gap-tight">
                            <div className="flex flex-col gap-tight">
                                <span className="text-label font-semibold tracking-label uppercase">
                                    {t("modals.add_magnet.title")}
                                </span>
                                <span className="text-scaled text-foreground/60">
                                    {t("modals.add_magnet.hint")}
                                </span>
                            </div>
                        </ModalHeader>
                        <ModalBody className="px-stage py-panel flex flex-col gap-tight">
                            <Textarea
                                variant="bordered"
                                value={value}
                                onValueChange={setValue}
                                minRows={4}
                                isDisabled={isResolving}
                                placeholder={t("modals.add_magnet.placeholder")}
                                classNames={{
                                    input: "font-mono text-scaled",
                                }}
                            />
                            {isResolving && (
                                <p className="text-scaled text-foreground/60">
                                    {t("modals.add_magnet.resolving")}
                                </p>
                            )}
                        </ModalBody>
                        <ModalFooter className="px-stage py-panel border-t border-default flex items-center justify-between gap-tools">
                            <Button
                                variant="light"
                                onPress={onCancel}
                                isDisabled={isResolving}
                            >
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleConfirm}
                                isDisabled={!canConfirm}
                                isLoading={isResolving}
                            >
                                {t("modals.add_magnet.confirm")}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

