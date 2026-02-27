import type { DaemonPathStyle } from "@/services/rpc/types";
import {
    extractWindowsRoot,
    isAbsolutePath,
    isWindowsPathSyntacticallyValid,
} from "@/shared/utils/pathUtils";

export type DestinationValidationReason =
    | "invalid_format"
    | "invalid_windows_syntax"
    | "root_unreachable"
    | "validation_unavailable";

export type DestinationProbeWarning = "free_space_unavailable";

export type DestinationFreeSpace = {
    path: string;
    sizeBytes: number;
    totalSize?: number;
};

export type DestinationRootProbeResult =
    | {
          ok: true;
          freeSpace?: DestinationFreeSpace;
          probeWarning?: DestinationProbeWarning;
      }
    | { ok: false; reason: "root_unreachable" };

export type DestinationPathEvaluation = {
    rawPath: string;
    normalizedPath: string;
    hasValue: boolean;
    isAbsolute: boolean;
    syntaxValid: boolean;
    resolvedProbeRoot: string | null;
    reason: Exclude<DestinationValidationReason, "root_unreachable"> | null;
};

const normalizePosixProbePath = (path: string): string => {
    const trimmed = path.trim();
    if (!trimmed || trimmed === "/") {
        return "/";
    }
    const withoutTrailing = trimmed.replace(/\/+$/g, "");
    return withoutTrailing || "/";
};

const resolvePosixParentProbePath = (path: string): string | null => {
    const normalized = normalizePosixProbePath(path);
    if (normalized === "/") {
        return null;
    }
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) {
        return "/";
    }
    return normalized.slice(0, lastSlash);
};

export const normalizeDestinationPathForDaemon = (
    value: string,
    daemonPathStyle: DaemonPathStyle,
): string => {
    const trimmed = value.trim();
    if (daemonPathStyle === "windows") {
        return trimmed.replace(/\//g, "\\");
    }
    return trimmed;
};

export const resolveDestinationProbeRoot = (
    path: string,
    daemonPathStyle: DaemonPathStyle,
): string | null => {
    const trimmed = path.trim();
    if (!trimmed) {
        return null;
    }
    if (daemonPathStyle === "windows") {
        return extractWindowsRoot(trimmed);
    }
    if (daemonPathStyle === "posix") {
        return trimmed.startsWith("/") ? "/" : null;
    }
    return null;
};

export const evaluateDestinationPathCandidate = (
    rawPath: string,
    daemonPathStyle: DaemonPathStyle,
): DestinationPathEvaluation => {
    const normalizedPath = normalizeDestinationPathForDaemon(rawPath, daemonPathStyle);
    const hasValue = normalizedPath.trim().length > 0;

    if (!hasValue) {
        return {
            rawPath,
            normalizedPath,
            hasValue: false,
            isAbsolute: false,
            syntaxValid: false,
            resolvedProbeRoot: null,
            reason: null,
        };
    }

    if (daemonPathStyle === "unknown") {
        return {
            rawPath,
            normalizedPath,
            hasValue: true,
            isAbsolute: false,
            syntaxValid: false,
            resolvedProbeRoot: null,
            reason: "validation_unavailable",
        };
    }

    const isAbsolute = isAbsolutePath(normalizedPath, daemonPathStyle);
    if (!isAbsolute) {
        return {
            rawPath,
            normalizedPath,
            hasValue: true,
            isAbsolute: false,
            syntaxValid: false,
            resolvedProbeRoot: null,
            reason: "invalid_format",
        };
    }

    if (daemonPathStyle === "windows") {
        const syntaxValid = isWindowsPathSyntacticallyValid(normalizedPath);
        const resolvedProbeRoot = resolveDestinationProbeRoot(
            normalizedPath,
            daemonPathStyle,
        );
        if (!syntaxValid) {
            return {
                rawPath,
                normalizedPath,
                hasValue: true,
                isAbsolute: true,
                syntaxValid: false,
                resolvedProbeRoot,
                reason: "invalid_windows_syntax",
            };
        }
        if (!resolvedProbeRoot) {
            return {
                rawPath,
                normalizedPath,
                hasValue: true,
                isAbsolute: true,
                syntaxValid: true,
                resolvedProbeRoot: null,
                reason: "invalid_format",
            };
        }
        return {
            rawPath,
            normalizedPath,
            hasValue: true,
            isAbsolute: true,
            syntaxValid: true,
            resolvedProbeRoot,
            reason: null,
        };
    }

    const resolvedProbeRoot = resolveDestinationProbeRoot(
        normalizedPath,
        daemonPathStyle,
    );
    return {
        rawPath,
        normalizedPath,
        hasValue: true,
        isAbsolute: true,
        syntaxValid: true,
        resolvedProbeRoot,
        reason: null,
    };
};

export const toRpcWindowsProbeRootPath = (root: string): string => {
    if (root.startsWith("\\\\")) {
        return root;
    }
    if (root.startsWith("//")) {
        return `\\\\${root.slice(2).replace(/\//g, "\\")}`;
    }
    return root;
};

export const resolvePosixProbeCandidates = (path: string): string[] => {
    const primary = normalizePosixProbePath(path);
    const fallback = resolvePosixParentProbePath(primary);
    if (!fallback || fallback === primary) {
        return [primary];
    }
    return [primary, fallback];
};

export const readDestinationFreeSpace = (
    value: unknown,
): DestinationFreeSpace | undefined => {
    const path = (value as { path?: unknown })?.path;
    const sizeBytes = (value as { sizeBytes?: unknown })?.sizeBytes;
    const totalSize = (value as { totalSize?: unknown })?.totalSize;

    if (
        typeof path === "string" &&
        typeof sizeBytes === "number" &&
        Number.isFinite(sizeBytes)
    ) {
        return {
            path,
            sizeBytes,
            totalSize:
                typeof totalSize === "number" && Number.isFinite(totalSize)
                    ? totalSize
                    : undefined,
        };
    }

    return undefined;
};
