import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Checkbox,
} from "@heroui/react";

interface RemoveConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (deleteData: boolean) => Promise<void> | void;
    torrentCount: number;
    torrentIds?: string[];
    defaultDeleteData?: boolean;
}

export function RemoveConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    torrentCount,
    defaultDeleteData = false,
}: RemoveConfirmationModalProps) {
    const { t } = useTranslation();
    const [deleteData, setDeleteData] = useState(defaultDeleteData);
    const [loading, setLoading] = useState(false);
    const confirmRef = React.useRef<HTMLButtonElement | null>(null);

    // Keep state deterministic when reopening
    useEffect(() => {
        if (isOpen) setDeleteData(defaultDeleteData);
    }, [isOpen, defaultDeleteData]);

    // Focus primary confirm when opened and wire keyboard shortcuts
    useEffect(() => {
        if (!isOpen) return;
        const el = confirmRef.current;
        // focus the primary action for quick keyboard confirm
        if (el) {
            try {
                el.focus();
            } catch {}
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "Enter") {
                e.preventDefault();
                void handleConfirm();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen]);

    const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        try {
            await onConfirm(deleteData);
        } catch (err) {
            console.error("RemoveConfirmationModal onConfirm failed:", err);
        } finally {
            setLoading(false);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <ModalContent>
                <ModalHeader className="select-none">
                    {t("remove_modal.title")}
                </ModalHeader>

                <ModalBody className="flex flex-col gap-4">
                    <p>
                        {torrentCount === 1
                            ? t("remove_modal.single_torrent_message")
                            : t("remove_modal.multiple_torrents_message", {
                                  count: torrentCount,
                              })}
                    </p>

                    <Checkbox
                        isSelected={deleteData}
                        onValueChange={setDeleteData}
                    >
                        {t("remove_modal.delete_files_option")}
                    </Checkbox>
                </ModalBody>

                <ModalFooter className="flex justify-end gap-2">
                    <Button
                        variant="light"
                        onPress={onClose}
                        disabled={loading}
                    >
                        {t("remove_modal.cancel")}
                    </Button>

                    <Button
                        ref={confirmRef}
                        color={deleteData ? "danger" : "primary"}
                        variant={deleteData ? "solid" : "shadow"}
                        onPress={handleConfirm}
                        disabled={loading}
                    >
                        {deleteData
                            ? t("remove_modal.confirm_delete_files")
                            : t("remove_modal.confirm_remove")}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

export default RemoveConfirmationModal;
