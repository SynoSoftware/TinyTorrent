import { createContext, useContext, type ReactNode } from "react";
import type { AddTorrentBrowseOutcome } from "@/modules/torrent-add/types";
import type { FilePriority, FileRow } from "@/modules/torrent-add/services/fileSelection";
import type { RowSelectionState } from "@tanstack/react-table";
import type { DestinationPathFeedback } from "@/shared/ui/workspace/DestinationPathEditor";
import type { DragEvent } from "react";

export interface AddTorrentDestinationInputState {
    value: string;
    history: string[];
    onChange: (next: string) => void;
    onBlur: () => void;
    onEscape: () => void;
}

export interface AddTorrentDestinationGateState {
    isDestinationValid: boolean;
    isTouchingDirectory: boolean;
    showBrowseAction: boolean;
    onConfirm: () => void;
    onEnter: () => void;
    onBrowse: () => Promise<AddTorrentBrowseOutcome>;
    feedback: DestinationPathFeedback;
}

export interface AddTorrentSettingsState {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    onEnter: () => void;
    feedback: DestinationPathFeedback;
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
