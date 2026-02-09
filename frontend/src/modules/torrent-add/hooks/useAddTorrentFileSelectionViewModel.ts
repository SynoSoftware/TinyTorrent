import { useCallback, useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import {
    applySmartSelectCommand,
    filterFiles,
    type FileRow,
    type SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";

type TorrentPriority = "low" | "normal" | "high";

export interface AddTorrentFileSelectionParams {
    files: FileRow[];
}

export interface AddTorrentFileSelectionResult {
    filter: string;
    setFilter: (value: string) => void;
    rowSelection: RowSelectionState;
    selectedIndexes: Set<number>;
    selectedCount: number;
    selectedSize: number;
    isSelectionEmpty: boolean;
    priorities: Map<number, TorrentPriority>;
    filteredFiles: FileRow[];
    handleSmartSelect: (command: SmartSelectCommand) => void;
    setRowSelection: (
        next:
            | RowSelectionState
            | ((prev: RowSelectionState) => RowSelectionState),
    ) => void;
    handleRowClick: (index: number, shiftKey: boolean) => void;
    setPriority: (index: number, value: TorrentPriority) => void;
    cyclePriority: (index: number) => void;
    resetForSource: (sourceFiles: FileRow[]) => void;
}

export function useAddTorrentFileSelectionViewModel({
    files,
}: AddTorrentFileSelectionParams): AddTorrentFileSelectionResult {
    const [filter, setFilterState] = useState("");
    const [rowSelection, setRowSelectionState] = useState<RowSelectionState>(
        {},
    );
    const [priorities, setPriorities] = useState<Map<number, TorrentPriority>>(
        new Map(),
    );
    const [lastClickedFileIndex, setLastClickedFileIndex] = useState<
        number | null
    >(null);

    const setFilter = useCallback((value: string) => {
        setFilterState(value);
    }, []);

    const filteredFiles = useMemo(
        () => filterFiles(files, filter),
        [files, filter],
    );
    const selectedIndexes = useMemo(
        () =>
            new Set(
                Object.keys(rowSelection)
                    .filter((key) => rowSelection[key])
                    .map((key) => Number(key))
                    .filter((value) => Number.isFinite(value)),
            ),
        [rowSelection],
    );
    const fileSizesByIndex = useMemo(
        () => new Map(files.map((file) => [file.index, file.length] as const)),
        [files],
    );
    const selectedSize = useMemo(() => {
        if (selectedIndexes.size === 0) return 0;
        let sum = 0;
        selectedIndexes.forEach((index) => {
            sum += fileSizesByIndex.get(index) ?? 0;
        });
        return sum;
    }, [fileSizesByIndex, selectedIndexes]);
    const selectedCount = selectedIndexes.size;
    const isSelectionEmpty = selectedIndexes.size === 0;
    const headerScopeFiles = useMemo(
        () => (filter.trim().length > 0 ? filteredFiles : files),
        [filter, filteredFiles, files],
    );
    const orderedIndexes = useMemo(
        () => headerScopeFiles.map((file) => file.index),
        [headerScopeFiles],
    );

    const handleSmartSelect = useCallback(
        (command: SmartSelectCommand) => {
            const scopeFiles = filter.trim().length > 0 ? filteredFiles : files;
            const currentSelected = new Set(selectedIndexes);
            const nextSet = applySmartSelectCommand({
                command,
                scopeFiles,
                selected: currentSelected,
            });
            const nextSelection: RowSelectionState = {};
            nextSet.forEach((index) => {
                nextSelection[String(index)] = true;
            });
            setRowSelectionState(nextSelection);
        },
        [files, filter, filteredFiles, selectedIndexes],
    );

    const toggleSelection = useCallback((index: number) => {
        setRowSelectionState((prev) => {
            const key = String(index);
            if (prev[key]) {
                const next = { ...prev };
                delete next[key];
                return next;
            }
            return {
                ...prev,
                [key]: true,
            };
        });
    }, []);

    const setRowSelection = useCallback(
        (
            next:
                | RowSelectionState
                | ((prev: RowSelectionState) => RowSelectionState),
        ) => {
            setRowSelectionState((prev) =>
                typeof next === "function" ? next(prev) : next,
            );
        },
        [],
    );

    const handleRowClick = useCallback(
        (index: number, shiftKey: boolean) => {
            if (!shiftKey || lastClickedFileIndex === null) {
                toggleSelection(index);
                setLastClickedFileIndex(index);
                return;
            }

            const from = orderedIndexes.indexOf(lastClickedFileIndex);
            const to = orderedIndexes.indexOf(index);
            if (from === -1 || to === -1) {
                toggleSelection(index);
                setLastClickedFileIndex(index);
                return;
            }

            const start = Math.min(from, to);
            const end = Math.max(from, to);
            const rangeIndexes = orderedIndexes.slice(start, end + 1);

            setRowSelectionState((prev) => {
                const next = { ...prev };
                const shouldSelect = !prev[String(index)];
                rangeIndexes.forEach((fileIndex) => {
                    const key = String(fileIndex);
                    if (shouldSelect) next[key] = true;
                    else delete next[key];
                });
                return next;
            });
            setLastClickedFileIndex(index);
        },
        [orderedIndexes, lastClickedFileIndex, toggleSelection],
    );

    const setPriority = useCallback((index: number, value: TorrentPriority) => {
        setPriorities((prev) => {
            const next = new Map(prev);
            if (value === "normal") next.delete(index);
            else next.set(index, value);
            return next;
        });
    }, []);

    const cyclePriority = useCallback((index: number) => {
        setPriorities((prev) => {
            const current = prev.get(index) ?? "normal";
            const nextMap = new Map(prev);
            if (current === "normal") nextMap.set(index, "high");
            else if (current === "high") nextMap.set(index, "low");
            else nextMap.delete(index);
            return nextMap;
        });
    }, []);

    const resetForSource = useCallback((sourceFiles: FileRow[]) => {
        setFilterState("");
        setPriorities(new Map());
        const nextSelection: RowSelectionState = {};
        sourceFiles.forEach((file) => {
            nextSelection[String(file.index)] = true;
        });
        setRowSelectionState(nextSelection);
        setLastClickedFileIndex(null);
    }, []);

    return {
        filter,
        setFilter,
        rowSelection,
        selectedIndexes,
        selectedCount,
        selectedSize,
        isSelectionEmpty,
        priorities,
        filteredFiles,
        handleSmartSelect,
        setRowSelection,
        handleRowClick,
        setPriority,
        cyclePriority,
        resetForSource,
    };
}
