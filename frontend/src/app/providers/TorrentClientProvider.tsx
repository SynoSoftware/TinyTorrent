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
// TODO: Stop importing `NativeShell` here once ShellAgent/ShellExtensions adapter exists; client provider should not subscribe to native events or store auth tokens.

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
    // TODO: Remove this entire sessionStorage `tt-auth-token` flow. With “RPC extensions: NONE”, there is no TT token and no `X-TT-Auth` header; only Transmission Basic Auth is supported.
    // TODO: Ensure any remaining session ID handling is strictly `X-Transmission-Session-Id` via the transport layer (no UI-managed token storage).

    useEffect(() => {
        const unsubscribe = NativeShell.onEvent("auth-token", (payload) => {
            if (typeof sessionStorage === "undefined") return;
            let token = "";
            if (typeof payload === "string") {
                token = payload;
            } else if (
                payload &&
                typeof payload === "object" &&
                typeof (payload as { token?: unknown }).token === "string"
            ) {
                token = (payload as { token: string }).token;
            }
            if (token) {
                sessionStorage.setItem("tt-auth-token", token);
            } else {
                sessionStorage.removeItem("tt-auth-token");
            }
        });
        return unsubscribe;
    }, []);
    // TODO: Remove `NativeShell.onEvent("auth-token")` entirely. Any “native override” should be limited to endpoint host/port/scheme (if needed) and should not include auth tokens.
    // TODO: After removal, this provider should only (a) build the Transmission RPC endpoint, (b) pass username/password, and (c) recreate/destroy the adapter on profile changes.

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
