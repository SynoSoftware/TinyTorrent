export const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`;

export const formatTime = (seconds: number) => {
    if (seconds < 0) return "?";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
};

export const formatDurationMs = (ms: number) => {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return secs === 0
        ? `${mins}m`
        : `${mins}:${String(secs).padStart(2, "0")}m`;
};

export const formatEtaAbsolute = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "-";
    const date = new Date(Date.now() + seconds * 1000);
    return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

export const formatDate = (timestamp: number) => {
    if (!timestamp || timestamp <= 0) return "-";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "2-digit",
    }).format(new Date(timestamp * 1000));
};

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
});

const RELATIVE_UNITS: Array<{
    limit: number;
    value: number;
    unit: Intl.RelativeTimeFormatUnit;
}> = [
    { limit: 60, value: 1, unit: "second" },
    { limit: 3600, value: 60, unit: "minute" },
    { limit: 86400, value: 3600, unit: "hour" },
    { limit: 604800, value: 86400, unit: "day" },
    { limit: Number.POSITIVE_INFINITY, value: 604800, unit: "week" },
];

export const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp || timestamp <= 0) return "-";
    const now = Math.floor(Date.now() / 1000);
    const delta = timestamp - now;
    const absDelta = Math.abs(delta);
    const unit =
        RELATIVE_UNITS.find((entry) => absDelta < entry.limit) ??
        RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
    const amount = Math.round(delta / unit.value);
    return relativeFormatter.format(amount, unit.unit);
};

export const formatPercent = (value: number, digits = 1) =>
    `${Number.isFinite(value) ? value.toFixed(digits) : "0"}%`;

export const formatRatio = (value: number, digits = 2) =>
    `${Number.isFinite(value) ? value.toFixed(digits) : "-"}`;
