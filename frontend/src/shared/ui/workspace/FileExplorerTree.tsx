import { ArrowDown, ArrowUp, ChevronDown, Filter, Search } from "lucide-react";
import {
    Button,
    ButtonGroup,
    Checkbox,
    cn,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
} from "@heroui/react";
import { memo, useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import type {
    FileExplorerContextAction,
    FileExplorerFilterMode,
    FileExplorerTreeViewModel,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";
import { GlassPanel } from "@/shared/ui/layout/GlassPanel";
import {
    buildFileTreeSelectionActionsClass,
    CHECKBOX_PRIMARY_CLASSNAMES,
    FILE_TREE_CONTAINER_CLASS,
    FILE_TREE_EMPTY_ICON_CLASS,
    FILE_TREE_EMPTY_OVERLAY_CLASS,
    FILE_TREE_EMPTY_TEXT_CLASS,
    FILE_TREE_EXPAND_BUTTON_CLASS,
    FILE_TREE_FILTER_BUTTON_CLASS,
    FILE_TREE_FILTER_ICON_CLASS,
    FILE_TREE_HEADER_CHECKBOX_WRAP_CLASS,
    FILE_TREE_HEADER_PRIORITY_CLASS,
    FILE_TREE_HEADER_PROGRESS_CLASS,
    FILE_TREE_HEADER_ROW_CLASS,
    FILE_TREE_HEADER_SIZE_CLASS,
    FILE_TREE_PRIORITY_BUTTON_CLASS,
    FILE_TREE_SEARCH_INPUT_CLASSNAMES,
    FILE_TREE_SCROLL_CLASS,
    FILE_TREE_SELECTION_ACTIONS_LABEL_CLASS,
    FILE_TREE_TOOLBAR_CLASS,
    FILE_TREE_TOOLS_DIVIDER_CLASS,
    FILE_TREE_VIRTUAL_CANVAS_CLASS,
    FILE_TREE_VIRTUAL_ROW_CLASS,
    MENU_ITEM_CLASSNAMES,
    MENU_LIST_CLASSNAMES,
    MENU_SURFACE_CLASS,
} from "@/shared/ui/layout/glass-surface";
import { FileExplorerTreeRow } from "@/shared/ui/workspace/FileExplorerTreeRow";
import { useFileExplorerTreeState } from "@/shared/ui/workspace/useFileExplorerTreeState";
import { TEXT_ROLE_EXTENDED } from "@/config/textRoles";

export type {
    FileExplorerContextAction,
    FileExplorerEntry,
    FileExplorerToggleCommand,
    FileExplorerToggleOutcome,
    FileExplorerTreeViewModel,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";

interface FileExplorerTreeProps {
    viewModel: FileExplorerTreeViewModel;
}

const ROW_ESTIMATE = 36;

export const FileExplorerTree = memo(function FileExplorerTree({
    viewModel,
}: FileExplorerTreeProps) {
    const { files, onFilesToggle, onFileContextAction } = viewModel;
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);

    const {
        searchQuery,
        setSearchQuery,
        filterMode,
        setFilterMode,
        expandedIds,
        toggleExpand,
        expandAll,
        collapseAll,
        visibleNodes,
        selectedIndexes,
        setSelectedIndexes,
        handleSelectionChange,
        handleSelectAll,
        fileWantedMap,
        filePriorityMap,
        isAllSelected,
        isIndeterminate,
    } = useFileExplorerTreeState(files);

    useEffect(() => {
        const next = new Set<number>();
        fileWantedMap.forEach((wanted, index) => {
            if (wanted) next.add(index);
        });
        setSelectedIndexes(next);
    }, [fileWantedMap, setSelectedIndexes]);

    const handleSetPriority = useCallback(
        (priority: LibtorrentPriority | "skip", targetIndexes?: number[]) => {
            const indexesToUpdate =
                targetIndexes ?? Array.from(selectedIndexes);
            if (indexesToUpdate.length === 0) return;

            if (priority === "skip") {
                void onFilesToggle(indexesToUpdate, false);
                return;
            }

            void onFilesToggle(indexesToUpdate, true);
            const entryMap = new Map(files.map((file) => [file.index, file]));

            let action: FileExplorerContextAction = "priority_normal";
            if (priority >= 6) action = "priority_high";
            if (priority <= 2) action = "priority_low";

            indexesToUpdate.forEach((index) => {
                const entry = entryMap.get(index);
                if (entry) {
                    onFileContextAction?.(action, entry);
                }
            });
        },
        [files, onFileContextAction, onFilesToggle, selectedIndexes],
    );

    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_ESTIMATE,
        overscan: 10,
    });

    return (
        <GlassPanel className={FILE_TREE_CONTAINER_CLASS}>
            <div className={FILE_TREE_TOOLBAR_CLASS}>
                <Input
                    classNames={FILE_TREE_SEARCH_INPUT_CLASSNAMES}
                    placeholder={t("actions.search")}
                    startContent={
                        <Search className="toolbar-icon-size-sm text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    isClearable
                    size="md"
                    variant="bordered"
                />

                <Dropdown>
                    <DropdownTrigger>
                        <Button
                            size="md"
                            variant="shadow"
                            isIconOnly
                            className={FILE_TREE_FILTER_BUTTON_CLASS}
                        >
                            <Filter className={FILE_TREE_FILTER_ICON_CLASS} />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        selectionMode="single"
                        selectedKeys={new Set([filterMode])}
                        onSelectionChange={(keys) =>
                            setFilterMode(
                                Array.from(keys)[0] as FileExplorerFilterMode,
                            )
                        }
                        disallowEmptySelection
                        variant="shadow"
                        className={MENU_SURFACE_CLASS}
                        classNames={MENU_LIST_CLASSNAMES}
                        itemClasses={MENU_ITEM_CLASSNAMES}
                    >
                        <DropdownItem key="all">{t("status.all")}</DropdownItem>
                        <DropdownItem key="video">
                            {t("types.video")}
                        </DropdownItem>
                        <DropdownItem key="audio">
                            {t("types.audio")}
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>

                <div className={FILE_TREE_TOOLS_DIVIDER_CLASS} />

                <ButtonGroup size="md" variant="shadow">
                    <Button
                        onPress={expandAll}
                        isIconOnly
                        aria-label={t("actions.expand_all")}
                        className={FILE_TREE_EXPAND_BUTTON_CLASS}
                    >
                        <ArrowDown className="toolbar-icon-size-sm" />
                    </Button>
                    <Button
                        onPress={collapseAll}
                        isIconOnly
                        aria-label={t("actions.collapse_all")}
                        className={FILE_TREE_EXPAND_BUTTON_CLASS}
                    >
                        <ArrowUp className="toolbar-icon-size-sm" />
                    </Button>
                </ButtonGroup>

                <div className="flex-1" />

                <div
                    className={buildFileTreeSelectionActionsClass(
                        selectedIndexes.size > 0,
                    )}
                >
                    <span
                        className={FILE_TREE_SELECTION_ACTIONS_LABEL_CLASS}
                    >
                        {`${selectedIndexes.size} ${t("statusbar.selected_count")}`}
                    </span>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size="md"
                                color="primary"
                                variant="shadow"
                                endContent={
                                    <ChevronDown className="toolbar-icon-size-sm" />
                                }
                                className={FILE_TREE_PRIORITY_BUTTON_CLASS}
                            >
                                {t("fields.priority")}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            onAction={(key) => {
                                if (key === "high") handleSetPriority(7);
                                if (key === "normal") handleSetPriority(4);
                                if (key === "low") handleSetPriority(1);
                                if (key === "skip") handleSetPriority("skip");
                            }}
                            variant="shadow"
                            className={MENU_SURFACE_CLASS}
                            classNames={MENU_LIST_CLASSNAMES}
                            itemClasses={MENU_ITEM_CLASSNAMES}
                        >
                            <DropdownItem key="high">
                                {t("priority.high")}
                            </DropdownItem>
                            <DropdownItem key="normal">
                                {t("priority.normal")}
                            </DropdownItem>
                            <DropdownItem key="low">
                                {t("priority.low")}
                            </DropdownItem>
                            <DropdownItem key="skip" className="text-danger">
                                {t("priority.dont_download")}
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </div>
            </div>

            <div
                className={cn(
                    FILE_TREE_HEADER_ROW_CLASS,
                    TEXT_ROLE_EXTENDED.fileTreeHeader,
                )}
            >
                <div className={FILE_TREE_HEADER_CHECKBOX_WRAP_CLASS}>
                    <Checkbox
                        size="sm"
                        isSelected={isAllSelected}
                        isIndeterminate={isIndeterminate}
                        onValueChange={handleSelectAll}
                        classNames={CHECKBOX_PRIMARY_CLASSNAMES}
                    />
                </div>
                <div>{t("fields.name")}</div>
                <div className={FILE_TREE_HEADER_PRIORITY_CLASS}>{t("fields.priority")}</div>
                <div className={FILE_TREE_HEADER_PROGRESS_CLASS}>{t("fields.progress")}</div>
                <div className={FILE_TREE_HEADER_SIZE_CLASS}>{t("fields.size")}</div>
            </div>

            <div
                ref={parentRef}
                className={FILE_TREE_SCROLL_CLASS}
            >
                <div
                    className={FILE_TREE_VIRTUAL_CANVAS_CLASS}
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const node = visibleNodes[virtualRow.index];
                        const rowViewModel = {
                            node,
                            isExpanded: expandedIds.has(node.id),
                            isSelected: node.descendantIndexes.every((index) =>
                                selectedIndexes.has(index),
                            ),
                            isIndeterminate:
                                !node.descendantIndexes.every((index) =>
                                    selectedIndexes.has(index),
                                ) &&
                                node.descendantIndexes.some((index) =>
                                    selectedIndexes.has(index),
                                ),
                            isWanted: node.descendantIndexes.every((index) =>
                                Boolean(fileWantedMap.get(index)),
                            ),
                            priority: (filePriorityMap.get(
                                node.descendantIndexes[0],
                            ) || 4) as LibtorrentPriority,
                        };
                        return (
                            <div
                                key={virtualRow.key}
                                className={FILE_TREE_VIRTUAL_ROW_CLASS}
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <FileExplorerTreeRow
                                    row={rowViewModel}
                                    onToggleExpand={() => toggleExpand(node.id)}
                                    onSelectionChange={(selected) =>
                                        handleSelectionChange(
                                            node.descendantIndexes,
                                            selected ? "select" : "deselect",
                                        )
                                    }
                                    onSetPriority={handleSetPriority}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>

                {visibleNodes.length === 0 && (
                    <div className={FILE_TREE_EMPTY_OVERLAY_CLASS}>
                        <Search className={FILE_TREE_EMPTY_ICON_CLASS} />
                        <p className={FILE_TREE_EMPTY_TEXT_CLASS}>
                            {viewModel.emptyMessage ?? t("errors.no_results")}
                        </p>
                    </div>
                )}
            </div>
        </GlassPanel>
    );
});
