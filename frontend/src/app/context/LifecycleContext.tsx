import React, {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { ConnectionStatus } from "@/shared/types/rpc";
import { useSession } from "@/app/context/SessionContext";

export type LifecycleState = {
    rpcStatus: ConnectionStatus;
    uiMode: "Full" | "Rpc";
};

const LifecycleContext = createContext<LifecycleState | null>(null);

export function LifecycleProvider({ children }: { children: ReactNode }) {
    const {
        rpcStatus,
        uiCapabilities: { uiMode },
    } = useSession();

    const value = useMemo(() => ({ rpcStatus, uiMode }), [rpcStatus, uiMode]);

    return (
        <LifecycleContext.Provider value={value}>
            {children}
        </LifecycleContext.Provider>
    );
}

export function useLifecycle(): LifecycleState {
    const ctx = useContext(LifecycleContext);
    if (!ctx)
        throw new Error("useLifecycle must be used within LifecycleProvider");
    return ctx;
}
