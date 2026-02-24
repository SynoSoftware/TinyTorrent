import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TorrentDetailEntity, TorrentEntity } from "@/services/rpc/entities";
import { scheduler } from "@/app/services/scheduler";
import { STATUS } from "@/shared/status";
import { setClassificationOverride } from "@/services/recovery/missingFilesStore";
import { GHOST_TIMEOUT_MS, RECOVERY_VERIFY_WATCH_INTERVAL_MS } from "@/config/logic";
import type {
    MissingFilesClassification,
    RecoverySequenceOptions,
    RecoverySequenceResult,
} from "@/services/recovery/recovery-contracts";

const VERIFY_WATCH_TIMEOUT_MS = GHOST_TIMEOUT_MS;

// Session-scoped runtime caches.
// Owner: `resetRecoveryRuntimeSessionState` in `services/recovery/recovery-runtime-lifecycle.ts`.
const VERIFY_GUARD = new Map<string, number | null>();

export function resetVerifyGuard() {
    VERIFY_GUARD.clear();
}

export function shouldSkipVerify(fingerprint?: string | null, left?: number | null) {
    if (!fingerprint || left === null) return false;
    const entry = VERIFY_GUARD.get(fingerprint);
    return entry !== undefined && entry === left;
}

export function recordVerifyAttempt(fingerprint: string | null, left: number | null) {
    if (!fingerprint) return;
    VERIFY_GUARD.set(fingerprint, left);
}

export function clearVerifyGuardEntry(fingerprint?: string | null) {
    if (!fingerprint) return;
    VERIFY_GUARD.delete(fingerprint);
}

interface VerifyWatchResult {
    success: boolean;
    leftUntilDone: number | null;
    state?: string;
    aborted?: boolean;
}

export async function watchVerifyCompletion(
    client: EngineAdapter,
    torrentId: string,
    signal?: AbortSignal,
): Promise<VerifyWatchResult> {
    if (!client.getTorrentDetails) {
        return { success: true, leftUntilDone: null };
    }
    const deadline = Date.now() + VERIFY_WATCH_TIMEOUT_MS;
    let lastLeft: number | null = null;
    let lastState: string | undefined;
    while (Date.now() < deadline) {
        if (signal?.aborted) {
            return {
                success: false,
                leftUntilDone: lastLeft,
                state: lastState,
                aborted: true,
            };
        }
        try {
            const detail = await client.getTorrentDetails(torrentId, {
                profile: "standard",
                includeTrackerStats: false,
            });
            const state = detail.state;
            const left = typeof detail.leftUntilDone === "number" ? detail.leftUntilDone : null;
            lastLeft = left;
            lastState = state;
            if (!isCheckingState(state)) {
                const isErrorState = isTerminalErrorState(state);
                return {
                    success: !isErrorState,
                    leftUntilDone: left,
                    state,
                };
            }
        } catch {
            // best-effort; continue polling
        }
        await delay(RECOVERY_VERIFY_WATCH_INTERVAL_MS);
    }
    return {
        success: false,
        leftUntilDone: lastLeft,
        state: lastState,
    };
}

