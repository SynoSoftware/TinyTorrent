const isWindowsDriveRoot = (value: string) => /^[a-zA-Z]:[/\\]?$/.test(value);

const isUncRoot = (value: string) => /^\\\\[^/\\]+\\[^/\\]+[/\\]?$/.test(value);

export const normalizeDownloadPathHistoryEntry = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed === "/" || isWindowsDriveRoot(trimmed) || isUncRoot(trimmed)) {
        return trimmed.replace(/\//g, "\\");
    }

    return trimmed.replace(/[\\/]+$/, "");
};

export const sanitizeDownloadPathHistory = (
    paths: Iterable<unknown>,
    limit: number,
) => {
    const seen = new Set<string>();
    const next: string[] = [];

    for (const entry of paths) {
        if (typeof entry !== "string") {
            continue;
        }

        const normalized = normalizeDownloadPathHistoryEntry(entry);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        next.push(normalized);
    }

    return next.slice(0, limit);
};

export const mergeDownloadPathHistory = (
    history: string[],
    value: string,
    limit: number,
) => {
    const normalized = normalizeDownloadPathHistoryEntry(value);
    if (!normalized) {
        return sanitizeDownloadPathHistory(history, limit);
    }

    return sanitizeDownloadPathHistory([normalized, ...history], limit);
};
