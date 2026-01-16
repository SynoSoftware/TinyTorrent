import React, {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useTransmissionSession } from "@/app/hooks/useTransmissionSession";
import type { ServerClass } from "@/services/rpc/entities";
import type { ConnectionStatus } from "@/shared/types/rpc";
import Runtime from "@/app/runtime";

export type LifecycleState = {
    serverClass: ServerClass;
    rpcStatus: ConnectionStatus;
    nativeIntegration: boolean;
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
    const client = useTorrentClient();
    const { rpcStatus, engineInfo } = useTransmissionSession(client);

    const serverClass: ServerClass = (client.getServerClass?.() ??
        (engineInfo?.type === "libtorrent"
            ? "tinytorrent"
            : engineInfo?.type === "transmission"
            ? "transmission"
            : "unknown")) as ServerClass;
    // TODO: Remove serverClass inference once RPC extensions are gone; treat EngineInfo as Transmission-only and use “unknown” when disconnected.

    const nativeIntegration =
        Runtime.isNativeHost || serverClass === "tinytorrent";
    // TODO: Replace nativeIntegration heuristic with ShellAgent/ShellExtensions capability: “native host present AND connected to localhost endpoint”.
    // TODO: Do not depend on `serverClass === "tinytorrent"` for any UX gating. Local Transmission can also be `uiMode=Full` if ShellExtensions is available.

    const value = useMemo(
        () => ({ serverClass, rpcStatus, nativeIntegration }),
        [serverClass, rpcStatus, nativeIntegration]
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
