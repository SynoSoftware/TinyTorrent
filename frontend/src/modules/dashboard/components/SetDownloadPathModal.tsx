import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import { getSurfaceCaptionKey } from "@/app/utils/setLocation";
import { SetLocationEditor } from "@/modules/dashboard/components/SetLocationEditor";
import { MODAL } from "@/shared/ui/layout/glass-surface";

export default function SetDownloadPathModal() {
    const { t } = useTranslation();
    const {
        setLocationState: downloadPathState,
        cancelSetLocation: cancelDownloadPath,
        confirmSetLocation: confirmDownloadPath,
        handleLocationChange: handleDownloadPathChange,
    } = useRecoveryContext();
    const modalContentRef = useRef<HTMLDivElement | null>(null);

    const isOwnedByRecoveryModal = downloadPathState?.surface === "recovery-modal";
    const isOpen = Boolean(downloadPathState && !isOwnedByRecoveryModal);

    const handleSubmit = useCallback(() => {
        void confirmDownloadPath();
    }, [confirmDownloadPath]);

    const handleCancel = useCallback(() => {
        cancelDownloadPath();
    }, [cancelDownloadPath]);

    const isBusy = downloadPathState?.status !== "idle";
    const isVerifying = downloadPathState?.status === "verifying";
    const inputPath = downloadPathState?.inputPath ?? "";

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (!isBusy) {
                    handleCancel();
                }
                return;
            }
            if (event.key !== "Enter") {
                return;
            }
            const target = event.target as HTMLElement | null;
            if (!target || !modalContentRef.current?.contains(target)) {
                return;
            }
            const isTextarea = target?.tagName === "TEXTAREA";
            const isContentEditable = Boolean(target?.isContentEditable);
            if (isTextarea || isContentEditable) {
                return;
            }
            if (isBusy || !inputPath.trim()) {
                return;
            }
            event.preventDefault();
            handleSubmit();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleCancel, handleSubmit, inputPath, isBusy, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = window.requestAnimationFrame(() => {
            const input = modalContentRef.current?.querySelector("input");
            if (!input) return;
            input.focus();
            input.select();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    if (!downloadPathState || isOwnedByRecoveryModal) {
        return null;
    }

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    handleCancel();
                }
            }}
            backdrop="blur"
            classNames={MODAL.compactClassNames}
            isDismissable={!isBusy}
            hideCloseButton
        >
            <ModalContent>
                <div ref={modalContentRef}>
                    <ModalHeader className={MODAL.dialogHeader}>
                        {t("table.actions.set_download_path")}
                    </ModalHeader>
                    <ModalBody className={MODAL.dialogBody}>
                        <SetLocationEditor
                            value={inputPath}
                            error={downloadPathState.error}
                            isBusy={isBusy}
                            caption={t(getSurfaceCaptionKey(downloadPathState.surface))}
                            statusMessage={isVerifying ? t("recovery.status.applying_location") : undefined}
                            disableCancel={isBusy}
                            showActions={false}
                            onChange={handleDownloadPathChange}
                            onSubmit={handleSubmit}
                            onCancel={handleCancel}
                        />
                    </ModalBody>
                    <ModalFooter className={`${MODAL.dialogFooter} justify-end`}>
                        <Button variant="light" onPress={handleCancel} isDisabled={isBusy}>
                            {t("modals.cancel")}
                        </Button>
                        <Button
                            variant="shadow"
                            color="primary"
                            onPress={handleSubmit}
                            isDisabled={isBusy || !inputPath.trim()}
                        >
                            {t("recovery.action.change_location")}
                        </Button>
                    </ModalFooter>
                </div>
            </ModalContent>
        </Modal>
    );
}
