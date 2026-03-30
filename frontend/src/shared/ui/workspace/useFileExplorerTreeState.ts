import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    FileExplorerEntry,
    FileExplorerFilterMode,
} from "@/shared/ui/workspace/fileExplorerTreeTypes";
import type { LibtorrentPriority } from "@/services/rpc/entities";
import {
    buildTree,
    collectFolderIds,
    filterEntries,
    flattenTree,
} from "@/shared/ui/workspace/fileExplorerTreeModel";

type FileExplorerTreeStateOverrides = {
    wantedByIndex?: ReadonlyMap<number, boolean>;
    priorityByIndex?: ReadonlyMap<number, LibtorrentPriority>;
    searchQuery?: string;
    initialExpandedIds?: readonly string[];
    onExpandedIdsChange?: (expandedIds: readonly string[]) => void;
};

const areStringSetsEqual = (
    left: ReadonlySet<string>,
    right: ReadonlySet<string>,
) => {
    if (left.size !== right.size) {
        return false;
    }
    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }
    return true;
};

export const useFileExplorerTreeState = (
    files: FileExplorerEntry[],
    overrides?: FileExplorerTreeStateOverrides,
) => {
    const wantedByIndexOverride = overrides?.wantedByIndex;
    const priorityByIndexOverride = overrides?.priorityByIndex;
    const initialExpandedIds = overrides?.initialExpandedIds ?? [];
    const onExpandedIdsChange = overrides?.onExpandedIdsChange;
    const [searchQueryState, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FileExplorerFilterMode>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
        () => new Set(initialExpandedIds),
    );
    const searchQuery = overrides?.searchQuery ?? searchQueryState;
    const initialExpandedIdSet = useMemo(
        () => new Set(initialExpandedIds),
        [initialExpandedIds],
    );

    useEffect(() => {
        setExpandedIds((current) =>
            areStringSetsEqual(current, initialExpandedIdSet)
                ? current
                : initialExpandedIdSet,
        );
    }, [initialExpandedIdSet]);

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
        const map = new Map<number, LibtorrentPriority>();
        files.forEach((file) => map.set(file.index, file.priority ?? 4));
        return map;
    }, [files, priorityByIndexOverride]);

    const updateExpandedIds = useCallback(
        (updater: (previous: ReadonlySet<string>) => Set<string>) => {
            setExpandedIds((previous) => {
                const next = updater(previous);
                if (areStringSetsEqual(previous, next)) {
                    return previous;
                }
                onExpandedIdsChange?.(Array.from(next));
                return next;
            });
        },
        [onExpandedIdsChange],
    );

    const toggleExpand = useCallback((id: string) => {
        updateExpandedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, [updateExpandedIds]);

    const expandAll = useCallback(() => {
        updateExpandedIds(() => collectFolderIds(buildTree(files)));
    }, [files, updateExpandedIds]);

    const collapseAll = useCallback(() => {
        updateExpandedIds(() => new Set());
    }, [updateExpandedIds]);

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
