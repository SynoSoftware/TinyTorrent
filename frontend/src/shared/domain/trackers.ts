export interface TrackerInputNormalization {
    normalized: string[];
    invalid: string[];
}

interface TrackerListEntry {
    announce: string;
    tier: number;
}

const TRACKER_LINE_SPLIT = /\r?\n/;

export const trimTrackerUrl = (value: string) => value.trim();

export const splitTrackerInputLines = (value: string) =>
    value
        .split(TRACKER_LINE_SPLIT)
        .map(trimTrackerUrl)
        .filter((line) => line.length > 0);

export const isTrackerUrlValid = (value: string) => {
    try {
        const url = new URL(value);
        return Boolean(url.protocol && (url.hostname || url.pathname));
    } catch {
        return false;
    }
};

export const normalizeTrackerUrls = (values: Iterable<string>) => {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const rawValue of values) {
        const value = trimTrackerUrl(rawValue);
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        normalized.push(value);
    }

    return normalized;
};

export const normalizeTrackerInputText = (
    value: string,
): TrackerInputNormalization => {
    const normalized: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (const line of splitTrackerInputLines(value)) {
        if (!isTrackerUrlValid(line)) {
            invalid.push(line);
            continue;
        }
        if (seen.has(line)) {
            continue;
        }
        seen.add(line);
        normalized.push(line);
    }

    return { normalized, invalid };
};

export const serializeTrackerList = <T extends TrackerListEntry>(
    trackers: readonly T[],
) => {
    if (!trackers.length) {
        return "";
    }

    const ordered = trackers
        .map((tracker, originalIndex) => ({
            announce: trimTrackerUrl(tracker.announce),
            tier: tracker.tier,
            originalIndex,
        }))
        .filter((tracker) => tracker.announce.length > 0)
        .sort((left, right) => {
            if (left.tier !== right.tier) {
                return left.tier - right.tier;
            }
            return left.originalIndex - right.originalIndex;
        });

    const lines: string[] = [];
    let previousTier: number | null = null;

    for (const tracker of ordered) {
        if (previousTier != null && tracker.tier !== previousTier) {
            lines.push("");
        }
        lines.push(tracker.announce);
        previousTier = tracker.tier;
    }

    return lines.join("\n");
};
