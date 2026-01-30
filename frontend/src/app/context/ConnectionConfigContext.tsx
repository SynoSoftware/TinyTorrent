import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import type { ReactNode } from "react";
import { CONFIG } from "@/config/logic";
import Runtime from "@/app/runtime";
import { usePreferences } from "@/app/context/PreferencesContext";
import type {
    ConnectionProfile,
    ConnectionScheme,
} from "@/app/types/connection-profile";

type NativeOverride = {
    host?: string;
    port?: string;
    scheme?: ConnectionScheme;
};

interface ConnectionConfigContextValue {
    profiles: ConnectionProfile[];
    activeProfileId: string;
    activeProfile: ConnectionProfile;
    setActiveProfileId: (id: string) => void;
    addProfile: () => void;
    removeProfile: (id: string) => void;
    updateProfile: (
        id: string,
        patch: Partial<Omit<ConnectionProfile, "id">>
    ) => void;
}

export const DEFAULT_PROFILE_ID = "default-connection";
const DEFAULT_PROFILE_LABEL = "";

const DEFAULT_RPC_PATH = CONFIG.defaults.rpc_endpoint;
const NORMALIZED_RPC_PATH = DEFAULT_RPC_PATH.startsWith("/")
    ? DEFAULT_RPC_PATH
    : `/${DEFAULT_RPC_PATH}`;
const DEFAULT_RPC_HOST = "localhost";
const DEFAULT_RPC_PORT = "9091";
const DEFAULT_RPC_SCHEME: ConnectionProfile["scheme"] = "http";
const DEFAULT_USERNAME = import.meta.env.VITE_RPC_USERNAME ?? "";
const DEFAULT_PASSWORD = import.meta.env.VITE_RPC_PASSWORD ?? "";

const detectNativeInfo = (): NativeOverride => {
    if (typeof window === "undefined") {
        return {};
    }
    const info = (
        window as typeof globalThis & {
            __TINY_TORRENT_NATIVE_INFO__?: Record<string, unknown>;
        }
    ).__TINY_TORRENT_NATIVE_INFO__;
    if (!info || typeof info !== "object") {
        return {};
    }
    const host =
        typeof info.host === "string" && info.host.trim()
            ? info.host.trim()
            : undefined;
    const port =
        typeof info.port === "string" && info.port.trim()
            ? info.port.trim()
            : undefined;
    const scheme =
        info.scheme === "https"
            ? "https"
            : info.scheme === "http"
            ? "http"
            : undefined;
    return { host, port, scheme };
};
// TODO: Normalize connection profiles with the capability helper (loopback/native shell), so capability derivation and browsing policies are consistent across app layers.
// TODO: Remove token detection from native info; native overrides must never inject auth state into the UI process.

const parseRpcEndpoint = (
    raw?: string
): { host: string; port: string; scheme: ConnectionProfile["scheme"] } => {
    let host = DEFAULT_RPC_HOST;
    let port = DEFAULT_RPC_PORT;
    let scheme: ConnectionProfile["scheme"] = DEFAULT_RPC_SCHEME;
    if (!raw) {
        return { host, port, scheme };
    }
    try {
        const normalized = /^[a-z][a-z+.-]*:\/\//i.test(raw)
            ? raw
            : `${DEFAULT_RPC_SCHEME}://${raw}`;
        const url = new URL(normalized);
        host = url.hostname || host;
        port = url.port || DEFAULT_RPC_PORT;
        scheme = url.protocol.replace(":", "") === "https" ? "https" : "http";
    } catch {
        const bracketIndex = raw.indexOf("://");
        const hostPort = bracketIndex >= 0 ? raw.slice(bracketIndex + 3) : raw;
        const [nextHost, nextPort] = hostPort.split(":");
        if (nextHost) {
            host = nextHost;
        }
        if (nextPort) {
            port = Number.isFinite(Number(nextPort))
                ? nextPort
                : DEFAULT_RPC_PORT;
        }
    }
    return { host, port, scheme };
};

