import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    Textarea,
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
import {
    APP_MODAL_CLASS,
    FORM_UI_CLASS,
    INPUT_SURFACE_CLASS,
    MODAL_SURFACE_CLASS,
    SURFACE_CHROME_CLASS,
} from "@/shared/ui/layout/glass-surface";
import { TEXT_ROLE } from "@/config/textRoles";
import { StatusIcon } from "@/shared/ui/components/StatusIcon";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";

export interface AddMagnetModalProps {
    isOpen: boolean;
    initialValue?: string;
    onClose: () => void;
    onSubmit: (link: string) => Promise<AddTorrentCommandOutcome>;
}

// TODO: Keep AddMagnetModal as a pure view:
// TODO: - No RPC calls and no ShellExtensions calls here.
// TODO: - Magnet normalization/validation belongs to a dedicated utility/service (already exists in orchestrator flow) and should not be duplicated in the modal.
// TODO: - Deep-link ingestion (ShellAgent “magnet-link” event) must be centralized in one place (ShellAgent adapter/provider), not in the modal.
// TODO: This ensures the same Add Magnet UX works in Browser (Rpc mode) and WebView host (Full mode) without leaking host assumptions.

export function AddMagnetModal({
    isOpen,
    initialValue,
    onClose,
    onSubmit,
}: AddMagnetModalProps) {
    const { t } = useTranslation();
    const [value, setValue] = useState(initialValue ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setValue(initialValue ?? "");
        setIsSubmitting(false);
        textareaRef.current?.focus();
    }, [initialValue, isOpen]);

    const handleClose = useCallback(() => {
        setValue("");
        onClose();
    }, [onClose]);

    const handleConfirm = useCallback(async () => {
        if (isSubmitting) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        setIsSubmitting(true);
        try {
            const outcome = await onSubmit(trimmed);
            if (outcome.status === "added") {
                handleClose();
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [value, onSubmit, handleClose, isSubmitting]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleConfirm();
            }
        },
        [handleConfirm],
    );

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => (!open ? handleClose() : undefined)}
            backdrop="blur"
            placement="center"
            motionProps={INTERACTION_CONFIG.modalBloom}
            hideCloseButton
            classNames={MODAL_SURFACE_CLASS.baseClassNames}
        >
            <ModalContent>
                {() => (
                    <>
                        <div
                            className={APP_MODAL_CLASS.header}
                        >
                            <div className={APP_MODAL_CLASS.headerLead}>
                                <StatusIcon
                                    Icon={Magnet}
                                    size="md"
                                    className={APP_MODAL_CLASS.headerLeadPrimaryIcon}
                                />
                                <span className={TEXT_ROLE.labelPrimary}>
                                    {t("modals.add_magnet.title")}
                                </span>
                            </div>

                            <ToolbarIconButton
                                Icon={X}
                                ariaLabel={t("torrent_modal.actions.close")}
                                onPress={handleClose}
                                iconSize="lg"
                                className={APP_MODAL_CLASS.desktopClose}
                            />
                        </div>

                        <ModalBody className={FORM_UI_CLASS.bodyStackPanel}>
                            <Textarea
                                ref={textareaRef}
                                autoFocus
                                value={value}
                                onValueChange={setValue}
                                placeholder={t("modals.add_magnet.placeholder")}
                                variant="bordered"
                                classNames={INPUT_SURFACE_CLASS.codeTextareaClassNames}
                                onKeyDown={handleKeyDown}
                            />
                            <p className={`${TEXT_ROLE.bodyMuted} leading-relaxed`}>
                                {t("modals.add_magnet.hint")}
                            </p>
                        </ModalBody>
                        <ModalFooter
                            className={SURFACE_CHROME_CLASS.footerActionsPadded}
                        >
                            <Button variant="light" onPress={handleClose}>
                                {t("modals.cancel")}
                            </Button>
                            <Button
                                color="primary"
                                variant="shadow"
                                onPress={handleConfirm}
                                isLoading={isSubmitting}
                                isDisabled={isSubmitting || !value.trim()}
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
