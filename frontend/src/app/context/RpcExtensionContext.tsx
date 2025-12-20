import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TinyTorrentCapabilities } from "@/services/rpc/entities";
import type { RpcStatus } from "@/shared/types/rpc";

export type RpcExtensionAvailability =
    | "idle"
    | "loading"
    | "available"
    | "unavailable"
    | "error";

interface RpcExtensionContextValue {
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    availability: RpcExtensionAvailability;
    capabilities: TinyTorrentCapabilities | null;
    isRefreshing: boolean;
    refresh: () => Promise<void>;
    shouldUseExtension: boolean;
    isMocked: boolean;
}

const STORAGE_KEY = "tiny-torrent.rpc-extension.enabled";

const readStoredPreference = () => {
    if (typeof window === "undefined") {
        return true;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
    return true;
};

const RpcExtensionContext = createContext<
    RpcExtensionContextValue | undefined
>(undefined);

interface RpcExtensionProviderProps {
    children: ReactNode;
    client: EngineAdapter;
    rpcStatus: RpcStatus;
    onUnavailable?: () => void;
}

export function RpcExtensionProvider({
    children,
    client,
    rpcStatus,
    onUnavailable,
}: RpcExtensionProviderProps) {
    const [enabled, setEnabled] = useState<boolean>(() =>
        readStoredPreference()
    );
    const [capabilities, setCapabilities] =
        useState<TinyTorrentCapabilities | null>(null);
    const [availability, setAvailability] =
        useState<RpcExtensionAvailability>("idle");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const unavailableToastRef = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEY, String(enabled));
    }, [enabled]);

    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        if (!enabled) {
            setAvailability("idle");
            setCapabilities(null);
            setIsRefreshing(false);
            return;
        }
        if (rpcStatus !== "connected") {
            setAvailability("idle");
            setCapabilities(null);
            setIsRefreshing(false);
            return;
        }
        if (!client.getExtendedCapabilities) {
            setCapabilities(null);
            setAvailability("unavailable");
            setIsRefreshing(false);
            return;
        }
        setAvailability("loading");
        try {
            const payload = await client.getExtendedCapabilities(true);
            if (payload) {
                setCapabilities(payload);
                setAvailability("available");
            } else {
                setCapabilities(null);
                setAvailability("unavailable");
            }
        } catch {
            setCapabilities(null);
            setAvailability("error");
        } finally {
            setIsRefreshing(false);
        }
    }, [client, enabled, rpcStatus]);

    useEffect(() => {
        if (!enabled) {
            setCapabilities(null);
            setAvailability("idle");
            setIsRefreshing(false);
            return;
        }
        if (rpcStatus !== "connected") {
            setCapabilities(null);
            setAvailability("idle");
            setIsRefreshing(false);
            return;
        }
        void refresh();
    }, [enabled, rpcStatus, refresh]);

    useEffect(() => {
        if (!onUnavailable) return;
        if (enabled && availability === "unavailable") {
            if (!unavailableToastRef.current) {
                onUnavailable();
                unavailableToastRef.current = true;
            }
        } else {
            unavailableToastRef.current = false;
        }
    }, [availability, enabled, onUnavailable]);

    const shouldUseExtension = enabled && availability === "available";
    const isMocked = enabled && availability === "unavailable";

    const value = useMemo(
        () => ({
            enabled,
            setEnabled,
            availability,
            capabilities,
            isRefreshing,
            refresh,
            shouldUseExtension,
            isMocked,
        }),
        [
            availability,
            capabilities,
            enabled,
            isMocked,
            isRefreshing,
            refresh,
            setEnabled,
            shouldUseExtension,
        ]
    );

    return (
        <RpcExtensionContext.Provider value={value}>
            {children}
        </RpcExtensionContext.Provider>
    );
}

export function useRpcExtension() {
    const context = useContext(RpcExtensionContext);
    if (!context) {
        throw new Error(
            "useRpcExtension must be used within a RpcExtensionProvider"
        );
    }
    return context;
}
