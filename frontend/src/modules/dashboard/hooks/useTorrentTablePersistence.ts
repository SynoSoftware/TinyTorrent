import { useEffect, useRef } from "react";
import type { VisibilityState, SortingState } from "@tanstack/react-table";
import { usePreferences } from "@/app/context/PreferencesContext";

// Persist table layout state via the Preferences provider.
// Extracted from `TorrentTable.tsx` to keep persistence concerns isolated.
export const useTorrentTablePersistence = (
    initialState: any,
    columnOrder: string[],
    columnVisibility: VisibilityState,
    columnSizing: Record<string, number>,
    columnSizingInfo: any,
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

        if (columnSizingInfo.isResizingColumn) {
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
        }, 250);
    }, [
        columnOrder,
        columnSizing,
        columnSizingInfo.isResizingColumn,
        columnVisibility,
        sorting,
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
    }, []);
};

export default useTorrentTablePersistence;
