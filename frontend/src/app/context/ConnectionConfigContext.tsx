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

type ConnectionScheme = "http" | "https";

type NativeOverride = {
    host?: string;
    port?: string;
    scheme?: ConnectionScheme;
};

// TODO: If the ShellAgent needs to override the RPC endpoint, keep only `{host,port,scheme}` and document:
// TODO: - precedence (native override vs selected profile)
// TODO: - scope (default profile only vs any profile)
// TODO: - when it applies (native host only, never in browser)

export interface ConnectionProfile {
    id: string;
    label: string;
    scheme: ConnectionScheme;
    host: string;
    port: string;
    username: string;
    password: string;
}
// TODO: Remove `token` from ConnectionProfile entirely. Transmission RPC does not use a custom token; only Basic Auth (username/password) + X-Transmission-Session-Id handled by the transport.
// TODO: After removal, delete all UI strings/fields for token entry and remove env var `VITE_RPC_TOKEN` usage.
// TODO: Migration detail: when loading stored profiles, tolerate legacy `token` fields but ignore them; ensure no “hidden auth state” survives in sessionStorage/localStorage.

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
// TODO: i18n/ownership: do not embed English labels as magic strings. If we keep legacy matching, centralize them behind an internal constant and document that they are *data migration keys* (not UI text).
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
    return {
        id,
        label,
        scheme,
        host,
        port,
        username,
        password,
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
    const isNativeHost = Runtime.isNativeHost;
    const initialProfiles = useMemo(() => loadProfiles(), []);
    const [profiles, setProfiles] =
        useState<ConnectionProfile[]>(initialProfiles);
    const [activeProfileId, setActiveProfileId] = useState<string>(() => {
        if (isNativeHost) {
            const fallback =
                initialProfiles.find(
                    (profile) => profile.id === DEFAULT_PROFILE_ID
                ) ??
                initialProfiles[0] ??
                createDefaultProfile();
            return fallback.id;
        }
        return loadActiveProfileId(initialProfiles);
    });
    const initialNativeOverride = useMemo(() => detectNativeInfo(), []);
    //TODO: check this block below if not out of date
    const [nativeOverride, setNativeOverride] = useState<NativeOverride>(
        initialNativeOverride
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
        };
        setProfiles((prev) => [...prev, newProfile]);
        setActiveProfileId(newProfile.id);
    }, [profiles.length]);

    const removeProfile = useCallback(
        (id: string) => {
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
