import type {
    ConnectionProfile,
    ConnectionScheme,
} from "@/app/types/connection-profile";
import {
    DEFAULT_PROFILE_ID,
    DEFAULT_RPC_HOST,
    DEFAULT_RPC_PORT,
    DEFAULT_RPC_SCHEME,
} from "@/app/context/connection/endpointAuthority";

export type NativeEndpointOverride = {
    host?: string;
    port?: string;
    scheme?: ConnectionScheme;
};

export const detectNativeEndpointOverride = (): NativeEndpointOverride => {
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

export const shouldApplyNativeEndpointOverride = ({
    isNativeHost,
    activeProfileId,
    profile,
}: {
    isNativeHost: boolean;
    activeProfileId: string;
    profile: ConnectionProfile;
}) => {
    if (!isNativeHost || activeProfileId !== DEFAULT_PROFILE_ID) {
        return false;
    }

    const hostOverride = profile.host.trim().toLowerCase() !== DEFAULT_RPC_HOST;
    const portOverride = profile.port.trim() !== DEFAULT_RPC_PORT;
    const userOverride =
        hostOverride ||
        portOverride ||
        Boolean(profile.username.trim()) ||
        Boolean(profile.password.trim());
    return !userOverride;
};

export const applyNativeEndpointOverride = ({
    profile,
    nativeOverride,
}: {
    profile: ConnectionProfile;
    nativeOverride: NativeEndpointOverride;
}): ConnectionProfile => ({
    ...profile,
    host: nativeOverride.host ?? DEFAULT_RPC_HOST,
    port: nativeOverride.port ?? DEFAULT_RPC_PORT,
    scheme: nativeOverride.scheme ?? DEFAULT_RPC_SCHEME,
});
