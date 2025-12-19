import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import type { ReactNode } from "react";
import constants from "../../config/constants.json";

export interface ConnectionProfile {
    id: string;
    label: string;
    scheme: "http" | "https";
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
const DEFAULT_PROFILE_ID = "default-connection";
const DEFAULT_PROFILE_LABEL = "Local Transmission";

const DEFAULT_RPC_PATH = constants.defaults.rpc_endpoint;
const NORMALIZED_RPC_PATH = DEFAULT_RPC_PATH.startsWith("/")
    ? DEFAULT_RPC_PATH
    : `/${DEFAULT_RPC_PATH}`;
const DEFAULT_RPC_HOST = "localhost";
const DEFAULT_RPC_PORT = "9091";
const DEFAULT_RPC_SCHEME: ConnectionProfile["scheme"] = "http";
const DEFAULT_USERNAME = import.meta.env.VITE_RPC_USERNAME ?? "";
const DEFAULT_PASSWORD = import.meta.env.VITE_RPC_PASSWORD ?? "";
const DEFAULT_RPC_TOKEN = import.meta.env.VITE_RPC_TOKEN ?? "";

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
        scheme =
            url.protocol.replace(":", "") === "https" ? "https" : "http";
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

const sanitizeProfile = (raw: unknown, fallbackLabel: string): ConnectionProfile | null => {
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
        typeof entry.username === "string"
            ? entry.username
            : DEFAULT_USERNAME;
    const password =
        typeof entry.password === "string"
            ? entry.password
            : DEFAULT_PASSWORD;
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
        return sanitized;
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
    const initialProfiles = useMemo(() => loadProfiles(), []);
    const [profiles, setProfiles] = useState<ConnectionProfile[]>(initialProfiles);
    const [activeProfileId, setActiveProfileId] = useState<string>(
        () => loadActiveProfileId(initialProfiles)
    );

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

    const addProfile = useCallback(() => {
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
            if (profiles.length === 1) return;
            const next = profiles.filter((profile) => profile.id !== id);
            const fallback = next.length === 0 ? [createDefaultProfile()] : next;
            setProfiles(fallback);
            if (activeProfileId === id) {
                setActiveProfileId(fallback[0].id);
            }
        },
        [profiles, activeProfileId]
    );

    const updateProfile = useCallback(
        (id: string, patch: Partial<Omit<ConnectionProfile, "id">>) => {
            setProfiles((prev) =>
                prev.map((profile) =>
                    profile.id === id ? { ...profile, ...patch } : profile
                )
            );
        },
        []
    );

    const activeProfile = useMemo(() => {
        return (
            profiles.find((profile) => profile.id === activeProfileId) ??
            profiles[0] ??
            createDefaultProfile()
        );
    }, [profiles, activeProfileId]);

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
