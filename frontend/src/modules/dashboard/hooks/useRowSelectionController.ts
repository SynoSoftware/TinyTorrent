import {
    useCallback,
    useEffect,
    useMemo,
    type MutableRefObject,
} from "react";
import type { Row } from "@tanstack/react-table";
import type { RowSelectionState } from "@tanstack/react-table";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import { useSelection } from "@/app/context/AppShellStateContext";


type RowSelectionControllerDeps = {
    table?: {
        getRowModel: () => { rows: Row<Torrent>[] };
        getSelectedRowModel: () => { rows: Row<Torrent>[] };
        getRow: (id: string) => Row<Torrent> | undefined;
    };
    rowIds: string[];
    rowVirtualizerRef?: MutableRefObject<{ scrollToIndex: (index: number) => void } | null>;
    isMarqueeDraggingRef: React.MutableRefObject<boolean>;
    marqueeClickBlockRef: React.MutableRefObject<boolean>;
    dragClickBlockRef: React.MutableRefObject<boolean>;
    rowSelectionRef: React.MutableRefObject<RowSelectionState>;
    rowSelection: RowSelectionState;
    setRowSelection: (s: RowSelectionState) => void;
    anchorIndex: number | null;
    setAnchorIndex: (n: number | null) => void;
    focusIndex: number | null;
    setFocusIndex: (n: number | null) => void;
};

