import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import { useConnectionConfig } from "../context/ConnectionConfigContext";
import { TransmissionAdapter } from "../../services/rpc/rpc-base";
import type { EngineAdapter } from "../../services/rpc/engine-adapter";

const ClientContext = createContext<EngineAdapter | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
    const { activeProfile } = useConnectionConfig();
    const client = useMemo(
        () =>
            new TransmissionAdapter({
                endpoint: activeProfile.endpoint,
                username: activeProfile.username,
                password: activeProfile.password,
            }),
        [
            activeProfile.endpoint,
            activeProfile.username,
            activeProfile.password,
            activeProfile.id,
        ]
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
