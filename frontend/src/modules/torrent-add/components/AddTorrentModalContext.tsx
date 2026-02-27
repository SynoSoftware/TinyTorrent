import { createContext, useContext, type ReactNode } from "react";
import type { AddTorrentBrowseOutcome } from "@/modules/torrent-add/types";
import type { AddTorrentDestinationStatusKind } from "@/modules/torrent-add/utils/destinationStatus";
import type { FilePriority, FileRow } from "@/modules/torrent-add/services/fileSelection";
import type { RowSelectionState } from "@tanstack/react-table";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

export interface AddTorrentDestinationInputState {
    value: string;
    onChange: (next: string) => void;
    onBlur: () => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}

export interface AddTorrentDestinationGateState {
    statusKind: AddTorrentDestinationStatusKind;
    statusMessage: string;
    isDestinationValid: boolean;
    isTouchingDirectory: boolean;
    showBrowseAction: boolean;
    onConfirm: () => void;
    onBrowse: () => Promise<AddTorrentBrowseOutcome>;
}

export interface AddTorrentSettingsState {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    recentPaths: string[];
    applyRecentPath: (path?: string) => void;
    statusKind: AddTorrentDestinationStatusKind;
    statusMessage: string;
    spaceErrorDetail: string | null;
    startPaused: boolean;
    setStartPaused: (next: boolean) => void;
    showTransferFlags: boolean;
    sequential: boolean;
    skipHashCheck: boolean;
    setSequential: (next: boolean) => void;
    setSkipHashCheck: (next: boolean) => void;
}

export interface AddTorrentFileTableState {
    files: FileRow[];
    priorities: Map<number, FilePriority>;
    rowSelection: RowSelectionState;
    onRowSelectionChange: (
        next: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)
    ) => void;
    onSetPriority: (index: number, value: FilePriority) => void;
}

export interface AddTorrentModalContextValue {
    destinationInput: AddTorrentDestinationInputState;
    destinationGate: AddTorrentDestinationGateState;
    settings: AddTorrentSettingsState;
    fileTable: AddTorrentFileTableState;
}

const AddTorrentModalContext = createContext<AddTorrentModalContextValue | null>(
    null,
);

export function AddTorrentModalContextProvider({
    value,
    children,
}: {
    value: AddTorrentModalContextValue;
    children: ReactNode;
}) {
    return (
        <AddTorrentModalContext.Provider value={value}>
            {children}
        </AddTorrentModalContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAddTorrentModalContext(): AddTorrentModalContextValue {
    const context = useContext(AddTorrentModalContext);
    if (!context) {
        throw new Error(
            "useAddTorrentModalContext must be used within AddTorrentModalContextProvider",
        );
    }
    return context;
}