export const buildRpcEndpoint = (profile: ConnectionProfile) => {
    const validHost = profile.host.trim() || DEFAULT_RPC_HOST;
    const portNumber = Number.parseInt(profile.port, 10);
    const port =
        Number.isFinite(portNumber) && portNumber > 0
            ? String(portNumber)
            : DEFAULT_RPC_PORT;
    const needsBrackets = validHost.includes(":") && !validHost.startsWith("[");
    const host = needsBrackets ? `[${validHost}]` : validHost;
    return `${profile.scheme}://${host}:${port}${NORMALIZED_RPC_PATH}`;
};

export const buildRpcServerUrl = (profile: ConnectionProfile) => {
    const validHost = profile.host.trim() || DEFAULT_RPC_HOST;
    const portNumber = Number.parseInt(profile.port, 10);
    const port =
        Number.isFinite(portNumber) && portNumber > 0
            ? String(portNumber)
            : DEFAULT_RPC_PORT;
    const needsBrackets = validHost.includes(":") && !validHost.startsWith("[");
    const host = needsBrackets ? `[${validHost}]` : validHost;
    return `${profile.scheme}://${host}:${port}`;
};

const createDefaultProfile = (): ConnectionProfile => ({
    id: DEFAULT_PROFILE_ID,
    label: DEFAULT_PROFILE_LABEL,
    scheme: DEFAULT_RPC_SCHEME,
    host: DEFAULT_RPC_HOST,
    port: DEFAULT_RPC_PORT,
    username: DEFAULT_USERNAME,
    password: DEFAULT_PASSWORD,
});
// TODO: After removing ConnectionProfile.token, also remove this default token initialization.

const generateId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);


const ConnectionConfigContext = createContext<
    ConnectionConfigContextValue | undefined
>(undefined);

