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
import Runtime, { NativeShell } from "@/app/runtime";

type ConnectionScheme = "http" | "https";

type NativeOverride = {
    host?: string;
    port?: string;
    scheme?: ConnectionScheme;
    token?: string;
};

export interface ConnectionProfile {
    id: string;
    label: string;
    scheme: ConnectionScheme;
    host: string;
    port: string;
    username: string;
    password: string;
    token: string;
}

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

const STORAGE_KEY = "tiny-torrent.connection.profiles";
const ACTIVE_KEY = "tiny-torrent.connection.active";
export const DEFAULT_PROFILE_ID = "default-connection";
const LEGACY_DEFAULT_PROFILE_LABELS = new Set([
    "Local Transmission",
    "Local server",
]);
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
const DEFAULT_RPC_TOKEN = import.meta.env.VITE_RPC_TOKEN ?? "";

const detectNativeInfo = (): NativeOverride => {
    if (typeof window === "undefined") {
        return {};
    }
    const info =
        (window as
            typeof globalThis & {
                __TINY_TORRENT_NATIVE_INFO__?: Record<string, unknown>;
            }).__TINY_TORRENT_NATIVE_INFO__;
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
    const token =
        typeof info.token === "string" && info.token
            ? info.token
            : undefined;
    return { host, port, scheme, token };
};

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
    token: DEFAULT_RPC_TOKEN,
});

const generateId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);

const sanitizeProfile = (
    raw: unknown,
    fallbackLabel: string
): ConnectionProfile | null => {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const entry = raw as Record<string, unknown>;
    const parsed = parseRpcEndpoint(
        typeof entry.endpoint === "string" ? entry.endpoint : undefined
    );
    const host =
        typeof entry.host === "string" && entry.host.trim()
            ? entry.host.trim()
            : parsed.host;
    const port =
        typeof entry.port === "string" && entry.port.trim()
            ? entry.port.trim()
            : parsed.port;
    const scheme =
        entry.scheme === "https"
            ? "https"
            : entry.scheme === "http"
            ? "http"
            : parsed.scheme;
    const id =
        typeof entry.id === "string" && entry.id.trim()
            ? entry.id
            : `${DEFAULT_PROFILE_ID}-${generateId()}`;
    const label =
        typeof entry.label === "string" && entry.label.trim()
            ? entry.label.trim()
            : fallbackLabel;
    const username =
        typeof entry.username === "string" ? entry.username : DEFAULT_USERNAME;
    const password =
        typeof entry.password === "string" ? entry.password : DEFAULT_PASSWORD;
    const token =
        typeof entry.token === "string" && entry.token.trim()
            ? entry.token.trim()
            : DEFAULT_RPC_TOKEN;
    return {
        id,
        label,
        scheme,
        host,
        port,
        username,
        password,
        token,
    };
};

const loadProfiles = (): ConnectionProfile[] => {
    if (typeof window === "undefined") {
        return [createDefaultProfile()];
    }
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return [createDefaultProfile()];
        }
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [createDefaultProfile()];
        }
        const sanitized = parsed
            .map((raw, index) =>
                sanitizeProfile(raw, `Connection ${index + 1}`)
            )
            .filter(Boolean) as ConnectionProfile[];
        if (sanitized.length === 0) {
            return [createDefaultProfile()];
        }
        const migrated = sanitized.map((profile) => {
            if (
                profile.id === DEFAULT_PROFILE_ID &&
                LEGACY_DEFAULT_PROFILE_LABELS.has(profile.label)
            ) {
                return { ...profile, label: DEFAULT_PROFILE_LABEL };
            }
            return profile;
        });
        return migrated;
    } catch {
        return [createDefaultProfile()];
    }
};

const loadActiveProfileId = (profiles: ConnectionProfile[]): string => {
    if (typeof window === "undefined") {
        return profiles[0].id;
    }
    const stored = window.localStorage.getItem(ACTIVE_KEY);
    if (stored && profiles.some((profile) => profile.id === stored)) {
        return stored;
    }
    return profiles[0].id;
};

const ConnectionConfigContext = createContext<
    ConnectionConfigContextValue | undefined
>(undefined);

