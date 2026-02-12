import React from "react";
import type { Table } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
    Checkbox,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    MODAL_BASE_CLASSNAMES,
} from "@/shared/ui/layout/glass-surface";
import {
    TORRENTTABLE_COLUMN_DEFS,
    type ColumnId,
} from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import { INTERACTION_CONFIG } from "@/config/logic";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    table: Table<Torrent>;
}

export const TorrentTable_ColumnSettingsModal: React.FC<Props> = ({
    isOpen,
    onOpenChange,
    table,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            size="lg"
            backdrop="blur"
            motionProps={INTERACTION_CONFIG.modalBloom}
            classNames={MODAL_BASE_CLASSNAMES}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader>
                            {t("table.column_picker_title")}
                        </ModalHeader>
                        <ModalBody>
                            {table.getAllLeafColumns().map((column) => {
                                const rawId = column.id;
                                if (rawId === "selection") return null;
                                const id = rawId as ColumnId;
                                return (
                                    <div
                                        key={column.id}
                                        className="flex justify-between p-tight"
                                    >
                                        <span>
                                            {t(
                                                TORRENTTABLE_COLUMN_DEFS[id]
                                                    ?.labelKey ?? id,
                                            )}
                                        </span>
                                        <Checkbox
                                            isSelected={column.getIsVisible()}
                                            onValueChange={(val) =>
                                                column.toggleVisibility(!!val)
                                            }
                                        />
                                    </div>
                                );
                            })}
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};

export default TorrentTable_ColumnSettingsModal;
