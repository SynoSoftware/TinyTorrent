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
    FORM_CONTROL,
    SURFACE,
    CONTEXT_MENU,
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
                disableAnimation
            >
                <DropdownTrigger>
                    <div
                        style={CONTEXT_MENU.builder.anchorStyle({
                            top: headerMenuTriggerRect.top,
                            left: headerMenuTriggerRect.left,
                        })}
                    />
                </DropdownTrigger>
                <DropdownMenu
                    variant="shadow"
                    classNames={SURFACE.menu.listClassNames}
                    itemClasses={SURFACE.menu.itemClassNames}
                    className={cn(
                        SURFACE.menu.surface,
                        SURFACE.menu.minWidthSurface,
                    )}
                >
                    <DropdownItem
                        key="hide-column"
                        color="danger"
                        isDisabled={!isHeaderMenuHideEnabled}
                        className={SURFACE.menu.itemStrong}
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
                        className={SURFACE.menu.itemStrong}
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
                                        SURFACE.menu.itemNested,
                                        item.isPinned &&
                                            SURFACE.menu.itemPinned,
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
                                            classNames={
                                                FORM_CONTROL.checkboxMarginRightClassNames
                                            }
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
