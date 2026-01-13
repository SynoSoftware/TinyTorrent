import { createContext, type ReactNode, useContext } from "react";
import type { ServerClass } from "@/services/rpc/entities";
import type { Torrent } from "@/modules/dashboard/types/torrent";

export interface RecoveryContextValue {
    serverClass: ServerClass;
    handleRetry: () => Promise<void>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
    handleSetLocation: (
        torrent: Torrent,
        path?: string | null
    ) => Promise<void>;
}

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function RecoveryProvider({
    value,
    children,
}: {
    value: RecoveryContextValue;
    children: ReactNode;
}) {
    return (
        <RecoveryContext.Provider value={value}>
            {children}
        </RecoveryContext.Provider>
    );
}

export function useRecoveryContext(): RecoveryContextValue {
    const context = useContext(RecoveryContext);
    if (!context) {
        throw new Error(
            "useRecoveryContext must be used within RecoveryProvider"
        );
    }
    return context;
}
