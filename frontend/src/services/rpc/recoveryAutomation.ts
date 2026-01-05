import type { ErrorEnvelope, TorrentEntity } from "./entities";

// In-memory state for idempotency and transient tracking.
// `autoPausedKeys` stores a composite key of `fingerprint|recoveryState`
// to ensure idempotency is applied only when both fingerprint and
// recoveryState match (requirement #4).
const autoPausedKeys = new Set<string>();
const transientTrackerFingerprints = new Set<string>();
// firstSeenFingerprintMs: records the first-seen epoch ms for a fingerprint
// (used to stamp `lastErrorAt`).
const firstSeenFingerprintMs = new Map<string, number>();
// lastActionKeyMs: records when automation last acted for a specific
// action-key composed of fingerprint|errorClass|recoveryState. This is
// used solely for cooldown/noise suppression.
const lastActionKeyMs = new Map<string, number>();

// Cool-down for suppressing repeated identical warnings (Tier-1.5).
let COOL_DOWN_MS = 60_000; // configurable for tests/extensions

export type PauseCallback = (ids: string[]) => Promise<void> | void;

/** Non-destructive list: these error classes must never be suppressed. */
const NON_SUPPRESSIBLE: Set<string> = new Set([
    "diskFull",
    "permissionDenied",
    "missingFiles",
]);

/**
 * Configure recovery automation runtime knobs (extension point).
 * Tier-2 and persistence hooks can be added later.
 */
export function configure(opts: { coolDownMs?: number } = {}) {
    if (typeof opts.coolDownMs === "number" && opts.coolDownMs >= 0) {
        COOL_DOWN_MS = Math.floor(opts.coolDownMs);
    }
}

/**
 * Process a heartbeat's torrent list and optionally perform conservative
 * automation actions. This module is Tier-1 only: extremely conservative,
 * engine-agnostic, and driven solely by ErrorEnvelope.
 *
 * Notes:
 * - All state is in-memory only.
 * - Idempotency is based on ErrorEnvelope.fingerprint.
 * - No persistence, no timers; heartbeat-driven only.
 */
export function processHeartbeat(
    current: TorrentEntity[],
    previous: TorrentEntity[] | undefined | null,
    pauseCallback?: PauseCallback
) {
    const now = Date.now();
    const prevById = new Map<string, TorrentEntity>();
    if (previous) {
        for (const p of previous) prevById.set(p.id, p);
    }

    for (const t of current) {
        const curEnv: ErrorEnvelope | undefined | null = t.errorEnvelope;
        const prev = prevById.get(t.id);
        const prevEnv: ErrorEnvelope | undefined | null = prev?.errorEnvelope;

        try {
            const curFp = curEnv?.fingerprint ?? null;
            const prevFp = prevEnv?.fingerprint ?? null;

            // Determine non-suppressible from either envelope when available.
            const isNonSuppressible =
                curEnv?.errorClass ?? prevEnv?.errorClass
                    ? NON_SUPPRESSIBLE.has(
                          curEnv?.errorClass ?? prevEnv!.errorClass
                      )
                    : false;

            // Stamp `lastErrorAt` at the heartbeat (stateful) layer.
            // Rule: only set when an error exists. If errorClass is `none`,
            // ensure lastErrorAt is null. The builder is pure; we must not
            // mutate shared envelope objects in-place, so create a shallow
            // copy with the stamped value and assign it back to `t.errorEnvelope`.
            if (curEnv && curEnv.errorClass !== "none" && curFp) {
                let stampedAt: number;
                if (
                    prevEnv &&
                    prevFp === curFp &&
                    prevEnv.lastErrorAt != null
                ) {
                    stampedAt = prevEnv.lastErrorAt;
                } else if (firstSeenFingerprintMs.has(curFp)) {
                    stampedAt = firstSeenFingerprintMs.get(curFp) as number;
                } else {
                    firstSeenFingerprintMs.set(curFp, now);
                    stampedAt = now;
                }
                const stamped: ErrorEnvelope = {
                    ...curEnv,
                    lastErrorAt: stampedAt,
                };
                t.errorEnvelope = stamped;
            } else if (curEnv) {
                const stamped: ErrorEnvelope = { ...curEnv, lastErrorAt: null };
                t.errorEnvelope = stamped;
            }

            // Noise control: suppress repeated identical warnings per
            // (fingerprint,errorClass,recoveryState) within COOL_DOWN_MS,
            // except for non-suppressible classes. Suppression is applied
            // based on the last time we performed automation for that exact
            // action-key. This does NOT prevent stamping `lastErrorAt`.
            let shouldSuppress = false;
            if (
                curFp &&
                prevFp === curFp &&
                prevEnv &&
                curEnv &&
                curEnv.errorClass === prevEnv.errorClass &&
                curEnv.recoveryState === prevEnv.recoveryState
            ) {
                const actionKey = `${curFp}|${curEnv.errorClass}|${curEnv.recoveryState}`;
                const lastAction = lastActionKeyMs.get(actionKey) ?? 0;
                if (!isNonSuppressible && now - lastAction < COOL_DOWN_MS) {
                    shouldSuppress = true;
                }
            }

            if (shouldSuppress) {
                // Avoid performing automation actions, but do NOT change
                // any timing invariants. We already stamped `lastErrorAt`.
                continue;
            }

            // Automation #1: auto-pause on disk exhaustion
            if (
                curEnv &&
                curEnv.errorClass === "diskFull" &&
                curEnv.recoveryState === "blocked"
            ) {
                const f = curEnv.fingerprint ?? null;
                const key = f ? `${t.id}|${f}|${curEnv.recoveryState}` : null;
                const actionKey = f
                    ? `${f}|${curEnv.errorClass}|${curEnv.recoveryState}`
                    : null;
                if (key && !autoPausedKeys.has(key)) {
                    autoPausedKeys.add(key);
                    if (actionKey) lastActionKeyMs.set(actionKey, now);
                    if (pauseCallback) {
                        void (async () => {
                            try {
                                await pauseCallback([t.id]);
                            } catch {
                                // Do not escalate; automation is conservative
                            }
                        })();
                    }
                }
            }

            // Automation #2: silent clear of transient tracker warnings
            // Track when a trackerWarning first appears, and remove when cleared.
            if (prevEnv && prevEnv.errorClass === "trackerWarning") {
                const prevFp = prevEnv.fingerprint;
                if (prevFp) {
                    transientTrackerFingerprints.add(prevFp);
                    const actionKey = `${prevFp}|trackerWarning|${prevEnv.recoveryState}`;
                    lastActionKeyMs.set(actionKey, now);
                }
            }

            if (
                prevEnv &&
                prevEnv.errorClass === "trackerWarning" &&
                (!curEnv || curEnv.errorClass === "none")
            ) {
                const prevFp = prevEnv.fingerprint;
                if (prevFp && transientTrackerFingerprints.has(prevFp)) {
                    transientTrackerFingerprints.delete(prevFp);
                }
            }
        } catch {
            // Defensive: never throw from automation; heartbeat must remain stable
        }
    }
}

export function _resetForTests() {
    autoPausedKeys.clear();
    transientTrackerFingerprints.clear();
    firstSeenFingerprintMs.clear();
    lastActionKeyMs.clear();
    COOL_DOWN_MS = 60_000;
}

export default { processHeartbeat, configure, _resetForTests };
