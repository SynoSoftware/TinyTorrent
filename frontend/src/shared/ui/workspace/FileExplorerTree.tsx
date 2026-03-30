import { ArrowDown, ArrowUp, FileText, Filter, ListOrdered, HardDrive, Percent, Search } from "lucide-react";
import {
    Checkbox,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Select,
    SelectItem,
} from "@heroui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import type { FileExplorerFilterMode, FileExplorerTreeViewModel } from "@/shared/ui/workspace/fileExplorerTreeTypes";
import { FILE_BROWSER, FORM_CONTROL, DETAILS, SURFACE, TABLE } from "@/shared/ui/layout/glass-surface";
import { ToolbarIconButton } from "@/shared/ui/layout/toolbar-button";
import { FileExplorerTreeRow, prioritySelectOptions } from "@/shared/ui/workspace/FileExplorerTreeRow";
import { getFileExplorerPrioritySelection } from "@/shared/ui/workspace/fileExplorerTreeModel";
import { useFileExplorerTreeState } from "@/shared/ui/workspace/useFileExplorerTreeState";
import useLayoutMetrics from "@/shared/hooks/useLayoutMetrics";

export type {
    FileExplorerEntry,
    FileExplorerToggleCommand,
    FileExplorerToggleOutcome,
    FileExplorerTreeViewModel,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";

interface FileExplorerTreeProps {
    viewModel: FileExplorerTreeViewModel;
}

const readCssLength = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getCompactLayoutThreshold = () => {
    if (typeof window === "undefined") {
        return 480;
    }
    const rootStyles = window.getComputedStyle(document.documentElement);
    const minTableWidth = readCssLength(rootStyles.getPropertyValue("--tt-add-file-table-min-w"));
    const panelSpacing = readCssLength(rootStyles.getPropertyValue("--spacing-panel"));
    if (minTableWidth == null || panelSpacing == null) {
        return 0;
    }
    return Math.round(minTableWidth + panelSpacing * 2);
};

export const FileExplorerTree = memo(function FileExplorerTree({ viewModel }: FileExplorerTreeProps) {
    const {
        files,
        wantedByIndex,
        priorityByIndex,
        initialExpandedIds,
        onExpandedIdsChange,
        showProgress = false,
        search,
        onFilesToggle,
        onSetPriority,
    } = viewModel;
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const toolbarLeadRef = useRef<HTMLDivElement>(null);
    const selectionMeasureRef = useRef<HTMLSpanElement>(null);
    const { rowHeight } = useLayoutMetrics();
    const [containerWidth, setContainerWidth] = useState(0);
    const [shouldShowSelectionSummary, setShouldShowSelectionSummary] = useState(false);
    useEffect(() => {
        const element = parentRef.current;
        if (!element || typeof ResizeObserver === "undefined") {
            return;
        }

        const updateWidth = () => {
            const nextWidth = Math.max(0, element.getBoundingClientRect().width);
            setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
        };

        updateWidth();

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const nextWidth = Math.max(0, entry.contentRect.width);
                setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
            }
        });

        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, []);

    const compactLayoutThreshold = useMemo(() => getCompactLayoutThreshold(), []);
    const isCompactLayout = containerWidth > 0 && containerWidth < compactLayoutThreshold;

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
        fileWantedMap,
        filePriorityMap,
    } = useFileExplorerTreeState(files, {
        wantedByIndex,
        priorityByIndex,
        initialExpandedIds,
        onExpandedIdsChange,
        searchQuery: search?.value,
    });
    const controlledSearchValue = search?.value ?? searchQuery;
    const handleSearchValueChange = search?.onChange ?? setSearchQuery;

    const selectedIndexes = useMemo(() => {
        const next = new Set<number>();
        files.forEach((file) => {
            if (fileWantedMap.get(file.index)) {
                next.add(file.index);
            }
        });
        return next;
    }, [fileWantedMap, files]);

    const allVisibleIndexes = useMemo(
        () => Array.from(new Set(visibleNodes.flatMap((node) => node.descendantIndexes))),
        [visibleNodes],
    );

    const headerPrioritySelection = useMemo(() => {
        return getFileExplorerPrioritySelection(
            allVisibleIndexes,
            filePriorityMap,
            fileWantedMap,
            true,
        );
    }, [allVisibleIndexes, filePriorityMap, fileWantedMap]);

    const gridTemplateColumns = showProgress
        ? "minmax(var(--tt-add-file-col-select-min-w), var(--tt-add-file-col-select-w)) minmax(var(--tt-add-file-col-name-min-w), 1fr) minmax(var(--tt-add-file-col-priority-min-w), var(--tt-add-file-col-priority-w)) minmax(calc(20 * var(--u) * var(--z)), var(--tt-col-meta)) minmax(var(--tt-add-file-col-size-min-w), var(--tt-add-file-col-size-w))"
        : "minmax(var(--tt-add-file-col-select-min-w), var(--tt-add-file-col-select-w)) minmax(var(--tt-add-file-col-name-min-w), 1fr) minmax(var(--tt-add-file-col-priority-min-w), var(--tt-add-file-col-priority-w)) minmax(var(--tt-add-file-col-size-min-w), var(--tt-add-file-col-size-w))";

    const isAllSelected =
        allVisibleIndexes.length > 0 && allVisibleIndexes.every((index) => Boolean(fileWantedMap.get(index)));
    const isIndeterminate = !isAllSelected && allVisibleIndexes.some((index) => Boolean(fileWantedMap.get(index)));

    const applyPriorityToIndexes = useCallback(
        async (indexesToUpdate: number[], priority: LibtorrentPriority | "skip") => {
            if (indexesToUpdate.length === 0) return;

            if (priority === "skip") {
                void onFilesToggle(indexesToUpdate, false);
                return;
            }

            const skippedIndexes = indexesToUpdate.filter((index) => !fileWantedMap.get(index));
            if (skippedIndexes.length > 0) {
                const toggleOutcome = await onFilesToggle(skippedIndexes, true);
                if (toggleOutcome.status !== "success") {
                    return;
                }
            }

            await onSetPriority?.(indexesToUpdate, priority);
        },
        [fileWantedMap, onFilesToggle, onSetPriority],
    );

    const handleSetPriority = useCallback(
        (priority: LibtorrentPriority | "skip", targetIndexes?: number[]) => {
            applyPriorityToIndexes(targetIndexes ?? [], priority);
        },
        [applyPriorityToIndexes],
    );

    const handleSetVisiblePriority = useCallback(
        (priority: LibtorrentPriority | "skip") => {
            applyPriorityToIndexes(allVisibleIndexes, priority);
        },
        [allVisibleIndexes, applyPriorityToIndexes],
    );

    const handleSelectAll = useCallback(
        (selected: boolean) => {
            if (!allVisibleIndexes.length) return;
            void onFilesToggle(allVisibleIndexes, selected);
        },
        [allVisibleIndexes, onFilesToggle],
    );

    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeight,
        measureElement: (element) => element?.getBoundingClientRect().height ?? rowHeight,
        overscan: 10,
    });

    useEffect(() => {
        virtualizer.measure();
    }, [isCompactLayout, virtualizer]);

    useEffect(() => {
        if (selectedIndexes.size === 0) {
            setShouldShowSelectionSummary(false);
            return;
        }

        const toolbar = toolbarRef.current;
        const toolbarLead = toolbarLeadRef.current;
        const selectionMeasure = selectionMeasureRef.current;
        if (!toolbar || !toolbarLead || !selectionMeasure) {
            setShouldShowSelectionSummary(true);
            return;
        }

        const rootStyles = window.getComputedStyle(document.documentElement);
        const toolbarGap = readCssLength(rootStyles.getPropertyValue("--gap-tools")) ?? 0;
        const requiredWidth =
            toolbarLead.getBoundingClientRect().width +
            selectionMeasure.getBoundingClientRect().width +
            toolbarGap * 2;
        setShouldShowSelectionSummary(requiredWidth <= toolbar.clientWidth);
    }, [containerWidth, selectedIndexes.size]);

    return (
        <div ref={parentRef} className={FILE_BROWSER.container}>
            <div ref={toolbarRef} className={FILE_BROWSER.toolbar}>
                <div ref={toolbarLeadRef} className={FILE_BROWSER.toolbarLead}>
                    <div className={FILE_BROWSER.toolbarActionGroup}>
                        <ToolbarIconButton
                            Icon={ArrowDown}
                            ariaLabel={t("actions.expand_all")}
                            title={t("actions.expand_all")}
                            onPress={expandAll}
                            className={DETAILS.headerContextActionButton}
                            iconSize="md"
                        />
                        <ToolbarIconButton
                            Icon={ArrowUp}
                            ariaLabel={t("actions.collapse_all")}
                            title={t("actions.collapse_all")}
                            onPress={collapseAll}
                            className={DETAILS.headerContextActionButton}
                            iconSize="md"
                        />
                    </div>
                    <div className={FILE_BROWSER.toolsDivider} />

                    <Dropdown>
                        <DropdownTrigger>
                            <ToolbarIconButton
                                Icon={Filter}
                                ariaLabel={t("labels.filter_aria")}
                                title={t("labels.filter_aria")}
                                className={DETAILS.headerContextActionButton}
                                iconSize="md"
                            />
                        </DropdownTrigger>
                        <DropdownMenu
                            selectionMode="single"
                            selectedKeys={new Set([filterMode])}
                            onSelectionChange={(keys) => setFilterMode(Array.from(keys)[0] as FileExplorerFilterMode)}
                            disallowEmptySelection
                            variant="shadow"
                            className={SURFACE.menu.surface}
                            classNames={SURFACE.menu.listClassNames}
                            itemClasses={SURFACE.menu.itemClassNames}
                        >
                            <DropdownItem key="all">{t("status.all")}</DropdownItem>
                            <DropdownItem key="video">{t("types.video")}</DropdownItem>
                            <DropdownItem key="audio">{t("types.audio")}</DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                    <Input
                        classNames={FILE_BROWSER.searchInputClassNames}
                        className={FILE_BROWSER.toolbarSearchWrap}
                        placeholder={t("actions.search")}
                        startContent={<Search className={FILE_BROWSER.iconDefault} />}
                        value={controlledSearchValue}
                        onValueChange={handleSearchValueChange}
                        isClearable
                        size="md"
                        variant="bordered"
                    />
                </div>

                <div className={FILE_BROWSER.toolbarSpacer} />

                <div className={FILE_BROWSER.builder.selectionSummaryClass(shouldShowSelectionSummary)}>
                    <span className={FILE_BROWSER.toolbarSelectionCount}>
                        {`${selectedIndexes.size} ${t("statusbar.selected_count")}`}
                    </span>
                </div>
                <span ref={selectionMeasureRef} className={FILE_BROWSER.toolbarSelectionMeasure}>
                    {`${selectedIndexes.size} ${t("statusbar.selected_count")}`}
                </span>
            </div>

            {!isCompactLayout ? (
                <div className={FILE_BROWSER.headerRow} style={{ gridTemplateColumns }}>
                    <div className={FILE_BROWSER.headerCheckboxWrap}>
                        <Checkbox
                            size="md"
                            isSelected={isAllSelected}
                            isIndeterminate={isIndeterminate}
                            onValueChange={handleSelectAll}
                            classNames={FORM_CONTROL.checkboxPrimaryClassNames}
                        />
                    </div>
                    <div className={`${TABLE.columnHeaderLabel} ${FILE_BROWSER.headerCellName}`}>
                        <FileText className={TABLE.columnHeaderIcon} />
                        <span>{t("fields.name")}</span>
                    </div>
                    <div className={`${TABLE.columnHeaderLabel} ${FILE_BROWSER.headerCellCenter}`}>
                        <Select
                            aria-label={t("fields.priority")}
                            placeholder={
                                allVisibleIndexes.length > 0 &&
                                headerPrioritySelection.size === 0
                                    ? t("priority.mixed")
                                    : t("fields.priority")
                            }
                            startContent={<ListOrdered className={TABLE.columnHeaderIcon} />}
                            selectedKeys={headerPrioritySelection}
                            onSelectionChange={(keys) => {
                                const [next] = [...keys];
                                if (!next) return;
                                const option = prioritySelectOptions.find((candidate) => candidate.key === next);
                                if (!option) return;
                                handleSetVisiblePriority(option.value);
                            }}
                            variant="underlined"
                            size="sm"
                            classNames={FORM_CONTROL.priorityHeaderSelectClassNames}
                        >
                            {prioritySelectOptions.map((option) => {
                                const Icon = option.icon;
                                return (
                                    <SelectItem key={option.key} startContent={<Icon className={option.iconClass} />}>
                                        {t(option.labelKey)}
                                    </SelectItem>
                                );
                            })}
                        </Select>
                    </div>
                    {showProgress ? (
                        <div className={`${TABLE.columnHeaderLabel} ${FILE_BROWSER.headerCellCenter}`}>
                            <Percent className={TABLE.columnHeaderIcon} />
                            <span>{t("fields.progress")}</span>
                        </div>
                    ) : null}
                    <div className={`${TABLE.columnHeaderLabel} ${FILE_BROWSER.headerCellEnd}`}>
                        <HardDrive className={TABLE.columnHeaderIcon} />
                        <span>{t("fields.size")}</span>
                    </div>
                </div>
            ) : null}

            {visibleNodes.length === 0 ? (
                <div className={FILE_BROWSER.emptyWrap}>
                    <div className={FILE_BROWSER.emptyOverlay}>
                        <Search className={FILE_BROWSER.emptyIcon} />
                        <p className={FILE_BROWSER.emptyText}>{viewModel.emptyMessage ?? t("errors.no_results")}</p>
                    </div>
                </div>
            ) : (
                <div className={FILE_BROWSER.virtualCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const node = visibleNodes[virtualRow.index];
                        const allowsSkipPriority = !node.isFolder;
                        const rowViewModel = {
                            node,
                            isExpanded: expandedIds.has(node.id),
                            isSelected: node.descendantIndexes.every((index) => Boolean(fileWantedMap.get(index))),
                            isIndeterminate:
                                !node.descendantIndexes.every((index) => Boolean(fileWantedMap.get(index))) &&
                                node.descendantIndexes.some((index) => Boolean(fileWantedMap.get(index))),
                            isWanted: node.descendantIndexes.every((index) => Boolean(fileWantedMap.get(index))),
                            prioritySelection: getFileExplorerPrioritySelection(
                                node.descendantIndexes,
                                filePriorityMap,
                                fileWantedMap,
                                allowsSkipPriority,
                            ),
                            allowsSkipPriority,
                        };
                        return (
                            <div
                                key={virtualRow.key}
                                ref={virtualizer.measureElement}
                                data-index={virtualRow.index}
                                className={FILE_BROWSER.virtualRow}
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <FileExplorerTreeRow
                                    row={rowViewModel}
                                    showProgress={showProgress}
                                    gridTemplateColumns={gridTemplateColumns}
                                    layout={isCompactLayout ? "card" : "table"}
                                    onToggleExpand={() => toggleExpand(node.id)}
                                    onWantedChange={(wanted) => void onFilesToggle(node.descendantIndexes, wanted)}
                                    onSetPriority={handleSetPriority}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
