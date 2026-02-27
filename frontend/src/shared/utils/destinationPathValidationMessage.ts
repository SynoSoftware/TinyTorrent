import type { TFunction } from "i18next";
import type { DestinationValidationReason } from "@/shared/domain/destinationPath";

export const getDestinationValidationReasonMessage = (
    reason: DestinationValidationReason,
    t: TFunction,
): string => {
    if (reason === "invalid_format") {
        return t("set_location.reason.absolute_path_required");
    }
    if (reason === "invalid_windows_syntax") {
        return t("set_location.reason.invalid_windows_path");
    }
    return t("directory_browser.error");
};
