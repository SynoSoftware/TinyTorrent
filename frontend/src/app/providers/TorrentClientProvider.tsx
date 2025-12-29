import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useConnectionConfig, buildRpcEndpoint } from "@/app/context/ConnectionConfigContext";
import { TransmissionAdapter } from "@/services/rpc/rpc-base";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { NativeShell } from "@/app/runtime";

const ClientContext = createContext<EngineAdapter | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
    const { activeProfile } = useConnectionConfig();
    const clientRef = useRef<EngineAdapter | null>(null);
    const [client, setClient] = useState<EngineAdapter>(
        () =>
            new TransmissionAdapter({
                endpoint: buildRpcEndpoint(activeProfile),
                username: activeProfile.username,
                password: activeProfile.password,
            })
    );

    // Recreate client when profile changes. Destroy previous client before creating new one.
    useEffect(() => {
        const prev = clientRef.current;
        if (prev && typeof (prev as any).destroy === "function") {
            try {
                (prev as any).destroy();
            } catch {}
        }
        const next = new TransmissionAdapter({
            endpoint: buildRpcEndpoint(activeProfile),
            username: activeProfile.username,
            password: activeProfile.password,
        });
        clientRef.current = next;
        setClient(next);

        return () => {
            const cur = clientRef.current;
            if (cur && typeof (cur as any).destroy === "function") {
                try {
                    (cur as any).destroy();
                } catch {}
            }
            clientRef.current = null;
        };
    }, [
        activeProfile.scheme,
        activeProfile.host,
        activeProfile.port,
        activeProfile.username,
        activeProfile.password,
        activeProfile.id,
    ]);

    useEffect(() => {
        if (typeof sessionStorage === "undefined") return;
        if (activeProfile.token) {
            sessionStorage.setItem("tt-auth-token", activeProfile.token);
        } else {
            sessionStorage.removeItem("tt-auth-token");
        }
    }, [activeProfile.token]);

    useEffect(() => {
        const unsubscribe = NativeShell.onEvent("auth-token", (payload) => {
            if (typeof sessionStorage === "undefined") return;
            const token = typeof payload === "string" ? payload : "";
            if (token) {
                sessionStorage.setItem("tt-auth-token", token);
            } else {
                sessionStorage.removeItem("tt-auth-token");
            }
        });
        return unsubscribe;
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