export function ConnectionConfigProvider({
    children,
}: {
    children: ReactNode;
}) {
    const initialProfiles = useMemo(
        () =>
            Runtime.allowEditingProfiles()
                ? loadProfiles()
                : [createDefaultProfile()],
        []
    );
    const [profiles, setProfiles] =
        useState<ConnectionProfile[]>(initialProfiles);
    const [activeProfileId, setActiveProfileId] = useState<string>(() =>
        !Runtime.allowEditingProfiles()
            ? initialProfiles[0].id
            : loadActiveProfileId(initialProfiles)
    );
    const initialNativeOverride = useMemo(() => detectNativeInfo(), []);
    const [nativeOverride, setNativeOverride] =
        useState<NativeOverride>(initialNativeOverride);

    useEffect(() => {
        if (!profiles.find((profile) => profile.id === activeProfileId)) {
            setActiveProfileId(profiles[0]?.id ?? DEFAULT_PROFILE_ID);
        }
    }, [profiles, activeProfileId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    }, [profiles]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(ACTIVE_KEY, activeProfileId);
    }, [activeProfileId]);

    useEffect(() => {
        const unsubscribe = NativeShell.onEvent("auth-token", (payload) => {
            setNativeOverride((prev) => {
                if (typeof payload === "string") {
                    return {
                        ...prev,
                        token: payload || undefined,
                    };
                }
                if (payload && typeof payload === "object" && !Array.isArray(payload)) {
                    const data = payload as Record<string, unknown>;
                    const host =
                        typeof data.host === "string" && data.host.trim()
                            ? data.host.trim()
                            : prev.host;
                    const port =
                        typeof data.port === "string" && data.port.trim()
                            ? data.port.trim()
                            : prev.port;
                    const scheme =
                        data.scheme === "https"
                            ? "https"
                            : data.scheme === "http"
                            ? "http"
                            : prev.scheme;
                    const token =
                        typeof data.token === "string" && data.token
                            ? data.token
                            : prev.token;
                    return {
                        host,
                        port,
                        scheme,
                        token,
                    };
                }
                return prev;
            });
        });
        return unsubscribe;
    }, []);

    const addProfile = useCallback(() => {
        if (!Runtime.allowEditingProfiles()) return; // disabled in native host
        const newProfile: ConnectionProfile = {
            id: generateId(),
            label: `Connection ${profiles.length + 1}`,
            scheme: DEFAULT_RPC_SCHEME,
            host: DEFAULT_RPC_HOST,
            port: DEFAULT_RPC_PORT,
            username: "",
            password: "",
            token: "",
        };
        setProfiles((prev) => [...prev, newProfile]);
        setActiveProfileId(newProfile.id);
    }, [profiles.length]);

    const removeProfile = useCallback(
        (id: string) => {
            if (!Runtime.allowEditingProfiles()) return; // disabled in native host
            if (profiles.length === 1) return;
            const next = profiles.filter((profile) => profile.id !== id);
            const fallback =
                next.length === 0 ? [createDefaultProfile()] : next;
            setProfiles(fallback);
            if (activeProfileId === id) {
                setActiveProfileId(fallback[0].id);
            }
        },
        [profiles, activeProfileId]
    );

    const updateProfile = useCallback(
        (id: string, patch: Partial<Omit<ConnectionProfile, "id">>) => {
            if (!Runtime.allowEditingProfiles()) return; // Prevent editing profiles in native/local mode
            setProfiles((prev) =>
                prev.map((profile) =>
                    profile.id === id ? { ...profile, ...patch } : profile
                )
            );
        },
        []
    );

    const baseActiveProfile = useMemo(() => {
        return (
            profiles.find((profile) => profile.id === activeProfileId) ??
            profiles[0] ??
            createDefaultProfile()
        );
    }, [profiles, activeProfileId]);

    const activeProfile = useMemo(() => {
        if (!Runtime.allowEditingProfiles()) {
            return {
                ...baseActiveProfile,
                host: nativeOverride.host ?? DEFAULT_RPC_HOST,
                port: nativeOverride.port ?? DEFAULT_RPC_PORT,
                scheme: nativeOverride.scheme ?? DEFAULT_RPC_SCHEME,
                token: nativeOverride.token ?? baseActiveProfile.token,
            };
        }
        return baseActiveProfile;
    }, [baseActiveProfile, nativeOverride]);

    const value = useMemo(
        () => ({
            profiles,
            activeProfileId,
            activeProfile,
            setActiveProfileId,
            addProfile,
            removeProfile,
            updateProfile,
        }),
        [
            profiles,
            activeProfileId,
            activeProfile,
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
