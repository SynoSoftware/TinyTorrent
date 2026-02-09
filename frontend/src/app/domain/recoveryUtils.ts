import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
export interface RecoveryFingerprintSource {
    id?: string | number | null;
    hash?: string | null;
    errorEnvelope?: { fingerprint?: string | null } | null;
}

export const getRecoveryFingerprint = (
    torrent?: RecoveryFingerprintSource | null,
): string => {
    if (torrent?.errorEnvelope?.fingerprint) {
        return torrent.errorEnvelope.fingerprint;
    }
    if (torrent?.hash) {
        return torrent.hash;
    }
    if (torrent?.id !== undefined && torrent.id !== null) {
        return String(torrent.id);
    }
    return "<no-recovery-fingerprint>";
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
