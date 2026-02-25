import type { DaemonPathStyle } from "@/services/rpc/types";

const hasControlChars = (value: string): boolean => /[\r\n\t]/.test(value);

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
        return `${drive}:${rest.replace(/\/+$/g, "")}`;
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

    const slashNormalized = trimmed.replace(/\\/g, "/");
    const driveMatch = slashNormalized.match(/^([a-zA-Z]):(?:\/|$)/);
    if (driveMatch) {
        return `${driveMatch[1].toLowerCase()}:/`;
    }

    if (!slashNormalized.startsWith("//")) {
        return null;
    }

    const segments = slashNormalized
        .slice(2)
        .split("/")
        .filter((segment) => segment.length > 0);
    if (segments.length < 2) {
        return null;
    }

    return `//${segments[0]}/${segments[1]}`;
};
