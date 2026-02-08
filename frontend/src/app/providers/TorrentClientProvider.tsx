import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { resetRecoveryRuntimeSessionState } from "@/services/recovery/recovery-runtime-lifecycle";
import { resetTransportSessionRuntimeOwner } from "@/services/transport";

const ClientContext = createContext<EngineAdapter | null>(null);

const destroyClient = (client: EngineAdapter | null) => {
    if (!client) return;
    try {
        client.destroy();
    } catch {}
};

export function ClientProvider({ children }: { children: ReactNode }) {
    const { activeProfile, activeRpcConnection } = useConnectionConfig();
    const clientRef = useRef<EngineAdapter | null>(null);
    const lastConfigKeyRef = useRef<string>("");
    const configKey = `${activeRpcConnection.endpoint}::${activeRpcConnection.username}::${activeRpcConnection.password}::${activeProfile.id}`;

    const createClient = () =>
        new TransmissionAdapter({
            endpoint: activeRpcConnection.endpoint,
            username: activeRpcConnection.username,
            password: activeRpcConnection.password,
        });

    const [client, setClient] = useState<EngineAdapter>(() => {
        const next = createClient();
        clientRef.current = next;
        lastConfigKeyRef.current = configKey;
        return next;
    });

    // Session-boundary resets and teardown are tied to the concrete adapter
    // instance lifecycle.
    useEffect(() => {
        resetTransportSessionRuntimeOwner();
        resetRecoveryRuntimeSessionState();
    }, []);

    useEffect(() => {
        if (clientRef.current && lastConfigKeyRef.current === configKey) {
            return;
        }
        resetTransportSessionRuntimeOwner();
        resetRecoveryRuntimeSessionState();
        const prev = clientRef.current;
        destroyClient(prev);
        const next = createClient();
        clientRef.current = next;
        lastConfigKeyRef.current = configKey;
        setClient(next);
    }, [configKey]);

    useEffect(() => {
        return () => {
            const cur = clientRef.current;
            destroyClient(cur);
            clientRef.current = null;
        };
    }, []);

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
