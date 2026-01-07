import React, { useCallback } from "react";

// Wiring-friendly keyboard hook. Parent must provide the dependencies
// previously captured by the inline implementation.
export const useTorrentTableKeyboard = (deps: any) => {
    const {
        table,
        rowVirtualizer,
        anchorIndex,
        focusIndex,
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setHighlightedRowId,
        selectAllRows,
    } = deps;

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const allRows = table.getRowModel().rows;
            if (!allRows.length) return;

            const clampIndex = (value: number) =>
                Math.max(0, Math.min(allRows.length - 1, value));

            const focusSingleRow = (index: number) => {
                const targetIndex = clampIndex(index);
                const targetRow = allRows[targetIndex];
                if (!targetRow) return;
                setRowSelection({ [targetRow.id]: true });
                setAnchorIndex(targetIndex);
                setFocusIndex(targetIndex);
                setHighlightedRowId(targetRow.id);
                rowVirtualizer.scrollToIndex(targetIndex);
            };

            const selectRange = (startIndex: number, endIndex: number) => {
                const normalizedStart = clampIndex(startIndex);
                const normalizedEnd = clampIndex(endIndex);
                const [from, to] =
                    normalizedStart <= normalizedEnd
                        ? [normalizedStart, normalizedEnd]
                        : [normalizedEnd, normalizedStart];
                const nextSelection: any = {};
                for (let i = from; i <= to; i += 1) {
                    const row = allRows[i];
                    if (row) {
                        nextSelection[row.id] = true;
                    }
                }
                setRowSelection(nextSelection);
                setFocusIndex(normalizedEnd);
                const targetRow = allRows[normalizedEnd];
                if (targetRow) {
                    setHighlightedRowId(targetRow.id);
                }
                rowVirtualizer.scrollToIndex(normalizedEnd);
            };

            const { key, shiftKey, ctrlKey, metaKey } = event;
            if ((ctrlKey || metaKey) && key.toLowerCase() === "a") {
                event.preventDefault();
                selectAllRows();
                return;
            }
            if (key === "ArrowDown" || key === "ArrowUp") {
                event.preventDefault();
                const delta = key === "ArrowDown" ? 1 : -1;
                const baseIndex =
                    focusIndex ?? (delta === 1 ? -1 : allRows.length);
                const targetIndex = baseIndex + delta;
                if (shiftKey) {
                    const anchor = anchorIndex ?? clampIndex(baseIndex);
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "Home") {
                event.preventDefault();
                const targetIndex = 0;
                if (shiftKey) {
                    const anchor = anchorIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }

            if (key === "End") {
                event.preventDefault();
                const targetIndex = allRows.length - 1;
                if (shiftKey) {
                    const anchor = anchorIndex ?? targetIndex;
                    selectRange(anchor, targetIndex);
                } else {
                    focusSingleRow(targetIndex);
                }
                return;
            }
        },
        [
            anchorIndex,
            focusIndex,
            rowVirtualizer,
            selectAllRows,
            table,
            setRowSelection,
            setAnchorIndex,
            setFocusIndex,
            setHighlightedRowId,
        ]
    );

    return { handleKeyDown };
};

export default useTorrentTableKeyboard;
