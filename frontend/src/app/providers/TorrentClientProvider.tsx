import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    type ReactNode,
} from "react";
import { useConnectionConfig, buildRpcEndpoint } from "../context/ConnectionConfigContext";
import { TransmissionAdapter } from "../../services/rpc/rpc-base";
import type { EngineAdapter } from "../../services/rpc/engine-adapter";

const ClientContext = createContext<EngineAdapter | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
    const { activeProfile } = useConnectionConfig();
    const client = useMemo(
        () =>
            new TransmissionAdapter({
                endpoint: buildRpcEndpoint(activeProfile),
                username: activeProfile.username,
                password: activeProfile.password,
            }),
        [
            activeProfile.scheme,
            activeProfile.host,
            activeProfile.port,
            activeProfile.username,
            activeProfile.password,
            activeProfile.id,
        ]
    );

    useEffect(() => {
        if (typeof sessionStorage === "undefined") return;
        if (activeProfile.token) {
            sessionStorage.setItem("tt-auth-token", activeProfile.token);
        } else {
            sessionStorage.removeItem("tt-auth-token");
        }
    }, [activeProfile.token]);

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
