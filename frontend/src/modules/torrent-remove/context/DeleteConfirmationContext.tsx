import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { DeleteIntent } from "@/app/types/workspace";
import type { DeleteConfirmationOutcome } from "@/modules/torrent-remove/types/deleteConfirmation";

export interface DeleteConfirmationContextValue {
    pendingDelete: DeleteIntent | null;
    clearPendingDelete: () => void;
    confirmDelete: (
        overrideDeleteData?: boolean
    ) => Promise<DeleteConfirmationOutcome>;
}

const DeleteConfirmationContext =
    createContext<DeleteConfirmationContextValue | null>(null);

export function DeleteConfirmationProvider({
    value,
    children,
}: {
    value: DeleteConfirmationContextValue;
    children: ReactNode;
}) {
    const memoized = useMemo(() => value, [value]);
    return (
        <DeleteConfirmationContext.Provider value={memoized}>
            {children}
        </DeleteConfirmationContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDeleteConfirmationContextOptional() {
    return useContext(DeleteConfirmationContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDeleteConfirmationContext() {
    const context = useDeleteConfirmationContextOptional();
    if (!context) {
        throw new Error(
            "useDeleteConfirmationContext must be used within DeleteConfirmationProvider"
        );
    }
    return context;
}
