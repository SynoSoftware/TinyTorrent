import { registry } from "@/config/logic";
import type {
    ConnectionProfile,
    ConnectionScheme,
} from "@/app/types/connection-profile";
const { defaults } = registry;

export const DEFAULT_PROFILE_ID = "default-connection";
export const DEFAULT_PROFILE_LABEL = "";
export const DEFAULT_RPC_HOST = "localhost";
export const DEFAULT_RPC_PORT = "9091";
export const DEFAULT_RPC_SCHEME: ConnectionScheme = "http";
export const DEFAULT_RPC_PATH = defaults.rpcEndpoint;
export const NORMALIZED_RPC_PATH = DEFAULT_RPC_PATH.startsWith("/")
    ? DEFAULT_RPC_PATH
    : `/${DEFAULT_RPC_PATH}`;
export const DEFAULT_USERNAME = import.meta.env.VITE_RPC_USERNAME ?? "";
export const DEFAULT_PASSWORD = import.meta.env.VITE_RPC_PASSWORD ?? "";

export const parseRpcEndpoint = (
    raw?: string,
): { host: string; port: string; scheme: ConnectionScheme } => {
    let host = DEFAULT_RPC_HOST;
    let port = DEFAULT_RPC_PORT;
    let scheme: ConnectionScheme = DEFAULT_RPC_SCHEME;
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

const resolveHostAndPort = (profile: ConnectionProfile) => {
    const validHost = profile.host.trim() || DEFAULT_RPC_HOST;
    const portNumber = Number.parseInt(profile.port, 10);
    const port =
        Number.isFinite(portNumber) && portNumber > 0
            ? String(portNumber)
            : DEFAULT_RPC_PORT;
    const needsBrackets = validHost.includes(":") && !validHost.startsWith("[");
    const host = needsBrackets ? `[${validHost}]` : validHost;
    return { host, port };
};

export const buildRpcEndpoint = (profile: ConnectionProfile) => {
    const { host, port } = resolveHostAndPort(profile);
    return `${profile.scheme}://${host}:${port}${NORMALIZED_RPC_PATH}`;
};

export const buildRpcServerUrl = (profile: ConnectionProfile) => {
    const { host, port } = resolveHostAndPort(profile);
    return `${profile.scheme}://${host}:${port}`;
};

export const createDefaultProfile = (): ConnectionProfile => ({
    id: DEFAULT_PROFILE_ID,
    label: DEFAULT_PROFILE_LABEL,
    scheme: DEFAULT_RPC_SCHEME,
    host: DEFAULT_RPC_HOST,
    port: DEFAULT_RPC_PORT,
    username: DEFAULT_USERNAME,
    password: DEFAULT_PASSWORD,
});

