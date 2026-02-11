import { useEffect, useRef } from "react";
import type {
    SortingState,
    VisibilityState,
} from "@tanstack/react-table";
import { usePreferences } from "@/app/context/PreferencesContext";
import { TABLE_PERSIST_DEBOUNCE_MS } from "@/config/logic";

// Persist table layout state via the Preferences provider.
// Extracted from `TorrentTable.tsx` to keep persistence concerns isolated.
type TorrentTablePersistentState = {
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    sorting: SortingState;
};

export const useTorrentTablePersistence = (
    initialState: TorrentTablePersistentState,
    columnOrder: string[],
    columnVisibility: VisibilityState,
    columnSizing: Record<string, number>,
    isColumnResizing: boolean,
    sorting: SortingState
) => {
    const { setTorrentTableState } = usePreferences();

    const latestStateRef = useRef({
        columnOrder: initialState.columnOrder,
        columnVisibility: initialState.columnVisibility,
        columnSizing: initialState.columnSizing,
        sorting: initialState.sorting,
    });
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        latestStateRef.current = {
            columnOrder,
            columnVisibility,
            columnSizing,
            sorting,
        };

        if (isColumnResizing) {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            setTorrentTableState(latestStateRef.current);
            saveTimeoutRef.current = null;
        }, TABLE_PERSIST_DEBOUNCE_MS);
    }, [
        columnOrder,
        columnSizing,
        isColumnResizing,
        columnVisibility,
        sorting,
        setTorrentTableState,
    ]);

    useEffect(() => {
        return () => {
            // NOTE: The Preferences provider owns storage persistence, so this cleanup simply flushes the last buffered state via `setTorrentTableState` before unmount.
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            setTorrentTableState(latestStateRef.current);
        };
    }, [setTorrentTableState]);
};

export default useTorrentTablePersistence;
