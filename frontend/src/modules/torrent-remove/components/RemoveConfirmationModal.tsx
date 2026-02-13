import React, { useEffect, useMemo, useState } from "react";
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
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import type { DeleteConfirmationOutcome } from "@/modules/torrent-remove/types/deleteConfirmation";
import { useDeleteConfirmationContextOptional } from "@/modules/torrent-remove/context/DeleteConfirmationContext";
import {
    APP_MODAL_CLASS,
    STANDARD_SURFACE_CLASS,
    FORM_CONTROL_CLASS,
    FORM_UI_CLASS,
} from "@/shared/ui/layout/glass-surface";

interface RemoveConfirmationModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    onConfirm?: (
        deleteData: boolean,
    ) => Promise<DeleteConfirmationOutcome | TorrentCommandOutcome>;
    torrentCount?: number;
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
    const deleteConfirmation = useDeleteConfirmationContextOptional();
    const [deleteData, setDeleteData] = useState(defaultDeleteData);
    const [loading, setLoading] = useState(false);
    const confirmRef = React.useRef<HTMLButtonElement | null>(null);

    const resolvedIsOpen = isOpen ?? Boolean(deleteConfirmation?.pendingDelete);
    const resolvedTorrentCount =
        torrentCount ?? deleteConfirmation?.pendingDelete?.torrents.length ?? 0;
    const resolvedDefaultDeleteData =
        deleteConfirmation?.pendingDelete?.deleteData ?? defaultDeleteData;
    const resolvedOnClose = useMemo(
        () => onClose ?? deleteConfirmation?.clearPendingDelete ?? (() => {}),
        [deleteConfirmation?.clearPendingDelete, onClose],
    );
    const resolvedOnConfirm = useMemo(
        () =>
            onConfirm ??
            (async (nextDeleteData: boolean) => {
                if (!deleteConfirmation) {
                    return {
                        status: "failed",
                    } satisfies DeleteConfirmationOutcome;
                }
                return deleteConfirmation.confirmDelete(nextDeleteData);
            }),
        [deleteConfirmation, onConfirm],
    );

    const normalizeDeleteOutcome = (
        outcome: DeleteConfirmationOutcome | TorrentCommandOutcome,
    ): DeleteConfirmationOutcome => {
        if (outcome.status === "success") return { status: "success" };
        if (outcome.status === "canceled") return { status: "canceled" };
        if (outcome.status === "unsupported") return { status: "unsupported" };
        return { status: "failed" };
    };

    const isCloseEligibleOutcome = (outcome: DeleteConfirmationOutcome) =>
        outcome.status === "success" || outcome.status === "canceled";

    // Keep state deterministic when reopening
    useEffect(() => {
        if (resolvedIsOpen) setDeleteData(resolvedDefaultDeleteData);
    }, [resolvedDefaultDeleteData, resolvedIsOpen]);

    const handleConfirm = React.useCallback(async () => {
        if (loading) return;
        setLoading(true);
        let outcome: DeleteConfirmationOutcome = { status: "failed" };
        try {
            const commandOutcome = await resolvedOnConfirm(deleteData);
            outcome = normalizeDeleteOutcome(commandOutcome);
        } catch {
            outcome = { status: "failed" };
        } finally {
            setLoading(false);
        }
        if (isCloseEligibleOutcome(outcome)) {
            resolvedOnClose();
        }
    }, [deleteData, loading, resolvedOnClose, resolvedOnConfirm]);

    // Focus primary confirm when opened and wire keyboard shortcuts
    useEffect(() => {
        if (!resolvedIsOpen) return;
        const el = confirmRef.current;
        // focus the primary action for quick keyboard confirm
        if (el) {
            try {
                el.focus();
            } catch {
                // Ignore focus errors in transient modal mount states
            }
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                resolvedOnClose();
            } else if (e.key === "Enter") {
                e.preventDefault();
                void handleConfirm();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleConfirm, resolvedIsOpen, resolvedOnClose]);

    return (
        <Modal
            isOpen={resolvedIsOpen}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    resolvedOnClose();
                }
            }}
            backdrop="blur"
            classNames={STANDARD_SURFACE_CLASS.modal.compactClassNames}
        >
            <ModalContent>
                <ModalHeader className={APP_MODAL_CLASS.headerPassive}>
                    {t("remove_modal.title")}
                </ModalHeader>

                <ModalBody>
                    <div className={FORM_UI_CLASS.stackTools}>
                        <p>
                            {resolvedTorrentCount === 1
                                ? t("remove_modal.single_torrent_message")
                                : t("remove_modal.multiple_torrents_message", {
                                      count: resolvedTorrentCount,
                                  })}
                        </p>

                        <Checkbox
                            isSelected={deleteData}
                            onValueChange={setDeleteData}
                            classNames={FORM_CONTROL_CLASS.checkboxLabelBodySmallClassNames}
                        >
                            {t("remove_modal.delete_files_option")}
                        </Checkbox>
                    </div>
                </ModalBody>

                <ModalFooter className={APP_MODAL_CLASS.footerEnd}>
                    <Button
                        variant="light"
                        onPress={resolvedOnClose}
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



