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
import { FileExplorerTreeRow } from "@/shared/ui/workspace/FileExplorerTreeRow";
import { useFileExplorerTreeState } from "@/shared/ui/workspace/useFileExplorerTreeState";

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
        <GlassPanel className="flex flex-col h-full rounded-medium border border-default-200/50 shadow-small">
            <div className="flex flex-wrap items-center gap-tools p-tight border-b border-default-200/50 bg-content1/30">
                <Input
                    classNames={{
                        base: "min-w-0",
                        inputWrapper: "h-button text-scaled",
                    }}
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
                            className="h-button toolbar-icon-hit"
                        >
                            <Filter className="toolbar-icon-size-sm text-default-600" />
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

                <div className="h-sep w-divider bg-default-300 mx-tight" />

                <ButtonGroup size="md" variant="shadow">
                    <Button
                        onPress={expandAll}
                        isIconOnly
                        aria-label={t("actions.expand_all")}
                        className="h-button toolbar-icon-hit"
                    >
                        <ArrowDown className="toolbar-icon-size-sm" />
                    </Button>
                    <Button
                        onPress={collapseAll}
                        isIconOnly
                        aria-label={t("actions.collapse_all")}
                        className="h-button toolbar-icon-hit"
                    >
                        <ArrowUp className="toolbar-icon-size-sm" />
                    </Button>
                </ButtonGroup>

                <div className="flex-1" />

                <div
                    className={cn(
                        "flex items-center gap-tools transition-opacity duration-200",
                        selectedIndexes.size > 0
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none",
                    )}
                >
                    <span className="text-label text-default-500 font-medium hidden sm:inline-block">
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
                                className="h-button text-scaled"
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

            <div className="grid grid-cols-file-tree items-center px-panel py-tight border-b border-default-200/50 bg-default-100/50 text-label font-bold uppercase tracking-label text-default-500 z-sticky">
                <div className="flex items-center justify-center">
                    <Checkbox
                        size="sm"
                        isSelected={isAllSelected}
                        isIndeterminate={isIndeterminate}
                        onValueChange={handleSelectAll}
                        classNames={{ wrapper: "after:bg-primary" }}
                    />
                </div>
                <div>{t("fields.name")}</div>
                <div className="text-center">{t("fields.priority")}</div>
                <div className="text-center">{t("fields.progress")}</div>
                <div className="text-right">{t("fields.size")}</div>
            </div>

            <div
                ref={parentRef}
                className="flex-1 overflow-auto min-h-0 relative scrollbar-hide"
            >
                <div
                    className="relative w-full"
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
                                className="absolute top-0 left-0 w-full"
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
                    <div className="flex flex-col items-center justify-center h-full text-default-400 gap-tools absolute inset-0">
                        <Search className="toolbar-icon-size-lg opacity-20" />
                        <p className="text-scaled opacity-50">
                            {viewModel.emptyMessage ?? t("errors.no_results")}
                        </p>
                    </div>
                )}
            </div>
        </GlassPanel>
    );
});
