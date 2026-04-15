import React from "react";
import { AnimatePresence } from "framer-motion";
import {
    Checkbox,
    DropdownItem,
    DropdownMenu,
    cn,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    formControl,
    surface,
} from "@/shared/ui/layout/glass-surface";
import TorrentTable_ContextMenuSurface from "@/modules/dashboard/components/TorrentTable_ContextMenuSurface";
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
    const handleCheckboxToggle = (
        event: React.MouseEvent | React.PointerEvent,
        toggle: () => void,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
    };
    return (
        <AnimatePresence>
            <TorrentTable_ContextMenuSurface
                anchorRect={headerMenuTriggerRect}
                className={cn(
                    surface.menu.surface,
                    surface.menu.minWidthSurface,
                )}
                onClose={onClose}
            >
                <DropdownMenu autoFocus="first">
                    <DropdownItem
                        key="hide-column"
                        textValue={headerMenuHideLabel}
                        isDisabled={!isHeaderMenuHideEnabled}
                        className={surface.menu.itemStrong}
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
                        textValue={t("table.actions.fit_all_columns")}
                        className={surface.menu.itemStrong}
                        onPress={() =>
                            handleHeaderMenuAction(autoFitAllColumns)
                        }
                    >
                        {t("table.actions.fit_all_columns")}
                    </DropdownItem>
                    <DropdownItem
                        key="columns-heading"
                        isDisabled
                        className={surface.menu.sectionHeading}
                        textValue={t("table.column_picker_title")}
                    >
                        {t("table.column_picker_title")}
                    </DropdownItem>
                    {headerMenuItems.map((item) => {
                        const isVisible = item.column.getIsVisible();
                        const toggleColumnVisibility = () =>
                            handleHeaderMenuAction(
                                () =>
                                    item.column.toggleVisibility(
                                        !isVisible,
                                    ),
                                { keepOpen: true },
                            );
                        return (
                            <DropdownItem
                                key={item.column.id}
                                textValue={item.label}
                                className={cn(
                                    surface.menu.itemNested,
                                    item.isPinned &&
                                        surface.menu.itemPinned,
                                )}
                                onPress={toggleColumnVisibility}
                            >
                                <div className="flex items-center gap-tools">
                                    <span
                                        onClick={(event) =>
                                            handleCheckboxToggle(
                                                event,
                                                toggleColumnVisibility,
                                            )
                                        }
                                        onPointerDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                        }}
                                    >
                                        <Checkbox
                                            isSelected={isVisible}
                                            onChange={() =>
                                                toggleColumnVisibility()
                                            }
                                            className={
                                                formControl.checkboxMarginRightClassNames.base
                                            }
                                        />
                                    </span>
                                    <span>{item.label}</span>
                                </div>
                            </DropdownItem>
                        );
                    })}
                </DropdownMenu>
            </TorrentTable_ContextMenuSurface>
        </AnimatePresence>
    );
}
