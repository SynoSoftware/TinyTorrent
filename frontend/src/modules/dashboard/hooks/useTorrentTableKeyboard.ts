import React, { useCallback } from "react";
import type { Row, RowSelectionState } from "@tanstack/react-table";
import {
    resolveShortcutIntentFromKeyboardEvent,
    Shortcuts,
} from "@/app/controlPlane/shortcuts";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";
import {
    torrentTableActions,
    type TorrentTableAction,
} from "@/modules/dashboard/types/torrentTable";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

// Wiring-friendly keyboard hook. Parent must provide the dependencies
// previously captured by the inline implementation.
type TorrentTableKeyboardDeps = {
    table: {
        getRowModel: () => { rows: Array<Row<Torrent>> };
    };
    rowVirtualizer: {
        scrollToIndex: (index: number) => void;
    };
    anchorIndex: number | null;
    focusIndex: number | null;
    setRowSelection: (next: RowSelectionState) => void;
    setAnchorIndex: (index: number | null) => void;
    setFocusIndex: (index: number | null) => void;
    setActiveId: (id: string | null) => void;
    selectAllRows: () => void;
    executeQueueAction: (
        action: TorrentTableAction,
    ) => Promise<TorrentCommandOutcome>;
};

export const useTorrentTableKeyboard = (deps: TorrentTableKeyboardDeps) => {
    const {
        table,
        rowVirtualizer,
        anchorIndex,
        focusIndex,
        setRowSelection,
        setAnchorIndex,
        setFocusIndex,
        setActiveId,
        selectAllRows,
        executeQueueAction,
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
                setActiveId(targetRow.id);
                rowVirtualizer.scrollToIndex(targetIndex);
            };

            const selectRange = (startIndex: number, endIndex: number) => {
                const normalizedStart = clampIndex(startIndex);
                const normalizedEnd = clampIndex(endIndex);
                const [from, to] =
                    normalizedStart <= normalizedEnd
                        ? [normalizedStart, normalizedEnd]
                        : [normalizedEnd, normalizedStart];
                const nextSelection: RowSelectionState = {};
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
                    setActiveId(targetRow.id);
                }
                rowVirtualizer.scrollToIndex(normalizedEnd);
            };

            const { key, shiftKey, ctrlKey, metaKey } = event;
            if ((ctrlKey || metaKey) && key.toLowerCase() === "a") {
                event.preventDefault();
                selectAllRows();
                return;
            }
            const shortcutIntent = resolveShortcutIntentFromKeyboardEvent(
                event.nativeEvent,
                [
                    Shortcuts.intents.QueueMoveTop,
                    Shortcuts.intents.QueueMoveUp,
                    Shortcuts.intents.QueueMoveDown,
                    Shortcuts.intents.QueueMoveBottom,
                ],
            );
            if (shortcutIntent) {
                event.preventDefault();
                const action =
                    shortcutIntent === Shortcuts.intents.QueueMoveTop
                        ? torrentTableActions.queueMoveTop
                        : shortcutIntent === Shortcuts.intents.QueueMoveUp
                          ? torrentTableActions.queueMoveUp
                          : shortcutIntent === Shortcuts.intents.QueueMoveDown
                            ? torrentTableActions.queueMoveDown
                            : torrentTableActions.queueMoveBottom;
                void executeQueueAction(action);
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
            setActiveId,
            executeQueueAction,
        ]
    );

    return { handleKeyDown };
};

export default useTorrentTableKeyboard;

