export type AddTorrentResolvedState = "pending" | "ready" | "error";

export interface AddTorrentSubmissionDecision {
    canConfirm: boolean;
}

export const resolveAddTorrentSubmissionDecision = ({
    isSelectionEmpty,
    isDestinationValid,
    resolvedState,
}: {
    isSelectionEmpty: boolean;
    isDestinationValid: boolean;
    resolvedState: AddTorrentResolvedState;
}): AddTorrentSubmissionDecision => {
    const canConfirm =
        !isSelectionEmpty &&
        isDestinationValid &&
        resolvedState === "ready";

    return {
        canConfirm,
    };
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
