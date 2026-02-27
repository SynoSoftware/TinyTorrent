import {
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
import { Magnet, type LucideIcon } from "lucide-react";

import { MODAL, FORM, INPUT } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
import type { AddTorrentCommandOutcome } from "@/app/orchestrators/useAddTorrentController";

export interface AddMagnetModalProps {
    isOpen: boolean;
    titleIcon?: LucideIcon;
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
    titleIcon = Magnet,
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
            if (outcome.status === "added" || outcome.status === "queued") {
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
        <ModalEx
            open={isOpen}
            onClose={handleClose}
            title={t("modals.add_magnet.title")}
            icon={titleIcon}
            secondaryAction={{
                label: t("modals.cancel"),
                onPress: handleClose,
                disabled: isSubmitting,
            }}
            primaryAction={{
                label: t("modals.add_magnet.confirm"),
                onPress: () => {
                    void handleConfirm();
                },
                loading: isSubmitting,
                disabled: isSubmitting || !value.trim(),
            }}
        >
            <div className={FORM.bodyStackPanel}>
                <Textarea
                    ref={textareaRef}
                    autoFocus
                    value={value}
                    onValueChange={setValue}
                    placeholder={t("modals.add_magnet.placeholder")}
                    variant="bordered"
                    classNames={INPUT.codeTextareaClassNames}
                    onKeyDown={handleKeyDown}
                />
                <p className={MODAL.hintText}>
                    {t("modals.add_magnet.hint")}
                </p>
            </div>
        </ModalEx>
    );
}
