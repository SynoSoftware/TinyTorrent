import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import { resolveRecoveryFingerprint } from "@/services/recovery/recoveryFingerprint";
export interface RecoveryFingerprintSource {
    id?: string | number | null;
    hash?: string | null;
    errorEnvelope?: { fingerprint?: string | null } | null;
}

export const getRecoveryFingerprint = (
    torrent?: RecoveryFingerprintSource | null,
): string => {
    return resolveRecoveryFingerprint({
        fingerprint: torrent?.errorEnvelope?.fingerprint ?? null,
        hash: torrent?.hash ?? null,
        id: torrent?.id ?? null,
    });
};

export type PathNeededReason = Extract<
    RecoveryOutcome,
    { kind: "path-needed" }
>["reason"];

export const derivePathReason = (errorClass?: string | null): PathNeededReason => {
    switch (errorClass) {
        case "permissionDenied":
            return "unwritable";
        case "diskFull":
            return "disk-full";
        case "missingFiles":
            return "missing";
        default:
            return "missing";
    }
};
