import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
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

import { INTERACTION_CONFIG, INTERACTIVE_RECIPE } from "@/config/logic";
import {
    ADD_MAGNET_TEXTAREA_CLASSNAMES,
    MODAL_BASE_CLASSNAMES,
    MODAL_SURFACE_FOOTER,
    MODAL_SURFACE_HEADER,
    STICKY_HEADER,
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
            classNames={MODAL_BASE_CLASSNAMES}
        >
            <ModalContent>
                {() => (
                    <>
                        <div
                            className={cn(
                                MODAL_SURFACE_HEADER,
                                STICKY_HEADER,
                                "shrink-0 h-modal-header flex items-center justify-between px-stage py-panel",
                            )}
                        >
                            <div className="flex items-center gap-tools">
                                <StatusIcon
                                    Icon={Magnet}
                                    size="md"
                                    className="text-primary"
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
                                className={`text-foreground/40 hidden sm:flex ${INTERACTIVE_RECIPE.dismiss}`}
                            />
                        </div>

                        <ModalBody className="space-y-panel py-panel">
                            <Textarea
                                ref={textareaRef}
                                autoFocus
                                value={value}
                                onValueChange={setValue}
                                placeholder={t("modals.add_magnet.placeholder")}
                                variant="bordered"
                                classNames={ADD_MAGNET_TEXTAREA_CLASSNAMES}
                                onKeyDown={handleKeyDown}
                            />
                            <p className={`${TEXT_ROLE.bodyMuted} leading-relaxed`}>
                                {t("modals.add_magnet.hint")}
                            </p>
                        </ModalBody>
                        <ModalFooter
                            className={cn(
                                MODAL_SURFACE_FOOTER,
                                "px-stage py-panel flex items-center justify-end gap-tools",
                            )}
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
