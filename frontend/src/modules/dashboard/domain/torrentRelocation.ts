import {
    extractWindowsRoot,
    isAbsolutePath,
    isPathMatch,
    isWindowsPathSyntacticallyValid,
} from "@/modules/dashboard/utils/pathUtils";
import type { DaemonPathStyle } from "@/services/rpc/types";

export type TorrentRelocationContext = {
    error?: number;
    errorString?: string;
    sizeWhenDone?: number;
    haveValid?: number;
    haveUnchecked?: number;
    downloaded?: number;
    uploaded?: number;
    doneDate?: number;
    secondsDownloading?: number;
    secondsSeeding?: number;
};

type SetDownloadLocationUiTextKeys = {
    actionLabelKey: "table.actions.set_download_path" | "table.actions.locate_files";
    modalTitleKey: "modals.set_download_location.title" | "modals.locate_files.title";
};

type RelocationRpc = {
    checkFreeSpace?: (path: string) => Promise<unknown>;
};

export type RelocationRootProbeResult =
    | {
          ok: true;
          freeSpace?: RelocationPreflightFreeSpace;
          probeWarning?: "free_space_unavailable";
      }
    | { ok: false; reason: "root_unreachable" };

export type RelocationPreflightFreeSpace = {
    path: string;
    sizeBytes: number;
    totalSize?: number;
};

export type RelocationTargetPathValidationResult =
    | {
          ok: true;
          freeSpace?: RelocationPreflightFreeSpace;
          probeWarning?: "free_space_unavailable";
      }
    | {
          ok: false;
          reason:
              | "invalid_format"
              | "invalid_windows_syntax"
              | "root_unreachable"
              | "validation_unavailable";
      };

export type RelocationMoveVerificationResult =
    | { settled: false }
    | {
          settled: true;
          outcome: "succeeded" | "failed_error" | "failed_timeout";
      };

const numberOrZero = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
const TRANSMISSION_LOCAL_ERROR_CODE = 3;
const TRANSMISSION_MISSING_DATA_ERROR_SNIPPET = "no data found";

const isTransmissionMissingDataErrorString = (
    errorString: string | undefined,
): boolean =>
    typeof errorString === "string" &&
    errorString.toLowerCase().includes(TRANSMISSION_MISSING_DATA_ERROR_SNIPPET);

