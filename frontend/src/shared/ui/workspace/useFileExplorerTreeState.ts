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
    searchQuery?: string;
};

export const useFileExplorerTreeState = (
    files: FileExplorerEntry[],
    overrides?: FileExplorerTreeStateOverrides,
) => {
    const wantedByIndexOverride = overrides?.wantedByIndex;
    const priorityByIndexOverride = overrides?.priorityByIndex;
    const [searchQueryState, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FileExplorerFilterMode>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const searchQuery = overrides?.searchQuery ?? searchQueryState;

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
        if (wantedByIndexOverride) {
            return wantedByIndexOverride;
        }
        const map = new Map<number, boolean>();
        files.forEach((file) => map.set(file.index, file.wanted ?? true));
        return map;
    }, [files, wantedByIndexOverride]);

    const filePriorityMap = useMemo(() => {
        if (priorityByIndexOverride) {
            return priorityByIndexOverride;
        }
        const map = new Map<number, number>();
        files.forEach((file) => map.set(file.index, file.priority ?? 4));
        return map;
    }, [files, priorityByIndexOverride]);

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
        fileWantedMap,
        filePriorityMap,
    };
};
