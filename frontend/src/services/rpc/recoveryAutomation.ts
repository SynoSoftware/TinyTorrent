import type { ErrorEnvelope, TorrentEntity } from "./entities";

// In-memory state for idempotency and transient tracking.
const autoPausedFingerprints = new Set<string>();
const transientTrackerFingerprints = new Set<string>();

export type PauseCallback = (ids: string[]) => Promise<void> | void;

/**
 * Process a heartbeat's torrent list and optionally perform conservative
 * automation actions. This module is Tier-1 only: extremely conservative,
 * engine-agnostic, and driven solely by ErrorEnvelope.
 */
export function processHeartbeat(
    current: TorrentEntity[],
    previous: TorrentEntity[] | undefined | null,
    pauseCallback?: PauseCallback
) {
    const prevById = new Map<string, TorrentEntity>();
    if (previous) {
        for (const p of previous) prevById.set(p.id, p);
    }

    for (const t of current) {
        const curEnv: ErrorEnvelope | undefined | null = t.errorEnvelope;
        const prev = prevById.get(t.id);
        const prevEnv: ErrorEnvelope | undefined | null = prev?.errorEnvelope;

        // Automation #1: auto-pause on disk exhaustion
        try {
            if (
                curEnv &&
                curEnv.errorClass === "diskFull" &&
                curEnv.recoveryState === "blocked"
            ) {
                const fp = curEnv.fingerprint ?? null;
                if (fp) {
                    if (!autoPausedFingerprints.has(fp)) {
                        autoPausedFingerprints.add(fp);
                        // Fire-and-forget pause; do not await here to avoid
                        // blocking heartbeat. If pauseCallback is not
                        // provided, remain conservative and do nothing.
                        if (pauseCallback) {
                            // Call asynchronously, swallow errors.
                            void (async () => {
                                try {
                                    await pauseCallback([t.id]);
                                } catch (e) {
                                    // noop - automation must be conservative
                                }
                            })();
                        }
                    }
                }
            }
        } catch {
            // Defensive: never throw from automation.
        }

        // Automation #2: silent clear of transient tracker warnings
        try {
            if (prevEnv && prevEnv.errorClass === "trackerWarning") {
                // Track fingerprint when warning first seen
                const prevFp = prevEnv.fingerprint;
                if (prevFp) transientTrackerFingerprints.add(prevFp);
            }

            if (
                prevEnv &&
                prevEnv.errorClass === "trackerWarning" &&
                (!curEnv || curEnv.errorClass === "none")
            ) {
                const prevFp = prevEnv.fingerprint;
                if (prevFp && transientTrackerFingerprints.has(prevFp)) {
                    // Clear internal transient state silently.
                    transientTrackerFingerprints.delete(prevFp);
                }
            }
        } catch {
            // Defensive: swallow
        }
    }
}

export function _resetForTests() {
    autoPausedFingerprints.clear();
    transientTrackerFingerprints.clear();
}

export default { processHeartbeat, _resetForTests };
