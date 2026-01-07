import React from "react";
import type { Table } from "@tanstack/react-table";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalHeader,
    Checkbox,
    cn,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    GLASS_MODAL_SURFACE,
    PANEL_SHADOW,
} from "@/shared/ui/layout/glass-surface";
import {
    TORRENTTABLE_COLUMN_DEFS,
    type ColumnId,
} from "./TorrentTable_ColumnDefs";
import { INTERACTION_CONFIG } from "@/config/logic";

interface Props {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    table: Table<any>;
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
            classNames={{
                base: cn(
                    GLASS_MODAL_SURFACE,
                    "flex flex-col overflow-hidden",
                    PANEL_SHADOW
                ),
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader>
                            {t("table.column_picker_title")}
                        </ModalHeader>
                        <ModalBody>
                            {table.getAllLeafColumns().map((column: any) => {
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
                                                    ?.labelKey ?? id
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
