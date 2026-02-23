import STATUS from "@/shared/status";
import type { ErrorClass } from "@/services/rpc/entities";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { getEffectiveRecoveryState } from "@/modules/dashboard/utils/recoveryState";

type DownloadMissingEligibilityCandidate = Pick<Torrent, "state" | "errorEnvelope">;

export function canTriggerDownloadMissingAction(
    candidate: DownloadMissingEligibilityCandidate,
    classification: MissingFilesClassification | null,
): boolean {
    if (classification?.recommendedActions.includes("downloadMissing")) {
        return true;
    }
    const effectiveState = getEffectiveRecoveryState(candidate);
    if (effectiveState === STATUS.torrent.MISSING_FILES) {
        return true;
    }
    return (candidate.errorEnvelope?.errorClass as ErrorClass | undefined) === "missingFiles";
}
