export type ConnectionScheme = "http" | "https";

export type ConnectionOverride = {
    host?: string;
    port?: string;
    scheme?: ConnectionScheme;
    token?: string;
};

const STORAGE_KEY = "tiny-torrent.connection.override";

const readRawOverride = (): ConnectionOverride | null => {
    if (typeof window === "undefined") {
        return null;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }
    try {
        return JSON.parse(stored) as ConnectionOverride;
    } catch {
        return null;
    }
};

const persistOverride = (override: ConnectionOverride | null) => {
    if (typeof window === "undefined") {
        return;
    }
    if (!override || Object.keys(override).length === 0) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(override));
};

export const storeConnectionOverride = (override: ConnectionOverride) => {
    if (typeof window === "undefined") {
        return;
    }
    const existing = readRawOverride();
    const next = { ...(existing ?? {}), ...override };
    persistOverride(next);
};

export const consumeConnectionOverride = (): ConnectionOverride | null => {
    if (typeof window === "undefined") {
        return null;
    }
    const stored = readRawOverride();
    window.sessionStorage.removeItem(STORAGE_KEY);
    return stored;
};

export const captureConnectionOverrideFromSearch = () => {
    if (typeof window === "undefined") {
        return;
    }
    const params = new URLSearchParams(window.location.search);
    const override: ConnectionOverride = {};
    const host = params.get("host");
    const port = params.get("port");
    const scheme = params.get("scheme");
    const token = params.get("token");
    if (host) {
        override.host = host;
        params.delete("host");
    }
    if (port) {
        override.port = port;
        params.delete("port");
    }
    if (scheme === "https" || scheme === "http") {
        override.scheme = scheme;
        params.delete("scheme");
    }
    if (token) {
        override.token = token;
        params.delete("token");
        window.sessionStorage.setItem("tt-auth-token", token);
    }
    if (Object.keys(override).length === 0) {
        return;
    }
    storeConnectionOverride(override);
    const newSearch = params.toString();
    const query = newSearch ? `?${newSearch}` : "";
    const newUrl = `${window.location.pathname}${query}${window.location.hash}`;
    try {
        window.history.replaceState(null, "", newUrl);
    } catch {
        // ignore
    }
};

export const captureTokenFromHash = () => {
    if (typeof window === "undefined") {
        return;
    }
    const hash = window.location.hash;
    if (!hash || hash.length < 2) {
        return;
    }
    const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
    const params = new URLSearchParams(fragment);
    const token = params.get("tt-token");
    if (!token) {
        return;
    }
    params.delete("tt-token");
    const newFragment = params.toString();
    const newUrl =
        window.location.pathname +
        window.location.search +
        (newFragment ? `#${newFragment}` : "");
    try {
        window.history.replaceState(null, "", newUrl);
    } catch {
        // ignore
    }
    window.sessionStorage.setItem("tt-auth-token", token);
    storeConnectionOverride({ token });
};