export async function runMinimalRecoverySequence(
    params: {
        client: EngineAdapter;
        torrent: TorrentEntity | TorrentDetailEntity;
        classification: MissingFilesClassification;
        fingerprint: string;
    },
    options?: RecoverySequenceOptions,
): Promise<RecoverySequenceResult> {
    const { client, torrent, fingerprint } = params;
    let { classification } = params;
    const left = typeof torrent.leftUntilDone === "number" ? torrent.leftUntilDone : null;
    let leftAfterVerify: number | null = left;
    const skipVerifyForEmpty = Boolean(options?.skipVerifyIfEmpty);
    const shouldVerify = determineShouldVerify(torrent) && !skipVerifyForEmpty;
    const skipVerify = shouldVerify && shouldSkipVerify(fingerprint, left);
    const signal = options?.signal;
    let didRunVerify = false;
    let verifyExitState: string | undefined;

    if (shouldVerify) {
        if (skipVerify) {
            const isErrorState =
                torrent.state === STATUS.torrent.ERROR || torrent.state === STATUS.torrent.MISSING_FILES;
            if (isErrorState) {
                return {
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "blocked",
                        reason: "error",
                        message: "verify_required",
                    },
                };
            }
            classification = {
                ...classification,
                kind: "dataGap",
                confidence: "certain",
            };
            if (torrent.id) {
                setClassificationOverride(torrent.id, classification);
            }
        } else {
            if (signal?.aborted) {
                return { status: "noop", classification };
            }
            try {
                await client.verify([torrent.id]);
                didRunVerify = true;
                const watchResult = await watchVerifyCompletion(client, torrent.id, signal);
                if (!watchResult.success) {
                    if (watchResult.aborted) {
                        return {
                            status: "noop",
                            classification,
                        };
                    }
                    if (watchResult.state && isTerminalErrorState(watchResult.state)) {
                        return {
                            status: "needsModal",
                            classification,
                            blockingOutcome: {
                                kind: "blocked",
                                reason: "error",
                                message: "verify_failed",
                            },
                        };
                    }
                    return {
                        status: "resolved",
                        classification,
                        log: "verify_timeout",
                    };
                }
                if (watchResult.leftUntilDone !== null) {
                    leftAfterVerify = watchResult.leftUntilDone;
                }
                verifyExitState = watchResult.state;
                recordVerifyAttempt(fingerprint, leftAfterVerify);
                if (leftAfterVerify === left) {
                    classification = {
                        ...classification,
                        kind: "dataGap",
                        confidence: "certain",
                    };
                }
            } catch {
                return {
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "blocked",
                        reason: "error",
                        message: "verify_failed",
                    },
                };
            }
            if (torrent.id) {
                setClassificationOverride(torrent.id, classification);
            }
        }
    }

    if (signal?.aborted) {
        return { status: "noop", classification };
    }

    if (didRunVerify && verifyExitState === STATUS.torrent.PAUSED) {
        if (torrent.id) {
            setClassificationOverride(torrent.id, classification);
        }
        return {
            status: "resolved",
            classification,
            log: "verify_completed_paused",
        };
    }

    try {
        await client.resume([torrent.id]);
    } catch {
        return {
            status: "needsModal",
            classification,
            blockingOutcome: {
                kind: "blocked",
                reason: "missing",
                message: "path_check_failed",
            },
        };
    }

    if (torrent.id) {
        setClassificationOverride(torrent.id, classification);
    }
    if (leftAfterVerify === 0) {
        return {
            status: "resolved",
            classification,
            log: "all_verified_resuming",
        };
    }

    return {
        status: "resolved",
        classification,
    };
}

function determineShouldVerify(torrent: TorrentEntity | TorrentDetailEntity): boolean {
    if (isCheckingState(torrent.state)) {
        return false;
    }
    const isActive = torrent.state === STATUS.torrent.DOWNLOADING || torrent.state === STATUS.torrent.SEEDING;
    const left = typeof torrent.leftUntilDone === "number" ? torrent.leftUntilDone : null;
    const expected =
        typeof torrent.sizeWhenDone === "number"
            ? torrent.sizeWhenDone
            : typeof torrent.totalSize === "number"
              ? torrent.totalSize
              : null;
    if (left !== null && expected !== null && typeof expected === "number" && left === expected) {
        return false;
    }
    if (left === null || left <= 0) {
        return true;
    }
    return !isActive;
}

function isCheckingState(state?: string) {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return normalized === STATUS.torrent.CHECKING || normalized === "check_wait" || normalized === "check_waiting";
}

function isTerminalErrorState(state?: string) {
    return state === STATUS.torrent.ERROR || state === STATUS.torrent.MISSING_FILES;
}

function delay(ms: number) {
    return new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });
}
