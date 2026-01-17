import React, {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { ServerClass } from "@/services/rpc/entities";
import type { ConnectionStatus } from "@/shared/types/rpc";
import { useSession } from "@/app/context/SessionContext";

export type LifecycleState = {
    serverClass: ServerClass;
    rpcStatus: ConnectionStatus;
    nativeIntegration: boolean;
    uiMode: "Full" | "Rpc";
};
// TODO: Replace LifecycleState.serverClass/nativeIntegration with a single “capabilities/locality” model:
// TODO: - Transmission is the only engine; do not surface “tinytorrent” as a first-class variant.
// TODO: - Host-backed features must be derived from endpoint locality (localhost) + ShellAgent/ShellExtensions adapter availability.
// TODO: - Publish explicit capability flags (browse/open folder/system integration) once, and have UI consume them (no probing in components).
// TODO: - Publish `uiMode = "Full" | "Rpc"` as the only UX switch:
// TODO:   - `Full`: “TinyTorrent” experience (ShellExtensions enabled)
// TODO:   - `Rpc`:  “Transmission” experience (RPC-only; ShellExtensions disabled)

const LifecycleContext = createContext<LifecycleState | null>(null);

export function LifecycleProvider({ children }: { children: ReactNode }) {
    const {
        rpcStatus,
        engineInfo,
        uiCapabilities: { uiMode },
    } = useSession();

    const serverClass: ServerClass = ((engineInfo?.type === "libtorrent"
        ? "tinytorrent"
        : engineInfo?.type === "transmission"
        ? "transmission"
        : "unknown") as ServerClass);

    const nativeIntegration = uiMode === "Full";

    const value = useMemo(
        () => ({ serverClass, rpcStatus, nativeIntegration, uiMode }),
        [serverClass, rpcStatus, nativeIntegration, uiMode]
    );

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
