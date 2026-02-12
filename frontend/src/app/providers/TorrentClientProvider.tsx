/* eslint-disable react-refresh/only-export-components */
import {
    useCallback,
    createContext,
    useContext,
    useEffect,
    useMemo,
    type ReactNode,
} from "react";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { resetRecoveryRuntimeSessionState } from "@/services/recovery/recovery-runtime-lifecycle";
import { resetTransportSessionRuntimeOwner } from "@/services/transport";
import { infraLogger } from "@/shared/utils/infraLogger";

const ClientContext = createContext<EngineAdapter | null>(null);

const destroyClient = (client: EngineAdapter | null) => {
    if (!client) return;
    try {
        client.destroy();
    } catch (error) {
        infraLogger.error(
            {
                scope: "client_provider",
                event: "destroy_failed",
                message: "Failed to destroy torrent client instance",
            },
            error,
        );
    }
};

export function ClientProvider({ children }: { children: ReactNode }) {
    const { activeProfile, activeRpcConnection } = useConnectionConfig();
    const configKey = `${activeRpcConnection.endpoint}::${activeRpcConnection.username}::${activeRpcConnection.password}::${activeProfile.id}`;

    const createClient = useCallback(
        () =>
            new TransmissionAdapter({
                endpoint: activeRpcConnection.endpoint,
                username: activeRpcConnection.username,
                password: activeRpcConnection.password,
            }),
        [
            activeRpcConnection.endpoint,
            activeRpcConnection.username,
            activeRpcConnection.password,
        ],
    );

    const client = useMemo(() => {
        // Reset adapter identity when profile id changes even if endpoint credentials match.
        void configKey;
        return createClient();
    }, [createClient, configKey]);

    // Session-boundary resets and teardown are tied to the concrete adapter
    // instance lifecycle.
    useEffect(() => {
        resetTransportSessionRuntimeOwner();
        resetRecoveryRuntimeSessionState();
    }, []);

    useEffect(() => {
        resetTransportSessionRuntimeOwner();
        resetRecoveryRuntimeSessionState();
        return () => {
            destroyClient(client);
        };
    }, [client]);

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
