import type { DaemonPathStyle } from "@/services/rpc/types";

const hasControlChars = (value: string): boolean => /[\u0000-\u001F]/.test(value);
const WINDOWS_INVALID_SEGMENT_CHAR_PATTERN = /[<>:"|?*\u0000-\u001F]/;
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
]);

const isLikelyWindowsUncPath = (
    trimmed: string,
    slashNormalized: string,
): boolean =>
    trimmed.startsWith("\\\\") ||
    /^\/\/[^/]+\/[^/]+(?:\/.*)?$/.test(slashNormalized);

export const normalizePathForComparison = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    const slashNormalized = trimmed.replace(/\\/g, "/");
    const windowsDriveMatch = slashNormalized.match(/^([a-zA-Z]):(\/.*)?$/);
    if (windowsDriveMatch) {
        const drive = windowsDriveMatch[1].toLowerCase();
        const rest = (windowsDriveMatch[2] ?? "/").replace(/\/+/g, "/");
        if (rest === "/") {
            return `${drive}:/`;
        }
        return `${drive}:${rest.replace(/\/+$/g, "")}`.toLowerCase();
    }

    if (isLikelyWindowsUncPath(trimmed, slashNormalized)) {
        const collapsed = slashNormalized.replace(/\/+/g, "/");
        return collapsed.replace(/\/+$/g, "").toLowerCase();
    }

    const collapsed = slashNormalized.replace(/\/+/g, "/");
    if (collapsed === "/") {
        return collapsed;
    }

    return collapsed.replace(/\/+$/g, "");
};

export const isPathMatch = (leftPath: string, rightPath: string): boolean =>
    normalizePathForComparison(leftPath) ===
    normalizePathForComparison(rightPath);

export const isAbsolutePath = (path: string, pathStyle: DaemonPathStyle): boolean => {
    const trimmed = path.trim();
    if (!trimmed || hasControlChars(trimmed)) {
        return false;
    }

    if (pathStyle === "windows") {
        return (
            /^[a-zA-Z]:[\\/]/.test(trimmed) ||
            /^\\\\[^\\\/]+[\\\/][^\\\/]+(?:[\\\/].*)?$/.test(trimmed)
        );
    }
    if (pathStyle === "posix") {
        return trimmed.startsWith("/");
    }
    return false;
};

export const extractWindowsRoot = (path: string): string | null => {
    const trimmed = path.trim();
    if (!trimmed) {
        return null;
    }

    const backslashNormalized = trimmed.replace(/\//g, "\\");
    const driveMatch = backslashNormalized.match(/^([a-zA-Z]):(?:\\|$)/);
    if (driveMatch) {
        return `${driveMatch[1].toLowerCase()}:\\`;
    }

    if (!backslashNormalized.startsWith("\\\\")) {
        return null;
    }

    const segments = backslashNormalized
        .slice(2)
        .split("\\")
        .filter((segment) => segment.length > 0);
    if (segments.length < 2) {
        return null;
    }

    return `\\\\${segments[0].toLowerCase()}\\${segments[1].toLowerCase()}`;
};

const isWindowsSegmentSyntacticallyValid = (segment: string): boolean => {
    if (!segment || segment === "." || segment === "..") {
        return true;
    }
    if (segment.endsWith(" ") || segment.endsWith(".")) {
        return false;
    }
    if (WINDOWS_INVALID_SEGMENT_CHAR_PATTERN.test(segment)) {
        return false;
    }
    const basename = segment.split(".")[0]?.toUpperCase() ?? "";
    return !WINDOWS_RESERVED_DEVICE_NAMES.has(basename);
};

export const isWindowsPathSyntacticallyValid = (path: string): boolean => {
    const trimmed = path.trim();
    const root = extractWindowsRoot(trimmed);
    if (!root) {
        return false;
    }

    const normalized = trimmed.replace(/\//g, "\\");
    let remainder = "";
    if (root.startsWith("\\\\")) {
        if (!normalized.toLowerCase().startsWith(root.toLowerCase())) {
            return false;
        }
        remainder = normalized.slice(root.length);
    } else {
        remainder = normalized.slice(root.length);
    }

    const segments = remainder.split(/\\+/).filter((segment) => segment.length > 0);
    return segments.every(isWindowsSegmentSyntacticallyValid);
};
