import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type MutableRefObject,
} from "react";
import type { Row } from "@tanstack/react-table";
import type { RowSelectionState } from "@tanstack/react-table";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useState } from "react";
import { useSelection } from "@/app/context/SelectionContext";

type RowSelectionControllerDeps = {
    table?: {
        getRowModel: () => { rows: Row<Torrent>[] };
        getSelectedRowModel: () => { rows: Row<Torrent>[] };
        getRow: (id: string) => Row<Torrent> | undefined;
    };
    rows?: Row<Torrent>[];
    rowIds: string[];
    rowVirtualizerRef?: MutableRefObject<{ scrollToIndex: (index: number) => void } | null>;
    isMarqueeDraggingRef: React.MutableRefObject<boolean>;
    marqueeClickBlockRef: React.MutableRefObject<boolean>;
    rowSelectionRef: React.MutableRefObject<RowSelectionState>;
    rowSelection: RowSelectionState;
    setRowSelection: (s: RowSelectionState) => void;
    anchorIndex: number | null;
    setAnchorIndex: (n: number | null) => void;
    focusIndex: number | null;
    setFocusIndex: (n: number | null) => void;
    highlightedRowId: string | null;
    setHighlightedRowId: (id: string | null) => void;
};

export const useRowSelectionController = (
    deps: RowSelectionControllerDeps
) => {
    const {
        table,
        rows,
        rowIds,
        rowVirtualizerRef,
        isMarqueeDraggingRef,
        marqueeClickBlockRef,
        rowSelectionRef,
        rowSelection,
        setRowSelection,
        anchorIndex,
        setAnchorIndex,
        focusIndex,
        setFocusIndex,
        highlightedRowId,
        setHighlightedRowId,
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
            setHighlightedRowId(bottomRow?.id ?? null);
            rowVirtualizerRef?.current?.scrollToIndex(bottomIndex);
        }
    }, [rowVirtualizerRef, table]);

    const selectedTorrents = useMemo(() => {
        if (!table) return [];
        return table
            .getSelectedRowModel()
            .rows.map((row) => row.original)
            .filter((torrent) => !torrent.isGhost);
    }, [table, rowSelection]);

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
            setHighlightedRowId(focusRowId ?? null);
        },
        [setAnchorIndex, setFocusIndex, setHighlightedRowId, setRowSelection]
    );

    const clearSelection = useCallback(() => {
        setRowSelection({});
        setAnchorIndex(null);
        setFocusIndex(null);
        setHighlightedRowId(null);
    }, [setAnchorIndex, setFocusIndex, setHighlightedRowId, setRowSelection]);

    useEffect(() => {
        setSelectedIds(selectedIds);
    }, [selectedIds, setSelectedIds]);

    const rowsById = useMemo(() => {
        if (!rows) return new Map<string, Row<Torrent>>();
        const map = new Map<string, Row<Torrent>>();
        rows.forEach((row) => {
            map.set(row.id, row);
        });
        return map;
    }, [rows]);

    const lastActiveRowIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (lastActiveRowIdRef.current === highlightedRowId) return;
        lastActiveRowIdRef.current = highlightedRowId ?? null;
        const activeRow = highlightedRowId
            ? rowsById.get(highlightedRowId)
            : null;
        setActiveId(activeRow?.original.id ?? null);
    }, [highlightedRowId, rowsById, setActiveId]);

    const handleRowClick = useCallback(
        (e: React.MouseEvent, rowId: string, originalIndex: number) => {
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
                setHighlightedRowId(rowId);
                return;
            }

            if (isMultiSelect) {
                table?.getRow(rowId)?.toggleSelected();
            } else {
                setRowSelection({ [rowId]: true });
            }

            setAnchorIndex(originalIndex);
            setFocusIndex(originalIndex);
            setHighlightedRowId(rowId);
        },
        [anchorIndex, focusIndex, isMarqueeDraggingRef, marqueeClickBlockRef, rowIds, table]
    );

    const ensureContextSelection = useCallback(
        (rowId: string, rowIndex: number, currentSelection: RowSelectionState) => {
            if (!currentSelection[rowId]) {
                setRowSelection({ [rowId]: true });
            }
            setHighlightedRowId(rowId);
            setAnchorIndex(rowIndex);
            setFocusIndex(rowIndex);
        },
        []
    );

    return {
        rowSelection,
        setRowSelection,
        rowSelectionRef,
        anchorIndex,
        focusIndex,
        setAnchorIndex,
        setFocusIndex,
        highlightedRowId,
        setHighlightedRowId,
        selectAllRows,
        selectedTorrents,
        getSelectionSnapshot,
        previewSelection,
        commitSelection,
        clearSelection,
        handleRowClick,
        ensureContextSelection,
        handleTableRowSelectionChange: setRowSelection,
    };
};

export default useRowSelectionController;
