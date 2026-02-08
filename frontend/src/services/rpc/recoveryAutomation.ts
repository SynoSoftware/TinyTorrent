import type { ErrorEnvelope, TorrentEntity } from "@/services/rpc/entities";

// Minimal heartbeat processing: stamp `lastErrorAt` based on fingerprint
// first-seen time. This module MUST NOT perform automation actions or
// suppress engine-driven prompts — UI automation is removed per contract.
// Session-scoped runtime cache.
// Owner: `resetRecoveryRuntimeSessionState` in `services/recovery/recovery-runtime-lifecycle.ts`.
let FIRST_SEEN_MS = new Map<string, number>();

export function resetRecoveryAutomationRuntimeState() {
    FIRST_SEEN_MS.clear();
}

export function configure(_opts: { coolDownMs?: number } = {}) {
    // no-op: automation knobs removed to enforce engine-first recovery
}

export function processHeartbeat(
    current: TorrentEntity[],
    previous: TorrentEntity[] | undefined | null
) {
    const now = Date.now();
    const prevById = new Map<string, TorrentEntity>();
    if (previous) {
        for (const p of previous) prevById.set(p.id, p);
    }

    for (const t of current) {
        try {
            const curEnv: ErrorEnvelope | undefined | null = t.errorEnvelope;
            const prev = prevById.get(t.id);
            const prevEnv: ErrorEnvelope | undefined | null =
                prev?.errorEnvelope;
            const curFp = curEnv?.fingerprint ?? null;
            const prevFp = prevEnv?.fingerprint ?? null;

            if (curEnv && curEnv.errorClass !== "none" && curFp) {
                let stampedAt: number;
                if (
                    prevEnv &&
                    prevFp === curFp &&
                    prevEnv.lastErrorAt != null
                ) {
                    stampedAt = prevEnv.lastErrorAt;
                } else if (FIRST_SEEN_MS.has(curFp)) {
                    stampedAt = FIRST_SEEN_MS.get(curFp) as number;
                } else {
                    FIRST_SEEN_MS.set(curFp, now);
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
        } catch {
            // Defensive: never throw from heartbeat processing
        }
    }
}

export function _resetForTests() {
    resetRecoveryAutomationRuntimeState();
}

export default { processHeartbeat, configure, _resetForTests };
