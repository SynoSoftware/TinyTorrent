import { describe, expect, it } from "vitest";
import {
    computeBackgroundRecoveryDelayMs,
} from "@/modules/dashboard/hooks/recoveryRetryDelay";
import { RECOVERY_RETRY_COOLDOWN_MS } from "@/config/logic";

describe("computeBackgroundRecoveryDelayMs", () => {
    it("is deterministic for the same fingerprint and attempt", () => {
        const first = computeBackgroundRecoveryDelayMs("fp-deterministic", 3);
        const second = computeBackgroundRecoveryDelayMs("fp-deterministic", 3);
        expect(first).toBe(second);
    });

    it("stays within configured cooldown and backoff bounds", () => {
        const maxDelay = RECOVERY_RETRY_COOLDOWN_MS * 6;
        const attempts = [1, 2, 3, 4, 8, 16, 32];
        attempts.forEach((attempt) => {
            const delay = computeBackgroundRecoveryDelayMs("fp-bounds", attempt);
            expect(delay).toBeGreaterThanOrEqual(RECOVERY_RETRY_COOLDOWN_MS);
            expect(delay).toBeLessThanOrEqual(maxDelay);
        });
    });

    it("accepts an injected jitter seed source and keeps delay within deterministic bounds", () => {
        const attempt = 3;
        const baseDelay = RECOVERY_RETRY_COOLDOWN_MS;
        const maxDelay = baseDelay * 6;
        const cappedDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        const expectedMin = Math.max(
            baseDelay,
            Math.round(cappedDelay * (1 - 0.15)),
        );
        const expectedMax = Math.max(
            baseDelay,
            Math.min(maxDelay, Math.round(cappedDelay * (1 + 0.15))),
        );

        const minSeedDelay = computeBackgroundRecoveryDelayMs(
            "fp-injected",
            attempt,
            () => 0,
        );
        const maxSeedDelay = computeBackgroundRecoveryDelayMs(
            "fp-injected",
            attempt,
            () => 1,
        );
        const clampedSeedDelay = computeBackgroundRecoveryDelayMs(
            "fp-injected",
            attempt,
            () => 99,
        );

        expect(minSeedDelay).toBe(expectedMin);
        expect(maxSeedDelay).toBe(expectedMax);
        expect(clampedSeedDelay).toBe(expectedMax);
    });
});
