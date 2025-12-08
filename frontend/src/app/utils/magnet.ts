const MAGNET_SCHEME = "magnet:";
const MAGNET_QUERY_KEYS = ["magnet", "magnetLink", "url", "link"];

const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

export const normalizeMagnetLink = (value?: string | null) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.toLowerCase().startsWith(MAGNET_SCHEME)) {
        return trimmed;
    }
    const decoded = safeDecode(trimmed);
    if (decoded.toLowerCase().startsWith(MAGNET_SCHEME)) {
        return decoded;
    }
    return undefined;
};

export const findMagnetInString = (value: string) => {
    const lower = value.toLowerCase();
    const index = lower.indexOf(MAGNET_SCHEME);
    if (index === -1) return undefined;
    let candidate = value.slice(index);
    const separators = ["&", "#"];
    separators.forEach((separator) => {
        const separatorIndex = candidate.indexOf(separator);
        if (separatorIndex > 0) {
            candidate = candidate.slice(0, separatorIndex);
        }
    });
    return candidate;
};

const tryExtractMagnetFromSearch = () => {
    if (typeof window === "undefined") return undefined;
    const params = new URLSearchParams(window.location.search);
    for (const key of MAGNET_QUERY_KEYS) {
        const normalized = normalizeMagnetLink(params.get(key));
        if (normalized) {
            return normalized;
        }
    }
    const looseMatch = findMagnetInString(window.location.search);
    return normalizeMagnetLink(looseMatch);
};

const tryExtractMagnetFromHash = () => {
    if (typeof window === "undefined") return undefined;
    const hashBody = window.location.hash.replace(/^#\/?/, "");
    const match = findMagnetInString(hashBody);
    return normalizeMagnetLink(match ?? hashBody);
};

const tryExtractMagnetFromPath = () => {
    if (typeof window === "undefined") return undefined;
    const match = findMagnetInString(window.location.pathname);
    return normalizeMagnetLink(match ?? window.location.pathname);
};

const tryExtractMagnetFromProtocol = () => {
    if (typeof window === "undefined") return undefined;
    if (window.location.protocol === MAGNET_SCHEME) {
        return window.location.href;
    }
    return undefined;
};

const tryExtractMagnetFromArgs = () => {
    const nodeProcess = (
        globalThis as typeof globalThis & {
            process?: { argv?: string[] };
        }
    ).process;
    const args = nodeProcess?.argv;
    if (!args?.length) return undefined;
    for (const arg of args) {
        const direct = normalizeMagnetLink(arg);
        if (direct) {
            return direct;
        }
        const loose = findMagnetInString(arg);
        const normalized = normalizeMagnetLink(loose);
        if (normalized) {
            return normalized;
        }
    }
    return undefined;
};

export const resolveDeepLinkMagnet = () =>
    tryExtractMagnetFromProtocol() ??
    tryExtractMagnetFromSearch() ??
    tryExtractMagnetFromHash() ??
    tryExtractMagnetFromPath() ??
    tryExtractMagnetFromArgs();
