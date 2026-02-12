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
    FORM_CONTROL_CLASS,
    STANDARD_SURFACE_CLASS,
    buildContextMenuAnchorStyle,
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
                        style={buildContextMenuAnchorStyle({
                            top: headerMenuTriggerRect.top,
                            left: headerMenuTriggerRect.left,
                        })}
                    />
                </DropdownTrigger>
                <DropdownMenu
                    variant="shadow"
                    classNames={STANDARD_SURFACE_CLASS.menu.listClassNames}
                    itemClasses={STANDARD_SURFACE_CLASS.menu.itemClassNames}
                    className={cn(
                        STANDARD_SURFACE_CLASS.menu.surface,
                        STANDARD_SURFACE_CLASS.menu.minWidthSurface,
                    )}
                >
                    <DropdownItem
                        key="hide-column"
                        color="danger"
                        isDisabled={!isHeaderMenuHideEnabled}
                        className={STANDARD_SURFACE_CLASS.menu.itemStrong}
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
                        className={STANDARD_SURFACE_CLASS.menu.itemStrong}
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
                                        STANDARD_SURFACE_CLASS.menu.itemNested,
                                        item.isPinned &&
                                            STANDARD_SURFACE_CLASS.menu.itemPinned,
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
                                            classNames={FORM_CONTROL_CLASS.checkboxMarginRightClassNames}
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
