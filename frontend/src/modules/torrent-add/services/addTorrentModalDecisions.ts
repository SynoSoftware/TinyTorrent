import type { AddTorrentSource } from "@/modules/torrent-add/types";
import type { DestinationPathValidationResult } from "@/shared/hooks/useDestinationPathValidation";
import type { DestinationValidationDecision } from "@/shared/domain/destinationValidationPolicy";

export type AddTorrentResolvedState = "pending" | "ready" | "error";

export interface AddTorrentSubmissionDecision {
    canConfirm: boolean;
}

export interface AddTorrentDestinationDecision {
    activeDestination: string;
    isDestinationValid: boolean;
    hasSpaceWarning: boolean;
    isDestinationGateRequiredError: boolean;
    isDestinationGateInvalidError: boolean;
    showDestinationGate: boolean;
}

export interface AddTorrentFileHandlingDecision {
    action: "open_modal" | "submit_directly";
}

export const resolveAddTorrentResolvedState = ({
    source,
    fileCount,
    magnetLink,
}: {
    source: AddTorrentSource | null;
    fileCount: number;
    magnetLink?: string;
}): AddTorrentResolvedState => {
    if (source?.kind === "magnet") {
        return magnetLink?.trim() ? "ready" : "pending";
    }
    return fileCount > 0 ? "ready" : "pending";
};

export const resolveAddTorrentDestinationDecision = ({
    destinationDecision,
    destinationValidation,
    destinationDraft,
    destinationGateCompleted,
    destinationGateTried,
}: {
    destinationDecision: DestinationValidationDecision;
    destinationValidation: Pick<
        DestinationPathValidationResult,
        "status" | "probeWarning" | "hasValue"
    >;
    destinationDraft: string;
    destinationGateCompleted: boolean;
    destinationGateTried: boolean;
}): AddTorrentDestinationDecision => {
    const activeDestination = destinationDecision.normalizedPath.trim();
    const isDestinationValid = destinationDecision.canProceed;
    const hasSpaceWarning =
        destinationValidation.status === "valid" &&
        destinationValidation.probeWarning === "free_space_unavailable";
    const isDestinationGateRequiredError =
        destinationGateTried && destinationDraft.trim().length === 0;
    const isDestinationGateInvalidError =
        destinationDecision.blockReason === "invalid" &&
        destinationValidation.hasValue;
    const showDestinationGate = !destinationGateCompleted;

    return {
        activeDestination,
        isDestinationValid,
        hasSpaceWarning,
        isDestinationGateRequiredError,
        isDestinationGateInvalidError,
        showDestinationGate,
    };
};

export const resolveAddTorrentSubmissionDecision = ({
    requiresFileSelection,
    isSelectionEmpty,
    isDestinationValid,
    resolvedState,
}: {
    requiresFileSelection: boolean;
    isSelectionEmpty: boolean;
    isDestinationValid: boolean;
    resolvedState: AddTorrentResolvedState;
}): AddTorrentSubmissionDecision => {
    const canConfirm =
        (!requiresFileSelection || !isSelectionEmpty) &&
        isDestinationValid &&
        resolvedState === "ready";

    return {
        canConfirm,
    };
};

export const resolveAddTorrentFileHandlingDecision = ({
    showAddDialog,
    hasDefaultDownloadDir,
}: {
    showAddDialog: boolean;
    hasDefaultDownloadDir: boolean;
}): AddTorrentFileHandlingDecision => {
    if (showAddDialog || !hasDefaultDownloadDir) {
        return { action: "open_modal" };
    }

    return { action: "submit_directly" };
};

export const resolveAddTorrentModalSize = ({
    showDestinationGate,
    isFullscreen,
}: {
    showDestinationGate: boolean;
    isFullscreen: boolean;
}): "lg" | "5xl" | "full" => {
    if (showDestinationGate) {
        return "lg";
    }
    return isFullscreen ? "full" : "5xl";
};
