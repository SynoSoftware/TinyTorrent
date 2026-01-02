import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Textarea,
    cn,
} from "@heroui/react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Magnet, X } from "lucide-react";

import { INTERACTION_CONFIG } from "@/config/logic";
import { GLASS_MODAL_SURFACE } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";

interface AddMagnetModalProps {
    isOpen: boolean;
    initialValue?: string;
    onClose: () => void;
    onSubmit: (link: string) => void;
}

export function AddMagnetModal({
    isOpen,
    initialValue,
    onClose,
    onSubmit,
}: AddMagnetModalProps) {
    const { t } = useTranslation();
    const [value, setValue] = useState(initialValue ?? "");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setValue(initialValue ?? "");
        textareaRef.current?.focus();
    }, [initialValue, isOpen]);

    const handleClose = useCallback(() => {
        setValue("");
        onClose();
    }, [onClose]);

    const handleConfirm = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        handleClose();
    }, [value, onSubmit, handleClose]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleConfirm();
            }
        },
        [handleConfirm]
    );

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? handleClose() : undefined)}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            classNames={{
                base: cn(GLASS_MODAL_SURFACE),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="border-b border-default/20 px-stage py-panel">
                            <div className="flex items-center justify-between gap-tools">
                                <div className="flex items-center gap-tools">
                                    <Magnet className="text-primary" />
                                    <span className="text-label tracking-label uppercase font-semibold">
                                        {t("modals.add_magnet.title")}
                                    </span>
                                </div>
                                <ToolbarIconButton
                                    Icon={X}
                                    ariaLabel={t("torrent_modal.actions.close")}
                                    onPress={handleClose}
                                    iconSize="lg"
                                    className="text-foreground/40 hover:text-foreground hidden sm:flex"
                                />
                            </div>
                        </ModalHeader>
                        <ModalBody className="space-y-panel py-panel">
                            <Textarea
                                ref={textareaRef}
                                autoFocus
                                value={value}
                                onValueChange={setValue}
                                placeholder={t("modals.add_magnet.placeholder")}
                                variant="bordered"
                                classNames={{
                                    input: "font-mono text-scaled",
                                }}
                                onKeyDown={handleKeyDown}
                            />
                            <p className="text-foreground/70 text-scaled leading-relaxed">
                                {t("modals.add_magnet.hint")}
                            </p>
                        </ModalBody>
                        <ModalFooter className="border-t border-default/20 px-stage py-panel flex items-center justify-end gap-tools">
                            <Button variant="light" onPress={handleClose}>
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleConfirm}
                                isDisabled={!value.trim()}
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
