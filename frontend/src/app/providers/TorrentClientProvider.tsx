import { createContext, useContext, useMemo, type ReactNode } from "react";
import { TransmissionAdapter } from "../../services/rpc/rpc-base";
import type { EngineAdapter } from "../../services/rpc/engine-adapter";

const ClientContext = createContext<EngineAdapter | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
    const client = useMemo(
        () =>
            new TransmissionAdapter({
                username: import.meta.env.VITE_RPC_USERNAME ?? "",
                password: import.meta.env.VITE_RPC_PASSWORD ?? "",
            }),
        []
    );

    return (
        <ClientContext.Provider value={client}>
            {children}
        </ClientContext.Provider>
    );
}

export function useTorrentClient() {
    const client = useContext(ClientContext);
    if (!client) {
        throw new Error(
            "useTorrentClient must be used within a ClientProvider"
        );
    }
    return client;
}
