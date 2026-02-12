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
import {
    CHECKBOX_MARGIN_RIGHT_CLASSNAMES,
    MENU_ITEM_CLASSNAMES,
    MENU_LIST_CLASSNAMES,
    MENU_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";
import type { TorrentTableHeaderMenuViewModel } from "@/modules/dashboard/types/torrentTableSurfaces";

export interface TorrentTableHeaderMenuProps {
    viewModel: TorrentTableHeaderMenuViewModel;
}

export default function TorrentTable_HeaderMenu({
    viewModel,
}: TorrentTableHeaderMenuProps) {
    const { t } = useTranslation();
    const {
        headerMenuTriggerRect,
        onClose,
        headerMenuActiveColumn,
        headerMenuItems,
        headerMenuHideLabel,
        isHeaderMenuHideEnabled,
        autoFitAllColumns,
        handleHeaderMenuAction,
    } = viewModel;
    if (!headerMenuTriggerRect) return null;
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
                    classNames={MENU_LIST_CLASSNAMES}
                    itemClasses={MENU_ITEM_CLASSNAMES}
                    className={cn(MENU_SURFACE_CLASS, "min-w-(--tt-menu-min-width)")}
                >
                    <DropdownItem
                        key="hide-column"
                        color="danger"
                        isDisabled={!isHeaderMenuHideEnabled}
                        className="font-semibold"
                        onPress={() =>
                            handleHeaderMenuAction(() =>
                                headerMenuActiveColumn?.toggleVisibility(false),
                            )
                        }
                    >
                        {headerMenuHideLabel}
                    </DropdownItem>
                    <DropdownItem
                        key="fit-all-columns"
                        className="font-semibold"
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
                                        "pl-stage",
                                        item.isPinned &&
                                            "font-semibold text-foreground",
                                    )}
                                    closeOnSelect={false}
                                    onPress={() =>
                                        handleHeaderMenuAction(
                                            () =>
                                                item.column.toggleVisibility(
                                                    !isVisible,
                                                ),
                                            { keepOpen: true },
                                        )
                                    }
                                    startContent={
                                        <Checkbox
                                            isSelected={isVisible}
                                            size="md"
                                            disableAnimation
                                            classNames={CHECKBOX_MARGIN_RIGHT_CLASSNAMES}
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
