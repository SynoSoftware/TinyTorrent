import type { TFunction } from "i18next";
import { formatBytes } from "@/shared/utils/format";

export type AddTorrentDestinationStatusKind =
    | "hint"
    | "ok"
    | "warning"
    | "danger";

export interface AddTorrentDestinationStatusParams {
    activeDestination: string;
    destinationDraft: string;
    freeSpaceBytes: number | null;
    hasSpaceError: boolean;
    isDestinationDraftValid: boolean;
    isDestinationGateInvalidError: boolean;
    isDestinationGateRequiredError: boolean;
    isDestinationValid: boolean;
    uiMode: "Full" | "Rpc";
    t: TFunction;
}

export interface AddTorrentDestinationStatusResult {
    step1StatusKind: AddTorrentDestinationStatusKind;
    step1StatusMessage: string;
    step2StatusKind: AddTorrentDestinationStatusKind;
    step2StatusMessage: string;
}

const getDestinationHintMessage = (
    uiMode: "Full" | "Rpc",
    t: TFunction
): string =>
    uiMode === "Rpc"
        ? t("modals.add_torrent.destination_prompt_drop_hint_rpc")
        : t("modals.add_torrent.destination_prompt_drop_hint_full");

export function getAddTorrentDestinationStatus({
    activeDestination,
    destinationDraft,
    freeSpaceBytes,
    hasSpaceError,
    isDestinationDraftValid,
    isDestinationGateInvalidError,
    isDestinationGateRequiredError,
    isDestinationValid,
    t,
    uiMode,
}: AddTorrentDestinationStatusParams): AddTorrentDestinationStatusResult {
    const hintMessage = getDestinationHintMessage(uiMode, t);
    const hasDraft = destinationDraft.trim().length > 0;
    const hasActiveDestination = activeDestination.length > 0;
    const hasKnownFreeSpace = freeSpaceBytes !== null;
    const formatFreeSpace = () =>
        `${formatBytes(freeSpaceBytes ?? 0)} ${t("modals.add_torrent.free")}`;
    const loadingMessage = t("modals.add_torrent.free_space_loading");
    const unknownMessage = t("modals.add_torrent.free_space_unknown");
    const invalidMessage = t("modals.add_torrent.destination_prompt_invalid");

    const step1StatusKind: AddTorrentDestinationStatusKind =
        isDestinationGateRequiredError || isDestinationGateInvalidError
            ? "danger"
            : hasDraft && isDestinationDraftValid
              ? hasKnownFreeSpace
                    ? "ok"
                    : hasSpaceError
                      ? "warning"
                      : "hint"
              : "hint";

    const step1StatusMessage = isDestinationGateRequiredError
        ? t("modals.add_torrent.destination_required_chip")
        : isDestinationGateInvalidError
          ? invalidMessage
          : hasDraft && isDestinationDraftValid
            ? hasKnownFreeSpace
                ? formatFreeSpace()
                : hasSpaceError
                  ? unknownMessage
                  : loadingMessage
            : hintMessage;

    const step2StatusKind: AddTorrentDestinationStatusKind =
        !isDestinationValid && hasActiveDestination
            ? "danger"
            : hasActiveDestination && isDestinationValid
              ? hasKnownFreeSpace
                    ? "ok"
                    : hasSpaceError
                      ? "warning"
                      : "hint"
              : hasSpaceError
                ? "warning"
                : "hint";

    const step2StatusMessage =
        !isDestinationValid && hasActiveDestination
            ? invalidMessage
            : !hasActiveDestination
              ? hintMessage
              : hasKnownFreeSpace
                ? formatFreeSpace()
                : hasSpaceError
                  ? unknownMessage
                  : loadingMessage;

    return {
        step1StatusKind,
        step1StatusMessage,
        step2StatusKind,
        step2StatusMessage,
    };
}
