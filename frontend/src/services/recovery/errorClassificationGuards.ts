import type { ErrorClass } from "@/services/rpc/entities";
import { STATUS } from "@/shared/status";

export type ActionableRecoveryErrorClass = Extract<
    ErrorClass,
    "missingFiles" | "permissionDenied" | "diskFull" | "localError" | "unknown"
>;

interface RecoveryGateResumeCandidate {
    state?: string | null;
    errorEnvelope?: {
        errorClass?: ErrorClass | string | null;
    } | null;
}

export function isActionableRecoveryErrorClass(
    errorClass?: ErrorClass | string | null,
): errorClass is ActionableRecoveryErrorClass {
    return (
        errorClass === "missingFiles" ||
        errorClass === "permissionDenied" ||
        errorClass === "diskFull" ||
        errorClass === "localError" ||
        errorClass === "unknown"
    );
}

export function shouldUseRecoveryGateForResume(
    torrent: RecoveryGateResumeCandidate,
): boolean {
    if (!isActionableRecoveryErrorClass(torrent.errorEnvelope?.errorClass)) {
        return false;
    }
    return (
        torrent.state === STATUS.torrent.PAUSED ||
        torrent.state === STATUS.torrent.ERROR ||
        torrent.state === STATUS.torrent.MISSING_FILES
    );
}
