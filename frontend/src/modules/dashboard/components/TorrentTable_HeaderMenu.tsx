import React from "react";
import { AnimatePresence } from "framer-motion";
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    DropdownSection,
    Checkbox,
    cn,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { GLASS_MENU_SURFACE } from "@/shared/ui/layout/glass-surface";
import type { Column } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
type HeaderMenuItem = {
    column: Column<Torrent>;
    label: string;
    isPinned: boolean;
};
type HeaderMenuActionOptions = { keepOpen?: boolean };

export default function TorrentTable_HeaderMenu({
    headerMenuTriggerRect,
    onClose,
    headerMenuActiveColumn,
    headerMenuItems,
    headerMenuHideLabel,
    isHeaderMenuHideEnabled,
    autoFitAllColumns,
    handleHeaderMenuAction,
}: {
    headerMenuTriggerRect: DOMRect | null;
    onClose: () => void;
    headerMenuActiveColumn: Column<Torrent> | null;
    headerMenuItems: HeaderMenuItem[];
    headerMenuHideLabel: string;
    isHeaderMenuHideEnabled: boolean;
    autoFitAllColumns: () => void;
    handleHeaderMenuAction: (
        action: () => void,
        options?: HeaderMenuActionOptions
    ) => void;
}) {
    if (!headerMenuTriggerRect) return null;
    const { t } = useTranslation();
    return (
        <AnimatePresence>
            <Dropdown
                isOpen
                onClose={onClose}
                placement="bottom-start"
                shouldFlip
                closeOnSelect={false}
            >
                <DropdownTrigger>
                    <div
                        style={{
                            position: "fixed",
                            top: headerMenuTriggerRect.top,
                            left: headerMenuTriggerRect.left,
                            width: 0,
                            height: 0,
                        }}
                    />
                </DropdownTrigger>
                <DropdownMenu
                    variant="shadow"
                    classNames={{ list: "overflow-hidden" }}
                    className={cn(
                        GLASS_MENU_SURFACE,
                        "min-w-(--tt-menu-min-width)",
                        "overflow-hidden"
                    )}
                >
                    <DropdownItem
                        key="hide-column"
                        color="danger"
                        isDisabled={!isHeaderMenuHideEnabled}
                        className="px-panel py-tight text-scaled font-semibold"
                        onPress={() =>
                            handleHeaderMenuAction(() =>
                                headerMenuActiveColumn?.toggleVisibility(false)
                            )
                        }
                    >
                        {headerMenuHideLabel}
                    </DropdownItem>
                    <DropdownItem
                        key="fit-all-columns"
                        className="px-panel py-tight text-scaled font-semibold"
                        onPress={() =>
                            handleHeaderMenuAction(autoFitAllColumns)
                        }
                        showDivider
                    >
                        {t("table.actions.fit_all_columns")}
                    </DropdownItem>
                    <DropdownSection
                        key="columns-section"
                        title={t("table.column_picker_title")}
                    >
                        {headerMenuItems.map((item) => {
                            const isVisible = item.column.getIsVisible();
                            return (
                                <DropdownItem
                                    key={item.column.id}
                                    className={cn(
                                        "pl-stage text-scaled",
                                        item.isPinned &&
                                            "font-semibold text-foreground"
                                    )}
                                    closeOnSelect={false}
                                    onPress={() =>
                                        handleHeaderMenuAction(
                                            () =>
                                                item.column.toggleVisibility(
                                                    !isVisible
                                                ),
                                            { keepOpen: true }
                                        )
                                    }
                                    startContent={
                                        <Checkbox
                                            isSelected={isVisible}
                                            size="md"
                                            disableAnimation
                                            classNames={{ base: "mr-tight" }}
                                        />
                                    }
                                >
                                    {item.label}
                                </DropdownItem>
                            );
                        })}
                    </DropdownSection>
                </DropdownMenu>
            </Dropdown>
        </AnimatePresence>
    );
}
