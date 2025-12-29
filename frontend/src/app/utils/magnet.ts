const MAGNET_SCHEME = "magnet:";

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
