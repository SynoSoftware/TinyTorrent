/**
 * Centralized retry scheduler for background recovery.
 *
 * Owns the single retry policy: one eligibility check, one cooldown gate,
 * one in-flight guard per fingerprint, one delay policy.
 *
 * All callers go through this module — no duplicate mini state machines.
 */

import type { MutableRefObject } from "react";
import { computeBackgroundRecoveryDelayMs } from "@/modules/dashboard/hooks/recoveryRetryDelay";

export type CooldownAttemptResult = "started" | "cooldown" | "in_flight";

export interface CooldownRetryRefs {
    inFlightRef: MutableRefObject<Set<string>>;
    nextRetryAtRef: MutableRefObject<Map<string, number>>;
    attemptCountRef: MutableRefObject<Map<string, number>>;
}

/**
 * Try to begin a cooldown-gated recovery attempt.
 *
 * Returns:
 * - `"started"` — caller should proceed with recovery
 * - `"cooldown"` — too soon since last attempt
 * - `"in_flight"` — another attempt is already running for this fingerprint
 */
export function tryBeginAttempt(fingerprint: string, refs: CooldownRetryRefs): CooldownAttemptResult {
    if (refs.inFlightRef.current.has(fingerprint)) {
        return "in_flight";
    }
    const nextRetryAt = refs.nextRetryAtRef.current.get(fingerprint) ?? 0;
    if (Date.now() < nextRetryAt) {
        return "cooldown";
    }
    refs.inFlightRef.current.add(fingerprint);
    return "started";
}

/**
 * Schedule the next retry after a failed attempt.
 * Uses exponential backoff via `computeBackgroundRecoveryDelayMs`.
 */
export function scheduleRetry(fingerprint: string, refs: CooldownRetryRefs): void {
    const attempt = (refs.attemptCountRef.current.get(fingerprint) ?? 0) + 1;
    refs.attemptCountRef.current.set(fingerprint, attempt);
    const retryDelayMs = computeBackgroundRecoveryDelayMs(fingerprint, attempt);
    refs.nextRetryAtRef.current.set(fingerprint, Date.now() + retryDelayMs);
}

/**
 * Clear all cooldown/retry tracking for a fingerprint (on success or cancellation).
 */
export function clearSchedule(fingerprint: string, refs: CooldownRetryRefs): void {
    refs.nextRetryAtRef.current.delete(fingerprint);
    refs.attemptCountRef.current.delete(fingerprint);
    refs.inFlightRef.current.delete(fingerprint);
}

/**
 * Mark an in-flight attempt as finished (regardless of success/failure).
 */
export function finishAttempt(fingerprint: string, refs: CooldownRetryRefs): void {
    refs.inFlightRef.current.delete(fingerprint);
}
