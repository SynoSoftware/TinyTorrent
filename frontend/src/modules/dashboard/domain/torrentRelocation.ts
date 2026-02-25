import { extractWindowsRoot, isAbsolutePath, isPathMatch } from "@/modules/dashboard/utils/pathUtils";
import type { DaemonPathStyle } from "@/services/rpc/types";

export type TorrentRelocationContext = {
    error?: number;
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

export type RelocationPreflightFreeSpace = {
    path: string;
    sizeBytes: number;
    totalSize?: number;
};

export type RelocationTargetPathValidationResult =
    | { ok: true; freeSpace?: RelocationPreflightFreeSpace }
    | { ok: false; reason: "invalid_format" | "root_unreachable" };

export type RelocationMoveVerificationResult =
    | { settled: false }
    | {
          settled: true;
          outcome: "succeeded" | "failed_error" | "failed_timeout";
      };

const numberOrZero = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

const toRpcWindowsRootPath = (root: string): string => {
    if (!root.startsWith("//")) {
        return root;
    }
    return `\\\\${root.slice(2).replace(/\//g, "\\")}`;
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
    if (context.error !== 3) {
        return false;
    }
    if (numberOrZero(context.sizeWhenDone) <= 0) {
        return false;
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
): Promise<RelocationTargetPathValidationResult> => {
    if (daemonPathStyle === "unknown") {
        return { ok: true };
    }

    if (!isAbsolutePath(path, daemonPathStyle)) {
        return { ok: false, reason: "invalid_format" };
    }

    if (daemonPathStyle !== "windows") {
        return { ok: true };
    }

    const root = extractWindowsRoot(path);
    if (!root) {
        return { ok: false, reason: "invalid_format" };
    }

    if (typeof rpc.checkFreeSpace !== "function") {
        return { ok: true };
    }

    try {
        const freeSpace = await rpc.checkFreeSpace(toRpcWindowsRootPath(root));
        const parsedFreeSpace = readFreeSpace(freeSpace);
        return parsedFreeSpace !== undefined
            ? { ok: true, freeSpace: parsedFreeSpace }
            : { ok: true };
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
