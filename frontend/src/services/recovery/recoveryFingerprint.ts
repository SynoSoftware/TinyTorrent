export interface RecoveryFingerprintInput {
    fingerprint?: string | null;
    hash?: string | null;
    id?: string | number | null;
}

export const NO_RECOVERY_FINGERPRINT = "<no-recovery-fingerprint>";

export function resolveRecoveryFingerprint(
    input?: RecoveryFingerprintInput | null,
): string {
    if (input?.fingerprint) {
        return input.fingerprint;
    }
    if (input?.hash) {
        return input.hash;
    }
    if (input?.id !== undefined && input.id !== null) {
        return String(input.id);
    }
    return NO_RECOVERY_FINGERPRINT;
}