export function ConnectionConfigProvider({
    children,
}: {
    children: ReactNode;
}) {
    const isNativeHost = Runtime.isNativeHost;
    const {
        preferences: {
            connectionProfiles,
            activeConnectionProfileId,
        },
        setConnectionProfiles,
        setActiveConnectionProfileId,
    } = usePreferences();

    const baseProfiles = useMemo<ConnectionProfile[]>(() => {
        if (connectionProfiles && connectionProfiles.length) {
            return connectionProfiles;
        }
        return [createDefaultProfile()];
    }, [connectionProfiles]);

    const activeProfileId = useMemo(() => {
        if (
            activeConnectionProfileId &&
            baseProfiles.some((profile) => profile.id === activeConnectionProfileId)
        ) {
            return activeConnectionProfileId;
        }
        return baseProfiles[0]?.id ?? DEFAULT_PROFILE_ID;
    }, [activeConnectionProfileId, baseProfiles]);

    useEffect(() => {
        if (!connectionProfiles.length) {
            setConnectionProfiles(baseProfiles);
        }
    }, [connectionProfiles.length, baseProfiles, setConnectionProfiles]);

    useEffect(() => {
        if (!activeConnectionProfileId && baseProfiles.length > 0) {
            setActiveConnectionProfileId(baseProfiles[0].id);
        }
    }, [activeConnectionProfileId, baseProfiles, setActiveConnectionProfileId]);

    useEffect(() => {
        if (
            activeConnectionProfileId &&
            !baseProfiles.some((profile) => profile.id === activeConnectionProfileId)
        ) {
            setActiveConnectionProfileId(baseProfiles[0].id);
        }
    }, [
        activeConnectionProfileId,
        baseProfiles,
        setActiveConnectionProfileId,
    ]);

    const initialNativeOverride = useMemo(() => detectNativeInfo(), []);
    //TODO: check this block below if not out of date
    const [nativeOverride, setNativeOverride] = useState<NativeOverride>(
        initialNativeOverride
    );

    const addProfile = useCallback(() => {
        const newProfile: ConnectionProfile = {
            id: generateId(),
            label: `Connection ${baseProfiles.length + 1}`,
            scheme: DEFAULT_RPC_SCHEME,
            host: DEFAULT_RPC_HOST,
            port: DEFAULT_RPC_PORT,
            username: "",
            password: "",
        };
        setConnectionProfiles([...baseProfiles, newProfile]);
        setActiveConnectionProfileId(newProfile.id);
    }, [
        baseProfiles,
        setConnectionProfiles,
        setActiveConnectionProfileId,
    ]);

    const removeProfile = useCallback(
        (id: string) => {
            if (baseProfiles.length === 1) return;
            const next = baseProfiles.filter((profile) => profile.id !== id);
            const fallback =
                next.length === 0 ? [createDefaultProfile()] : next;
            setConnectionProfiles(fallback);
            if (activeProfileId === id) {
                setActiveConnectionProfileId(fallback[0].id);
            }
        },
        [
            baseProfiles,
            activeProfileId,
            setConnectionProfiles,
            setActiveConnectionProfileId,
        ]
    );

    const updateProfile = useCallback(
        (id: string, patch: Partial<Omit<ConnectionProfile, "id">>) => {
            setConnectionProfiles(
                baseProfiles.map((profile) =>
                    profile.id === id ? { ...profile, ...patch } : profile
                )
            );
        },
        [baseProfiles, setConnectionProfiles]
    );

    const baseActiveProfile = useMemo(() => {
        return (
            baseProfiles.find((profile) => profile.id === activeProfileId) ??
            baseProfiles[0] ??
            createDefaultProfile()
        );
    }, [baseProfiles, activeProfileId]);

    const shouldApplyNativeOverride = useMemo(() => {
        if (!isNativeHost || activeProfileId !== DEFAULT_PROFILE_ID) {
            return false;
        }
        const hostOverride =
            baseActiveProfile.host.trim().toLowerCase() !== DEFAULT_RPC_HOST;
        const portOverride = baseActiveProfile.port.trim() !== DEFAULT_RPC_PORT;
        const userOverride =
            hostOverride ||
            portOverride ||
            Boolean(baseActiveProfile.username.trim()) ||
            Boolean(baseActiveProfile.password.trim());
        return !userOverride;
    }, [activeProfileId, baseActiveProfile, isNativeHost]);
    // TODO: After removing ConnectionProfile.token, remove tokenOverride from this decision; native overrides should be blocked only when the user explicitly set host/port/scheme/credentials.

    const activeProfile = useMemo(() => {
        if (shouldApplyNativeOverride) {
            return {
                ...baseActiveProfile,
                host: nativeOverride.host ?? DEFAULT_RPC_HOST,
                port: nativeOverride.port ?? DEFAULT_RPC_PORT,
                scheme: nativeOverride.scheme ?? DEFAULT_RPC_SCHEME,
            };
        }
        return baseActiveProfile;
    }, [baseActiveProfile, nativeOverride, shouldApplyNativeOverride]);
    // TODO: After removing token support, drop `token` merge logic entirely; keep only endpoint overrides (host/port/scheme) where applicable.

    const setActiveProfileId = useCallback(
        (id: string) => {
            setActiveConnectionProfileId(id);
        },
        [setActiveConnectionProfileId]
    );

    const value = useMemo(
        () => ({
            profiles: baseProfiles,
            activeProfileId,
            activeProfile,
            setActiveProfileId,
            addProfile,
            removeProfile,
            updateProfile,
        }),
        [
            baseProfiles,
            activeProfileId,
            activeProfile,
            setActiveProfileId,
            addProfile,
            removeProfile,
            updateProfile,
        ]
    );

    return (
        <ConnectionConfigContext.Provider value={value}>
            {children}
        </ConnectionConfigContext.Provider>
    );
}

export function useConnectionConfig() {
    const context = useContext(ConnectionConfigContext);
    if (!context) {
        throw new Error(
            "useConnectionConfig must be used within ConnectionConfigProvider"
        );
    }
    return context;
}
