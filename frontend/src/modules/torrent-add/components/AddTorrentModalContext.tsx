import { createContext, useContext } from "react";
import type {
    DragEvent,
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
} from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import type { AddTorrentDestinationStatusKind } from "@/modules/torrent-add/utils/destinationStatus";
import type {
    FilePriority,
    FileRow,
    SmartSelectCommand,
} from "@/modules/torrent-add/services/fileSelection";

type ResolvedState = "pending" | "ready" | "error";

interface AddTorrentDestinationInputState {
    value: string;
    onChange: (next: string) => void;
    onBlur: () => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}

interface AddTorrentDestinationGateState {
    statusKind: AddTorrentDestinationStatusKind;
    statusMessage: string;
    isDestinationValid: boolean;
    isTouchingDirectory: boolean;
    showBrowseAction: boolean;
    onConfirm: () => void;
    onBrowse: () => Promise<void>;
}

interface AddTorrentSettingsState {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: () => void;
    recentPaths: string[];
    applyRecentPath: (path?: string) => void;
    statusKind: AddTorrentDestinationStatusKind;
    statusMessage: string;
    spaceErrorDetail: string | null;
    showTransferFlags: boolean;
    sequential: boolean;
    skipHashCheck: boolean;
    setSequential: (next: boolean) => void;
    setSkipHashCheck: (next: boolean) => void;
}

interface AddTorrentFileTableState {
    files: FileRow[];
    priorities: Map<number, FilePriority>;
    resolvedState: ResolvedState;
    rowHeight: number;
    selectedCount: number;
    selectedSize: number;
    rowSelection: RowSelectionState;
    onCyclePriority: (index: number) => void;
    onRowClick: (index: number, shiftKey: boolean) => void;
    onRowSelectionChange: (
        next: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)
    ) => void;
    onSetPriority: (index: number, value: FilePriority) => void;
    onSmartSelect: (command: SmartSelectCommand) => void;
}

export interface AddTorrentModalContextValue {
    destinationInput: AddTorrentDestinationInputState;
    destinationGate: AddTorrentDestinationGateState;
    settings: AddTorrentSettingsState;
    fileTable: AddTorrentFileTableState;
}

const AddTorrentModalContext = createContext<AddTorrentModalContextValue | null>(
    null
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

export function useAddTorrentModalContext(): AddTorrentModalContextValue {
    const context = useContext(AddTorrentModalContext);
    if (!context) {
        throw new Error(
            "useAddTorrentModalContext must be used within AddTorrentModalContextProvider"
        );
    }
    return context;
}
