import { useEffect, useRef } from "react";
import type { VisibilityState, SortingState } from "@tanstack/react-table";

// Persist table layout state to localStorage.
// Extracted from `TorrentTable.tsx` to keep persistence concerns isolated.
export const useTorrentTablePersistence = (
    initialState: any,
    columnOrder: string[],
    columnVisibility: VisibilityState,
    columnSizing: Record<string, number>,
    columnSizingInfo: any,
    sorting: SortingState
) => {
    const STORAGE_KEY = "tiny-torrent.table-state.v2.8";

    const latestStateRef = useRef({
        columnOrder: initialState.columnOrder,
        columnVisibility: initialState.columnVisibility,
        columnSizing: initialState.columnSizing,
        sorting: initialState.sorting,
    });
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

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
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(latestStateRef.current)
            );
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
            if (typeof window === "undefined") {
                return;
            }
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(latestStateRef.current)
            );
        };
    }, []);
};

export default useTorrentTablePersistence;
