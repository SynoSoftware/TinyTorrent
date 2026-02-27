import { useEffect, useRef } from "react";
import type {
    SortingState, VisibilityState, } from "@tanstack/react-table";
import { usePreferences } from "@/app/context/PreferencesContext";
import { scheduler } from "@/app/services/scheduler";
import { registry } from "@/config/logic";
const { timing, layout } = registry;

// Persist table layout state via the Preferences provider.
// Extracted from `TorrentTable.tsx` to keep persistence concerns isolated.
type TorrentTablePersistentState = {
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    sorting: SortingState;
};

interface UseTorrentTablePersistenceParams {
    initialState: TorrentTablePersistentState;
    columnOrder: string[];
    columnVisibility: VisibilityState;
    columnSizing: Record<string, number>;
    isColumnResizing: boolean;
    sorting: SortingState;
}

export const useTorrentTablePersistence = ({
    initialState,
    columnOrder,
    columnVisibility,
    columnSizing,
    isColumnResizing,
    sorting,
}: UseTorrentTablePersistenceParams) => {
    const { setTorrentTableState } = usePreferences();

    const latestStateRef = useRef({
        columnOrder: initialState.columnOrder,
        columnVisibility: initialState.columnVisibility,
        columnSizing: initialState.columnSizing,
        sorting: initialState.sorting,
    });
    const saveTimeoutRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        latestStateRef.current = {
            columnOrder,
            columnVisibility,
            columnSizing,
            sorting,
        };

        if (isColumnResizing) {
            if (saveTimeoutRef.current) {
                saveTimeoutRef.current();
                saveTimeoutRef.current = null;
            }
            return;
        }

        if (saveTimeoutRef.current) {
            saveTimeoutRef.current();
        }

        saveTimeoutRef.current = scheduler.scheduleTimeout(() => {
            setTorrentTableState(latestStateRef.current);
            saveTimeoutRef.current = null;
        }, timing.debounce.tablePersistMs);
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
                saveTimeoutRef.current();
                saveTimeoutRef.current = null;
            }
            setTorrentTableState(latestStateRef.current);
        };
    }, [setTorrentTableState]);
};

export default useTorrentTablePersistence;