const toRpcWindowsRootPath = (root: string): string => {
    if (root.startsWith("\\\\")) {
        return root;
    }
    if (root.startsWith("//")) {
        return `\\\\${root.slice(2).replace(/\//g, "\\")}`;
    }
    return root;
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

const probePosixFreeSpace = async (
    path: string,
    rpc: RelocationRpc,
): Promise<RelocationTargetPathValidationResult> => {
    if (typeof rpc.checkFreeSpace !== "function") {
        return {
            ok: true,
            probeWarning: "free_space_unavailable",
        };
    }

    const primary = normalizePosixProbePath(path);
    const fallback = resolvePosixParentProbePath(primary);
    const candidates = fallback && fallback !== primary ? [primary, fallback] : [primary];

    for (const candidate of candidates) {
        try {
            const freeSpace = await rpc.checkFreeSpace(candidate);
            const parsedFreeSpace = readFreeSpace(freeSpace);
            return parsedFreeSpace !== undefined
                ? { ok: true, freeSpace: parsedFreeSpace }
                : { ok: true, probeWarning: "free_space_unavailable" };
        } catch {
            // Try fallback candidate once; advisory only for POSIX.
        }
    }

    return {
        ok: true,
        probeWarning: "free_space_unavailable",
    };
};

const readFreeSpace = (value: unknown): RelocationPreflightFreeSpace | undefined => {
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

// Heuristic derived from Transmission's stat fields:
// - error=3 => local error class
// - sizeWhenDone>0 and no locally visible data bytes (haveValid+haveUnchecked===0)
// - plus evidence the torrent previously had activity/data
export const isMissingDataLocalError = (
    context: TorrentRelocationContext,
): boolean => {
    if (context.error !== TRANSMISSION_LOCAL_ERROR_CODE) {
        return false;
    }
    if (numberOrZero(context.sizeWhenDone) <= 0) {
        return false;
    }

    // Transmission daemon emits this string for explicit "missing local data" cases.
    // Use it as a direct signal so Set Location switches to locate-files mode.
    if (isTransmissionMissingDataErrorString(context.errorString)) {
        return true;
    }

    const localBytes =
        numberOrZero(context.haveValid) + numberOrZero(context.haveUnchecked);
    if (localBytes > 0) {
        return false;
    }

    const hasPriorLifeEvidence =
        numberOrZero(context.downloaded) > 0 ||
        numberOrZero(context.uploaded) > 0 ||
        numberOrZero(context.doneDate) > 0 ||
        numberOrZero(context.secondsDownloading) > 0 ||
        numberOrZero(context.secondsSeeding) > 0;

    return hasPriorLifeEvidence;
};

export const shouldMoveDataOnSetLocation = (
    context: TorrentRelocationContext,
): boolean => !isMissingDataLocalError(context);

export const validateRelocationTargetPath = async (
    path: string,
    daemonPathStyle: DaemonPathStyle,
    rpc: RelocationRpc,
    options?: {
        rootProbe?: RelocationRootProbeResult;
        rootProbeRoot?: string;
    },
): Promise<RelocationTargetPathValidationResult> => {
    if (daemonPathStyle === "unknown") {
        return { ok: false, reason: "validation_unavailable" };
    }

    if (!isAbsolutePath(path, daemonPathStyle)) {
        return { ok: false, reason: "invalid_format" };
    }

    if (daemonPathStyle === "posix") {
        return probePosixFreeSpace(path, rpc);
    }

    if (!isWindowsPathSyntacticallyValid(path)) {
        return { ok: false, reason: "invalid_windows_syntax" };
    }

    const root = resolveRelocationTargetRoot(path, daemonPathStyle);
    if (!root) {
        return { ok: false, reason: "invalid_format" };
    }

    if (options?.rootProbe && options.rootProbeRoot === root) {
        if (!options.rootProbe.ok) {
            return { ok: false, reason: "root_unreachable" };
        }
        return {
            ok: true,
            freeSpace: options.rootProbe.freeSpace,
            probeWarning: options.rootProbe.probeWarning,
        };
    }

    const rootProbe = await probeRelocationTargetRoot(root, daemonPathStyle, rpc);
    if (!rootProbe.ok) {
        return { ok: false, reason: "root_unreachable" };
    }
    return {
        ok: true,
        freeSpace: rootProbe.freeSpace,
    };
};

export const resolveRelocationTargetRoot = (
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

export const probeRelocationTargetRoot = async (
    root: string,
    daemonPathStyle: DaemonPathStyle,
    rpc: RelocationRpc,
): Promise<RelocationRootProbeResult> => {
    if (daemonPathStyle !== "windows") {
        return { ok: true };
    }

    if (typeof rpc.checkFreeSpace !== "function") {
        return {
            ok: true,
            probeWarning: "free_space_unavailable",
        };
    }

    try {
        const freeSpace = await rpc.checkFreeSpace(toRpcWindowsRootPath(root));
        const parsedFreeSpace = readFreeSpace(freeSpace);
        return parsedFreeSpace !== undefined
            ? { ok: true, freeSpace: parsedFreeSpace }
            : { ok: true, probeWarning: "free_space_unavailable" };
    } catch {
        return { ok: false, reason: "root_unreachable" };
    }
};

export const evaluateRelocationMoveVerification = ({
    requestedPath,
    reportedPath,
    torrentError,
    nowMs,
    timeoutAtMs,
}: {
    requestedPath: string;
    reportedPath: string;
    torrentError?: number;
    nowMs: number;
    timeoutAtMs: number;
}): RelocationMoveVerificationResult => {
    if (typeof torrentError === "number" && torrentError !== 0) {
        return { settled: true, outcome: "failed_error" };
    }

    if (isPathMatch(requestedPath, reportedPath)) {
        return { settled: true, outcome: "succeeded" };
    }

    if (nowMs >= timeoutAtMs) {
        return { settled: true, outcome: "failed_timeout" };
    }

    return { settled: false };
};

const SET_DOWNLOAD_LOCATION_UI_TEXT_KEYS = {
    default: {
        actionLabelKey: "table.actions.set_download_path",
        modalTitleKey: "modals.set_download_location.title",
    },
    locate: {
        actionLabelKey: "table.actions.locate_files",
        modalTitleKey: "modals.locate_files.title",
    },
} as const satisfies Record<string, SetDownloadLocationUiTextKeys>;

export const getSetDownloadLocationUiTextKeys = (
    context: TorrentRelocationContext,
): SetDownloadLocationUiTextKeys =>
    isMissingDataLocalError(context)
        ? SET_DOWNLOAD_LOCATION_UI_TEXT_KEYS.locate
        : SET_DOWNLOAD_LOCATION_UI_TEXT_KEYS.default;
