/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import Runtime from "@/app/runtime";
import { usePreferencesConnectionConfig } from "@/app/context/PreferencesContext";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import {
    DEFAULT_PROFILE_ID,
    buildRpcEndpoint,
    buildRpcServerUrl,
} from "@/app/context/connection/endpointAuthority";
import {
    applyNativeEndpointOverride,
    detectNativeEndpointOverride,
    shouldApplyNativeEndpointOverride,
} from "@/app/context/connection/nativeProfileOverride";
import { useConnectionProfileStore } from "@/app/context/connection/useConnectionProfileStore";

interface ConnectionConfigContextValue {
    profiles: ConnectionProfile[];
    activeProfileId: string;
    activeProfile: ConnectionProfile;
    activeRpcConnection: {
        endpoint: string;
        serverUrl: string;
        username: string;
        password: string;
    };
    setActiveProfileId: (id: string) => void;
    addProfile: () => void;
    removeProfile: (id: string) => void;
    updateProfile: (
        id: string,
        patch: Partial<Omit<ConnectionProfile, "id">>,
    ) => void;
}

export { DEFAULT_PROFILE_ID, buildRpcEndpoint, buildRpcServerUrl };

const ConnectionConfigContext = createContext<
    ConnectionConfigContextValue | undefined
>(undefined);

export function ConnectionConfigProvider({
    children,
}: {
    children: ReactNode;
}) {
    const {
        preferences: { connectionProfiles, activeConnectionProfileId },
        setConnectionProfiles,
        setActiveProfileId: setActiveProfileId,
    } = usePreferencesConnectionConfig();

    const store = useConnectionProfileStore({
        connectionProfiles,
        activeConnectionProfileId,
        setConnectionProfiles,
        setActiveProfileId: setActiveProfileId,
    });
    const nativeOverride = useMemo(() => detectNativeEndpointOverride(), []);

    const activeProfile = useMemo(() => {
        const shouldApply = shouldApplyNativeEndpointOverride({
            isNativeHost: Runtime.isNativeHost,
            activeProfileId: store.activeProfileId,
            profile: store.activeProfile,
        });
        if (!shouldApply) {
            return store.activeProfile;
        }
        return applyNativeEndpointOverride({
            profile: store.activeProfile,
            nativeOverride,
        });
    }, [nativeOverride, store.activeProfile, store.activeProfileId]);
    const activeRpcConnection = useMemo(
        () => ({
            endpoint: buildRpcEndpoint(activeProfile),
            serverUrl: buildRpcServerUrl(activeProfile),
            username: activeProfile.username.trim(),
            password: activeProfile.password,
        }),
        [activeProfile],
    );

    const value = useMemo(
        () => ({
            profiles: store.profiles,
            activeProfileId: store.activeProfileId,
            activeProfile,
            activeRpcConnection,
            setActiveProfileId: store.setActiveProfileId,
            addProfile: store.addProfile,
            removeProfile: store.removeProfile,
            updateProfile: store.updateProfile,
        }),
        [
            activeProfile,
            activeRpcConnection,
            store.activeProfileId,
            store.addProfile,
            store.profiles,
            store.removeProfile,
            store.setActiveProfileId,
            store.updateProfile,
        ],
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
            "useConnectionConfig must be used within ConnectionConfigProvider",
        );
    }
    return context;
}
