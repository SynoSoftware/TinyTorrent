import { useCallback, useMemo, useState } from "react";
import type {
    FileExplorerEntry,
    FileExplorerFilterMode,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";
import {
    buildTree,
    collectFolderIds,
    filterEntries,
    flattenTree,
} from "@/shared/ui/workspace/fileExplorerTreeModel";

type FileExplorerTreeStateOverrides = {
    wantedByIndex?: ReadonlyMap<number, boolean>;
    priorityByIndex?: ReadonlyMap<number, number>;
};

export const useFileExplorerTreeState = (
    files: FileExplorerEntry[],
    overrides?: FileExplorerTreeStateOverrides,
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FileExplorerFilterMode>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
        () => new Set(),
    );

    const filteredFiles = useMemo(
        () => filterEntries(files, searchQuery, filterMode),
        [files, searchQuery, filterMode],
    );
    const rootNodes = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

    const visibleNodes = useMemo(() => {
        if (searchQuery.trim() || filterMode !== "all") {
            return flattenTree(rootNodes, collectFolderIds(rootNodes));
        }
        return flattenTree(rootNodes, expandedIds);
    }, [expandedIds, filterMode, rootNodes, searchQuery]);

    const fileWantedMap = useMemo(() => {
        if (overrides?.wantedByIndex) {
            return overrides.wantedByIndex;
        }
        const map = new Map<number, boolean>();
        files.forEach((file) => map.set(file.index, file.wanted ?? true));
        return map;
    }, [files, overrides?.wantedByIndex]);

    const filePriorityMap = useMemo(() => {
        if (overrides?.priorityByIndex) {
            return overrides.priorityByIndex;
        }
        const map = new Map<number, number>();
        files.forEach((file) => map.set(file.index, file.priority ?? 4));
        return map;
    }, [files, overrides?.priorityByIndex]);

    const allVisibleIndexes = useMemo(
        () => visibleNodes.flatMap((node) => node.descendantIndexes),
        [visibleNodes],
    );

    const isAllSelected =
        allVisibleIndexes.length > 0 &&
        allVisibleIndexes.every((index) => selectedIndexes.has(index));
    const isIndeterminate =
        !isAllSelected &&
        allVisibleIndexes.some((index) => selectedIndexes.has(index));

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        setExpandedIds(collectFolderIds(buildTree(files)));
    }, [files]);

    const collapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const handleSelectionChange = useCallback(
        (indexes: number[], mode: "toggle" | "select" | "deselect") => {
            setSelectedIndexes((previous) => {
                const next = new Set(previous);
                indexes.forEach((index) => {
                    if (mode === "toggle") {
                        if (next.has(index)) {
                            next.delete(index);
                        } else {
                            next.add(index);
                        }
                        return;
                    }
                    if (mode === "select") {
                        next.add(index);
                        return;
                    }
                    next.delete(index);
                });
                return next;
            });
        },
        [],
    );

    const handleSelectAll = useCallback(
        (selected: boolean) => {
            if (!selected) {
                setSelectedIndexes(new Set());
                return;
            }
            setSelectedIndexes(new Set(allVisibleIndexes));
        },
        [allVisibleIndexes],
    );

    return {
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
        allVisibleIndexes,
        isAllSelected,
        isIndeterminate,
    };
};
