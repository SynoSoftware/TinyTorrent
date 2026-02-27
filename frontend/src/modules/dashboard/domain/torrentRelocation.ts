import { isPathMatch } from "@/shared/utils/pathUtils";

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
