import { useCallback, useEffect, useMemo } from "react";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import { createDefaultProfile } from "@/app/context/connection/endpointAuthority";

const generateId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);

type UseConnectionProfileStoreParams = {
    connectionProfiles: ConnectionProfile[];
    activeConnectionProfileId: string;
    setConnectionProfiles: (profiles: ConnectionProfile[]) => void;
    setActiveProfileId: (id: string) => void;
};

export type ConnectionProfileStore = {
    profiles: ConnectionProfile[];
    activeProfileId: string;
    activeProfile: ConnectionProfile;
    setActiveProfileId: (id: string) => void;
    addProfile: () => void;
    removeProfile: (id: string) => void;
    updateProfile: (
        id: string,
        patch: Partial<Omit<ConnectionProfile, "id">>,
    ) => void;
};

export function useConnectionProfileStore({
    connectionProfiles,
    activeConnectionProfileId,
    setConnectionProfiles,
    setActiveProfileId: setActiveProfileIdState,
}: UseConnectionProfileStoreParams): ConnectionProfileStore {
    const profiles = useMemo<ConnectionProfile[]>(() => {
        if (connectionProfiles && connectionProfiles.length) {
            return connectionProfiles;
        }
        return [createDefaultProfile()];
    }, [connectionProfiles]);

    const activeProfileId = useMemo(() => {
        if (
            activeConnectionProfileId &&
            profiles.some((profile) => profile.id === activeConnectionProfileId)
        ) {
            return activeConnectionProfileId;
        }
        return profiles[0]?.id ?? createDefaultProfile().id;
    }, [activeConnectionProfileId, profiles]);

    useEffect(() => {
        if (!connectionProfiles.length) {
            setConnectionProfiles(profiles);
        }
    }, [connectionProfiles.length, profiles, setConnectionProfiles]);

    useEffect(() => {
        if (!activeConnectionProfileId && profiles.length > 0) {
            setActiveProfileIdState(profiles[0].id);
        }
    }, [activeConnectionProfileId, profiles, setActiveProfileIdState]);

    useEffect(() => {
        if (
            activeConnectionProfileId &&
            !profiles.some(
                (profile) => profile.id === activeConnectionProfileId,
            )
        ) {
            setActiveProfileIdState(profiles[0].id);
        }
    }, [activeConnectionProfileId, profiles, setActiveProfileIdState]);

    const setActiveProfileId = useCallback(
        (id: string) => {
            setActiveProfileIdState(id);
        },
        [setActiveProfileIdState],
    );

    const addProfile = useCallback(() => {
        const newProfile: ConnectionProfile = {
            ...createDefaultProfile(),
            id: generateId(),
            label: `Connection ${profiles.length + 1}`,
            username: "",
            password: "",
        };
        setConnectionProfiles([...profiles, newProfile]);
        setActiveProfileId(newProfile.id);
    }, [profiles, setActiveProfileId, setConnectionProfiles]);

    const removeProfile = useCallback(
        (id: string) => {
            if (profiles.length === 1) return;
            const next = profiles.filter((profile) => profile.id !== id);
            const fallback =
                next.length === 0 ? [createDefaultProfile()] : next;
            setConnectionProfiles(fallback);
            if (activeProfileId === id) {
                setActiveProfileId(fallback[0].id);
            }
        },
        [activeProfileId, profiles, setActiveProfileId, setConnectionProfiles],
    );

    const updateProfile = useCallback(
        (id: string, patch: Partial<Omit<ConnectionProfile, "id">>) => {
            setConnectionProfiles(
                profiles.map((profile) =>
                    profile.id === id ? { ...profile, ...patch } : profile,
                ),
            );
        },
        [profiles, setConnectionProfiles],
    );

    const activeProfile = useMemo(() => {
        return (
            profiles.find((profile) => profile.id === activeProfileId) ??
            profiles[0] ??
            createDefaultProfile()
        );
    }, [profiles, activeProfileId]);

    return {
        profiles,
        activeProfileId,
        activeProfile,
        setActiveProfileId,
        addProfile,
        removeProfile,
        updateProfile,
    };
}
