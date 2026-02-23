import { RECOVERY_RETRY_COOLDOWN_MS } from "@/config/logic";

const BACKGROUND_RECOVERY_MAX_BACKOFF_MULTIPLIER = 6;
const BACKGROUND_RECOVERY_JITTER_RATIO = 0.15;

export type RecoveryRetryJitterSeedSource = (
    fingerprint: string,
    attempt: number,
) => number;

const computeDeterministicJitterSeed = (value: string): number => {
    if (!value) {
        return 0.5;
    }
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return (hash % 10_000) / 10_000;
};

const defaultJitterSeedSource: RecoveryRetryJitterSeedSource = (
    fingerprint,
    attempt,
) => computeDeterministicJitterSeed(`${fingerprint}:${attempt}`);

const clampUnitInterval = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0.5;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

export const computeBackgroundRecoveryDelayMs = (
    fingerprint: string,
    attempt: number,
    jitterSeedSource: RecoveryRetryJitterSeedSource = defaultJitterSeedSource,
): number => {
    const boundedAttempt = Math.max(1, attempt);
    const baseDelay = RECOVERY_RETRY_COOLDOWN_MS;
    const exponentialDelay = baseDelay * Math.pow(2, boundedAttempt - 1);
    const maxDelay =
        baseDelay * BACKGROUND_RECOVERY_MAX_BACKOFF_MULTIPLIER;
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    const jitterSeed = clampUnitInterval(
        jitterSeedSource(fingerprint, boundedAttempt),
    );
    const jitterFactor =
        1 + (jitterSeed * 2 - 1) * BACKGROUND_RECOVERY_JITTER_RATIO;
    const jitteredDelay = Math.round(cappedDelay * jitterFactor);
    return Math.max(baseDelay, Math.min(maxDelay, jitteredDelay));
};
