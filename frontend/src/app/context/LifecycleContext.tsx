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

    const nativeIntegration =
        Runtime.isNativeHost || serverClass === "tinytorrent";

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