export const useRowSelectionController = (
    deps: RowSelectionControllerDeps
) => {
    const {
        table,
        rowIds,
        rowVirtualizerRef,
        isMarqueeDraggingRef,
        marqueeClickBlockRef,
        dragClickBlockRef,
        rowSelectionRef,
        rowSelection,
        setRowSelection,
        anchorIndex,
        setAnchorIndex,
        focusIndex,
        setFocusIndex,
    } = deps;
    const { setSelectedIds, setActiveId } = useSelection();

    useEffect(() => {
        rowSelectionRef.current = rowSelection;
    }, [rowSelection, rowSelectionRef]);

    if (import.meta.env.DEV && table) {
        const modelRows = table.getRowModel().rows;
        const modelIds = modelRows.map((row) => row.id);
        if (
            rowIds.length !== modelIds.length ||
            !rowIds.every((id, idx) => id === modelIds[idx])
        ) {
            throw new Error(
                "Selection invariant violated: rowIds must match React Table row order"
            );
        }
    }

    const selectAllRows = useCallback(() => {
        const allRows = table?.getRowModel().rows ?? [];
        const nextSelection: RowSelectionState = {};
        allRows.forEach((row) => {
            if (row.original.isGhost) return;
            nextSelection[row.id] = true;
        });
        setRowSelection(nextSelection);
        if (allRows.length) {
            const bottomIndex = allRows.length - 1;
            const bottomRow = allRows[bottomIndex];
            setAnchorIndex(bottomIndex);
            setFocusIndex(bottomIndex);
            setActiveId(bottomRow?.id ?? null);
            rowVirtualizerRef?.current?.scrollToIndex(bottomIndex);
        }
    }, [
        rowVirtualizerRef,
        setActiveId,
        setAnchorIndex,
        setFocusIndex,
        setRowSelection,
        table,
    ]);

    const selectedTorrents = (() => {
        if (!table) return [];
        return table
            .getSelectedRowModel()
            .rows.map((row) => row.original)
            .filter((torrent) => !torrent.isGhost);
    })();

    const selectedIds = useMemo(
        () => selectedTorrents.map((torrent) => torrent.id),
        [selectedTorrents]
    );

    const getSelectionSnapshot = useCallback(
        () => rowSelectionRef.current,
        [rowSelectionRef]
    );

    const previewSelection = useCallback(
        (next: RowSelectionState) => {
            setRowSelection(next);
        },
        [setRowSelection]
    );

    const commitSelection = useCallback(
        (
            next: RowSelectionState,
            focusIndexValue: number | null,
            focusRowId: string | null
        ) => {
            setRowSelection(next);
            if (focusIndexValue !== null) {
                setAnchorIndex(focusIndexValue);
                setFocusIndex(focusIndexValue);
            }
            setActiveId(focusRowId ?? null);
        },
        [setActiveId, setAnchorIndex, setFocusIndex, setRowSelection]
    );

    const clearSelection = useCallback(() => {
        setRowSelection({});
        setAnchorIndex(null);
        setFocusIndex(null);
        setActiveId(null);
    }, [setActiveId, setAnchorIndex, setFocusIndex, setRowSelection]);

    useEffect(() => {
        setSelectedIds(selectedIds);
    }, [selectedIds, setSelectedIds]);

    const handleRowClick = useCallback(
        (
            e: React.MouseEvent,
            rowId: string,
            originalIndex: number,
            options?: {
                suppressPlainClick?: boolean;
            },
        ) => {
            if (!table) return;
            if (isMarqueeDraggingRef.current) return;
            const target = e.target as HTMLElement;
            if (marqueeClickBlockRef.current) {
                marqueeClickBlockRef.current = false;
                return;
            }
            const rowData = table?.getRow(rowId)?.original;
            if (rowData?.isGhost) return;
            if (
                target.closest("button") ||
                target.closest("label") ||
                target.closest("[data-no-select]")
            )
                return;

            const isMultiSelect = e.ctrlKey || e.metaKey;
            const isRangeSelect = e.shiftKey;
            const rangeAnchor = anchorIndex ?? focusIndex;
            const suppressPlainClick = Boolean(options?.suppressPlainClick);

            if (!suppressPlainClick && dragClickBlockRef.current) {
                dragClickBlockRef.current = false;
                return;
            }

            if (suppressPlainClick && !isMultiSelect && !isRangeSelect) {
                return;
            }

            if (isRangeSelect && rangeAnchor !== null) {
                const allRows = table.getRowModel().rows;
                const actualAnchorIndex = Math.max(
                    0,
                    Math.min(allRows.length - 1, rangeAnchor)
                );
                const [start, end] =
                    actualAnchorIndex < originalIndex
                        ? [actualAnchorIndex, originalIndex]
                        : [originalIndex, actualAnchorIndex];
                const newSel: RowSelectionState = {};
                const ids = rowIds.slice(start, end + 1);
                for (const id of ids) newSel[id] = true;
                setRowSelection(newSel);
                setFocusIndex(originalIndex);
                setActiveId(rowId);
                return;
            }

            if (isMultiSelect) {
                table?.getRow(rowId)?.toggleSelected();
            } else {
                setRowSelection({ [rowId]: true });
            }

            setAnchorIndex(originalIndex);
            setFocusIndex(originalIndex);
            setActiveId(rowId);
        },
        [
            anchorIndex,
            focusIndex,
            dragClickBlockRef,
            isMarqueeDraggingRef,
            marqueeClickBlockRef,
            rowIds,
            setActiveId,
            setAnchorIndex,
            setFocusIndex,
            setRowSelection,
            table,
        ]
    );

    const handleRowPointerDown = useCallback(
        (event: React.PointerEvent, rowId: string, originalIndex: number) => {
            if (!table) return;
            if (event.button !== 0) return;
            if (isMarqueeDraggingRef.current) return;
            const target = event.target as HTMLElement;
            if (
                target.closest("button") ||
                target.closest("label") ||
                target.closest("[data-no-select]")
            ) {
                return;
            }

            const rowData = table.getRow(rowId)?.original;
            if (rowData?.isGhost) return;

            if (event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
            }

            setActiveId(rowId);
            setRowSelection({ [rowId]: true });
            setAnchorIndex(originalIndex);
            setFocusIndex(originalIndex);
        },
        [
            isMarqueeDraggingRef,
            setActiveId,
            setRowSelection,
            setAnchorIndex,
            setFocusIndex,
            table,
        ],
    );

    const ensureContextSelection = useCallback(
        (rowId: string, rowIndex: number, currentSelection: RowSelectionState) => {
            if (!currentSelection[rowId]) {
                setRowSelection({ [rowId]: true });
            }
            setAnchorIndex(rowIndex);
            setFocusIndex(rowIndex);
            setActiveId(rowId);
        },
        [setActiveId, setAnchorIndex, setFocusIndex, setRowSelection]
    );

    return {
        selectAllRows,
        getSelectionSnapshot,
        previewSelection,
        commitSelection,
        clearSelection,
        handleRowPointerDown,
        handleRowClick,
        setActiveId,
        ensureContextSelection,
    };
};

export default useRowSelectionController;


