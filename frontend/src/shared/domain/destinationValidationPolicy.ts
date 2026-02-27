import type {
    DestinationFreeSpace,
    DestinationValidationReason,
} from "@/shared/domain/destinationPath";

export type DestinationValidationStatus =
    | "idle"
    | "validating"
    | "valid"
    | "invalid";

export type DestinationValidationSnapshot = Readonly<{
    normalizedPath: string;
    hasValue: boolean;
    status: DestinationValidationStatus;
    reason: DestinationValidationReason | null;
    freeSpace: DestinationFreeSpace | null;
}>;

export type DestinationValidationPolicyMode = "strict" | "allow_unavailable";

export type DestinationValidationBlockReason = "empty" | "invalid" | "pending";

export type DestinationValidationMessageKey =
    | "directory_browser.validation_required"
    | "set_location.reason.validation_pending"
    | "set_location.reason.absolute_path_required"
    | "set_location.reason.invalid_windows_path"
    | "directory_browser.error";

export type DestinationValidationDecision = Readonly<{
    normalizedPath: string;
    canProceed: boolean;
    blockReason: DestinationValidationBlockReason | null;
    blockMessageKey: DestinationValidationMessageKey | null;
    validationReason: DestinationValidationReason | null;
    gauge:
        | {
              path: string;
              sizeBytes: number;
              totalSize: number;
          }
        | null;
    availableSpaceBytes: number | null;
}>;

export const getDestinationValidationReasonMessageKey = (
    reason: DestinationValidationReason | null,
): DestinationValidationMessageKey => {
    if (reason === "invalid_format") {
        return "set_location.reason.absolute_path_required";
    }
    if (reason === "invalid_windows_syntax") {
        return "set_location.reason.invalid_windows_path";
    }
    return "directory_browser.error";
};

export const resolveDestinationValidationDecision = ({
    mode,
    snapshot,
}: {
    mode: DestinationValidationPolicyMode;
    snapshot: DestinationValidationSnapshot;
}): DestinationValidationDecision => {
    if (!snapshot.hasValue) {
        return {
            normalizedPath: snapshot.normalizedPath,
            canProceed: false,
            blockReason: "empty",
            blockMessageKey: "directory_browser.validation_required",
            validationReason: null,
            gauge: null,
            availableSpaceBytes: null,
        };
    }

    if (snapshot.status === "invalid") {
        if (
            snapshot.reason === "validation_unavailable" &&
            mode === "allow_unavailable"
        ) {
            return {
                normalizedPath: snapshot.normalizedPath,
                canProceed: true,
                blockReason: null,
                blockMessageKey: null,
                validationReason: snapshot.reason,
                gauge: null,
                availableSpaceBytes: null,
            };
        }
        return {
            normalizedPath: snapshot.normalizedPath,
            canProceed: false,
            blockReason: "invalid",
            blockMessageKey: getDestinationValidationReasonMessageKey(
                snapshot.reason,
            ),
            validationReason: snapshot.reason,
            gauge: null,
            availableSpaceBytes: null,
        };
    }

    if (snapshot.status === "valid") {
        const freeSpace = snapshot.freeSpace;
        const hasFreeBytes = typeof freeSpace?.sizeBytes === "number";
        let gauge: DestinationValidationDecision["gauge"] = null;
        if (
            freeSpace &&
            typeof freeSpace.sizeBytes === "number" &&
            typeof freeSpace.totalSize === "number"
        ) {
            gauge = {
                path: freeSpace.path,
                sizeBytes: freeSpace.sizeBytes,
                totalSize: freeSpace.totalSize,
            };
        }
        return {
            normalizedPath: snapshot.normalizedPath,
            canProceed: true,
            blockReason: null,
            blockMessageKey: null,
            validationReason: null,
            gauge,
            availableSpaceBytes: hasFreeBytes ? freeSpace.sizeBytes : null,
        };
    }

    return {
        normalizedPath: snapshot.normalizedPath,
        canProceed: false,
        blockReason: "pending",
        blockMessageKey: "set_location.reason.validation_pending",
        validationReason: null,
        gauge: null,
        availableSpaceBytes: null,
    };
};
