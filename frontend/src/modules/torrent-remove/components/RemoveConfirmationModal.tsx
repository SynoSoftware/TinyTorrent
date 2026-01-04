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
    onConfirm: (deleteData: boolean) => void;
    torrentCount: number;
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

    // Keep state deterministic when reopening
    useEffect(() => {
        if (isOpen) setDeleteData(defaultDeleteData);
    }, [isOpen, defaultDeleteData]);

    const handleConfirm = () => {
        onConfirm(deleteData);
        onClose();
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
                    <Button variant="light" onPress={onClose}>
                        {t("remove_modal.cancel")}
                    </Button>

                    <Button
                        color={deleteData ? "danger" : "primary"}
                        variant={deleteData ? "solid" : "shadow"}
                        onPress={handleConfirm}
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
