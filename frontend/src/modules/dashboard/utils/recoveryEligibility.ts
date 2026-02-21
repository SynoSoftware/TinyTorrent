import STATUS from "@/shared/status";
import type {
    ErrorClass,
    RecoveryState,
    TorrentStatus,
} from "@/services/rpc/entities";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";

type DownloadMissingEligibilityCandidate = {
    state: TorrentStatus;
    errorEnvelope?: {
        recoveryState?: RecoveryState | null;
        errorClass?: ErrorClass | null;
    } | null;
};

export function resolveEffectiveRecoveryState(
    candidate: DownloadMissingEligibilityCandidate,
): TorrentStatus | RecoveryState {
    const recoveryState = candidate.errorEnvelope?.recoveryState;
    if (recoveryState && recoveryState !== "ok") {
        return recoveryState;
    }
    return candidate.state;
}

export function canTriggerDownloadMissingAction(
    candidate: DownloadMissingEligibilityCandidate,
    classification: MissingFilesClassification | null,
): boolean {
    if (classification?.recommendedActions.includes("downloadMissing")) {
        return true;
    }
    const effectiveState = resolveEffectiveRecoveryState(candidate);
    if (effectiveState === STATUS.torrent.MISSING_FILES) {
        return true;
    }
    return candidate.errorEnvelope?.errorClass === "missingFiles";
}
