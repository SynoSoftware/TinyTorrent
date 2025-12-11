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
    endpoint: string;
    username: string;
    password: string;
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

const defaultEndpoint =
    import.meta.env.VITE_RPC_ENDPOINT ?? constants.defaults.rpc_endpoint;

const createDefaultProfile = (): ConnectionProfile => ({
    id: DEFAULT_PROFILE_ID,
    label: "Local Transmission",
    endpoint: defaultEndpoint,
    username: import.meta.env.VITE_RPC_USERNAME ?? "",
    password: import.meta.env.VITE_RPC_PASSWORD ?? "",
});

const generateId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);

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
            .map((raw) => {
                if (
                    raw &&
                    typeof raw === "object" &&
                    typeof raw.id === "string" &&
                    typeof raw.label === "string" &&
                    typeof raw.endpoint === "string"
                ) {
                    return {
                        id: raw.id,
                        label: raw.label,
                        endpoint: raw.endpoint,
                        username: typeof raw.username === "string" ? raw.username : "",
                        password: typeof raw.password === "string" ? raw.password : "",
                    } as ConnectionProfile;
                }
                return null;
            })
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
        const newProfile = {
            id: generateId(),
            label: `Connection ${profiles.length + 1}`,
            endpoint: defaultEndpoint,
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
