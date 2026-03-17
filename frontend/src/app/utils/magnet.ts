const MAGNET_SCHEME = "magnet:";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

const base32ToHex = (value: string): string | null => {
    let buffer = 0;
    let bitsInBuffer = 0;
    const bytes: number[] = [];

    for (const char of value.toUpperCase()) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) {
            return null;
        }
        buffer = (buffer << 5) | index;
        bitsInBuffer += 5;
        while (bitsInBuffer >= 8) {
            bitsInBuffer -= 8;
            bytes.push((buffer >> bitsInBuffer) & 0xff);
        }
    }

    if (bytes.length !== 20) {
        return null;
    }

    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const normalizeInfoHashCandidate = (value: string): string | null => {
    if (/^[0-9a-fA-F]{40}$/.test(value)) {
        return value.toLowerCase();
    }

    const decoded = base32ToHex(value);
    if (!decoded) {
        return null;
    }

    return decoded.toLowerCase();
};

export const extractMagnetInfoHashCandidate = (value?: string | null): string | null => {
    const normalized = normalizeMagnetLink(value);
    if (!normalized) {
        return null;
    }

    const queryIndex = normalized.indexOf("?");
    if (queryIndex === -1) {
        return null;
    }

    const query = normalized.slice(queryIndex + 1);
    for (const segment of query.split("&")) {
        const [rawKey, rawValue = ""] = segment.split("=");
        if (rawKey.toLowerCase() !== "xt") {
            continue;
        }

        const decodedValue = safeDecode(rawValue);
        const match = /^urn:btih:(.+)$/i.exec(decodedValue);
        if (!match) {
            continue;
        }

        const infoHash = normalizeInfoHashCandidate(match[1]);
        if (infoHash) {
            return infoHash;
        }
    }

    return null;
};
