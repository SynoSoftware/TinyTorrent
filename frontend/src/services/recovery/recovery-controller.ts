import type {
    EngineAdapter,
    EngineCapabilities,
    EngineExecutionModel,
} from "@/services/rpc/engine-adapter";
import type {
    TorrentDetailEntity,
    TorrentEntity,
    ErrorEnvelope,
} from "@/services/rpc/entities";
import { STATUS } from "@/shared/status";
import {
    deriveMissingFilesStateKind,
    type MissingFilesStateKind,
} from "@/shared/utils/recoveryFormat";
import { interpretFsError, type FsErrorKind } from "@/shared/utils/fsErrors";
import {
    getClassificationOverride,
    setClassificationOverride,
} from "@/services/recovery/missingFilesStore";

export type RecoveryOutcome =
    | { kind: "resolved"; message?: string }
    | {
          kind: "path-needed";
          reason: "missing" | "unwritable" | "disk-full";
          hintPath?: string;
          message?: string;
      }
    | { kind: "verify-started"; message?: string }
    | { kind: "reannounce-started"; message?: string }
    | { kind: "noop"; message?: string }
    | { kind: "error"; message: string };

export interface RecoveryControllerDeps {
    client: EngineAdapter;
    detail: TorrentDetailEntity;
    envelope?: ErrorEnvelope | null | undefined;
}

export type ConfidenceLevel = "certain" | "likely" | "unknown";

export type RecoveryRecommendedAction =
    | "downloadMissing"
    | "locate"
    | "retry"
    | "openFolder"
    | "chooseLocation";

export interface MissingFilesClassification {
    kind: MissingFilesStateKind;
    confidence: ConfidenceLevel;
    path?: string;
    root?: string;
    recommendedActions: readonly RecoveryRecommendedAction[];
}

export type MissingFilesProbeResult =
    | {
          kind: "path_missing";
          confidence: ConfidenceLevel;
          path: string;
          expectedBytes: number;
          onDiskBytes: number | null;
          missingBytes: number | null;
          toDownloadBytes: number | null;
          ts: number;
      }
    | {
          kind: "data_missing";
          confidence: ConfidenceLevel;
          expectedBytes: number;
          onDiskBytes: number | null;
          missingBytes: number | null;
          toDownloadBytes: number | null;
          ts: number;
      }
    | {
          kind: "data_partial";
          confidence: ConfidenceLevel;
          expectedBytes: number;
          onDiskBytes: number;
          missingBytes: number;
          toDownloadBytes: number;
          ts: number;
      }
    | {
          kind: "unknown";
          confidence: ConfidenceLevel;
          expectedBytes: number;
          ts: number;
      }
    | {
          kind: "ok";
          confidence: ConfidenceLevel;
          expectedBytes: number;
          onDiskBytes: number;
          missingBytes: number;
          toDownloadBytes: number;
          ts: number;
      };

export interface RecoverySequenceOptions {
    recreateFolder?: boolean;
    retryOnly?: boolean;
    missingBytes?: number | null;
    signal?: AbortSignal;
    skipVerifyIfEmpty?: boolean;
    autoCreateMissingFolder?: boolean;
}

export interface RecoverySequenceParams {
    client: EngineAdapter;
    torrent: TorrentEntity | TorrentDetailEntity;
    envelope: ErrorEnvelope;
    classification: MissingFilesClassification;
    engineCapabilities: EngineCapabilities;
    options?: RecoverySequenceOptions;
}

export type RecoverySequenceStatus = "resolved" | "needsModal" | "noop";

export interface RecoverySequenceResult {
    status: RecoverySequenceStatus;
    classification: MissingFilesClassification;
    blockingOutcome?: RecoveryOutcome;
    log?: string;
}

// Session-scoped runtime caches.
// Owner: `resetRecoveryRuntimeSessionState` in `services/recovery/recovery-runtime-lifecycle.ts`.
const VERIFY_GUARD = new Map<string, number | null>();

export function resetVerifyGuard() {
    VERIFY_GUARD.clear();
}

export function shouldSkipVerify(
    fingerprint?: string | null,
    left?: number | null,
) {
    if (!fingerprint || left === null) return false;
    const entry = VERIFY_GUARD.get(fingerprint);
    return entry !== undefined && entry === left;
}

export function recordVerifyAttempt(
    fingerprint: string | null,
    left: number | null,
) {
    if (!fingerprint) return;
    VERIFY_GUARD.set(fingerprint, left);
}

export function clearVerifyGuardEntry(fingerprint?: string | null) {
    if (!fingerprint) return;
    VERIFY_GUARD.delete(fingerprint);
}

function deriveFingerprint(
    torrent: TorrentEntity | TorrentDetailEntity,
    envelope: ErrorEnvelope,
) {
    return (
        envelope.fingerprint ??
        torrent.hash ??
        torrent.id ??
        "<no-recovery-fingerprint>"
    );
}

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 2000;
const VERIFY_WATCH_INTERVAL_MS = 500;
const VERIFY_WATCH_TIMEOUT_MS = 30000;
const FREE_SPACE_UNSUPPORTED_MESSAGE = "free_space_check_not_supported";
const IN_FLIGHT_RECOVERY = new Map<string, Promise<RecoverySequenceResult>>();

export function resetRecoveryControllerState() {
    VERIFY_GUARD.clear();
    IN_FLIGHT_RECOVERY.clear();
}

function getExpectedBytes(
    torrent: TorrentEntity | TorrentDetailEntity,
): number {
    if (typeof torrent.totalSize === "number") {
        return torrent.totalSize;
    }
    if (typeof torrent.sizeWhenDone === "number") {
        return torrent.sizeWhenDone;
    }
    return 0;
}

interface ClassificationOptions {
    torrentId?: string | number;
    engineCapabilities: EngineCapabilities;
}

export function classifyMissingFilesState(
    envelope: ErrorEnvelope | null | undefined,
    downloadDir: string | undefined,
    opts: ClassificationOptions,
): MissingFilesClassification {
    const override = opts.torrentId
        ? getClassificationOverride(opts.torrentId)
        : undefined;
    const overrideKind = override?.kind ?? envelope?.recoveryKind;
    const overrideConfidence =
        override?.confidence ?? envelope?.recoveryConfidence;
    const kind =
        overrideKind ??
        (envelope
            ? deriveMissingFilesStateKind(envelope, downloadDir)
            : "dataGap");
    const root = resolveRootFromPath(downloadDir);
    const executionModel = opts.engineCapabilities.executionModel;
    const confidence =
        overrideConfidence ??
        determineConfidence(kind, envelope, executionModel);
    return {
        kind,
        confidence,
        path: override?.path ?? downloadDir,
        root: override?.root ?? root,
        recommendedActions: deriveRecommendedActions(kind),
    };
}

function determineConfidence(
    kind: MissingFilesStateKind,
    envelope: ErrorEnvelope | null | undefined,
    executionModel: EngineExecutionModel,
): ConfidenceLevel {
    if (executionModel === "local") {
        return "certain";
    }
    if (envelope?.errorClass === "missingFiles") {
        return "likely";
    }
    if (
        kind === "pathLoss" ||
        kind === "volumeLoss" ||
        kind === "accessDenied"
    ) {
        return "likely";
    }
    return "unknown";
}

function resolveRootFromPath(path?: string) {
    if (!path) return undefined;
    const driveMatch = path.match(/^([a-zA-Z]:)([\\/]|$)/);
    if (driveMatch) {
        return driveMatch[1];
    }
    const uncMatch = path.match(/^(\\\\[^\\/]+\\[^\\/]+)/);
    if (uncMatch) {
        return uncMatch[1];
    }
    return path;
}

const RECOVERY_ERROR_CLASSES: ReadonlySet<string> = new Set([
    "missingFiles",
    "permissionDenied",
    "diskFull",
]);

const RECOVERY_RECOMMENDED_ACTIONS: Record<
    MissingFilesStateKind,
    readonly RecoveryRecommendedAction[]
> = {
    dataGap: ["downloadMissing", "openFolder"],
    pathLoss: ["locate", "downloadMissing"],
    volumeLoss: ["retry", "locate"],
    accessDenied: ["chooseLocation", "locate"],
};

export function deriveRecommendedActions(
    kind: MissingFilesStateKind,
): readonly RecoveryRecommendedAction[] {
    return RECOVERY_RECOMMENDED_ACTIONS[kind] ?? ["locate"];
}

function normalizePathForComparison(path?: string): string {
    if (!path) return "";
    return path.replace(/[\\/]+$/, "").toLowerCase();
}

function appendTrailingSlashForForce(path: string): string {
    if (!path) return path;
    if (path.endsWith("\\") || path.endsWith("/")) return path;
    return `${path}\\`;
}

export async function recoverMissingFiles(
    params: RecoverySequenceParams,
): Promise<RecoverySequenceResult> {
    const { client, torrent, envelope, options } = params;
    let classification = params.classification;
    if (!envelope || !RECOVERY_ERROR_CLASSES.has(envelope.errorClass ?? "")) {
        return { status: "noop", classification };
    }
    const fingerprint = deriveFingerprint(torrent, envelope);
    if (IN_FLIGHT_RECOVERY.has(fingerprint)) {
        return IN_FLIGHT_RECOVERY.get(fingerprint)!;
    }

    // Create a deferred promise and store it synchronously so concurrent callers
    // receive the same Promise instance (dedupe in-flight recovery calls).
    const deferredHandlers: {
        resolve: (v: RecoverySequenceResult) => void;
        reject: (e: unknown) => void;
    } = {
        resolve: () => {},
        reject: () => {},
    };

    const deferredPromise = new Promise<RecoverySequenceResult>(
        (resolve, reject) => {
            deferredHandlers.resolve = resolve;
            deferredHandlers.reject = reject;
        },
    );

    IN_FLIGHT_RECOVERY.set(fingerprint, deferredPromise);

    (async () => {
        try {
            const downloadDir =
                (torrent as TorrentDetailEntity).downloadDir ??
                torrent.savePath ??
                torrent.downloadDir ??
                "";
            const compareCurrent = normalizePathForComparison(
                (torrent as TorrentDetailEntity).downloadDir ??
                    torrent.savePath ??
                    torrent.downloadDir,
            );
            const compareRequested = normalizePathForComparison(downloadDir);
            const requestLocation =
                compareCurrent && compareCurrent === compareRequested
                    ? appendTrailingSlashForForce(downloadDir)
                    : downloadDir;

            const missingBytes =
                typeof torrent.leftUntilDone === "number"
                    ? torrent.leftUntilDone
                    : null;
            const sequenceOptions = {
                ...options,
                missingBytes,
            };

            if (!downloadDir) {
                deferredHandlers.resolve({
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "path-needed",
                        reason: "missing",
                        message: "no_download_path_known",
                    },
                });
                return;
            }

            if (classification.kind === "volumeLoss") {
                if (!client.checkFreeSpace) {
                    deferredHandlers.resolve({
                        status: "needsModal",
                        classification,
                        blockingOutcome: {
                            kind: "path-needed",
                            reason: "missing",
                            message: FREE_SPACE_UNSUPPORTED_MESSAGE,
                        },
                    });
                    return;
                }
                const probe = await pollPathAvailability(
                    client,
                    downloadDir,
                    options?.signal,
                );
                if (!probe.success) {
                    const reason = deriveReasonFromFsError(probe.errorKind);
                    deferredHandlers.resolve({
                        status: "needsModal",
                        classification,
                        blockingOutcome: {
                            kind: "path-needed",
                            reason,
                            message:
                                probe.errorKind === "enospc"
                                    ? "disk_full"
                                    : probe.errorKind === "eacces"
                                      ? "path_access_denied"
                                      : "path_check_failed",
                        },
                    });
                    return;
                } else {
                    classification = {
                        ...classification,
                        confidence: "likely",
                    };
                    if (torrent.id) {
                        setClassificationOverride(torrent.id, classification);
                    }
                }
            }

            if (options?.retryOnly) {
                deferredHandlers.resolve({
                    status: "noop",
                    classification,
                });
                return;
            }

            const ensure = await ensurePathReady({
                client,
                path: downloadDir,
                options: sequenceOptions,
            });
            if (!ensure.ready) {
                if (ensure.blockingOutcome) {
                    deferredHandlers.resolve({
                        status: "needsModal",
                        classification,
                        blockingOutcome: ensure.blockingOutcome,
                    });
                    return;
                }
                deferredHandlers.resolve({
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "path-needed",
                        reason: "missing",
                        message: "path_check_failed",
                    },
                });
                return;
            }

            if (client.setTorrentLocation) {
                try {
                    await client.setTorrentLocation(
                        torrent.id,
                        requestLocation,
                        false,
                    );
                } catch (err) {
                    const reason = deriveReasonFromFsError(
                        interpretFsError(err),
                    );
                    deferredHandlers.resolve({
                        status: "needsModal",
                        classification,
                        blockingOutcome: {
                            kind: "path-needed",
                            reason,
                            message: "set_torrent_location_failed",
                        },
                    });
                    return;
                }
            }

            const minimal = await runMinimalSequence(
                {
                    client,
                    torrent,
                    envelope,
                    classification,
                },
                options,
            );
            deferredHandlers.resolve(minimal);
        } catch (err) {
            deferredHandlers.reject(err);
        } finally {
            IN_FLIGHT_RECOVERY.delete(fingerprint);
        }
    })();

    return deferredPromise;
}

interface EnsurePathParams {
    client: EngineAdapter;
    path: string;
    options?: RecoverySequenceOptions;
}

async function ensurePathReady({
    client,
    path,
    options,
}: EnsurePathParams): Promise<{
    ready: boolean;
    blockingOutcome?: RecoveryOutcome;
}> {
    // This helper never creates folders; host filesystem mutation must go
    // through ShellAgent in local Full mode, not through daemon RPC.
    // In Rpc mode we surface explicit unsupported outcomes.
    // Capability flags are advisory; if the adapter provides `checkFreeSpace`, we can probe.
    // Tests and some adapters use DEFAULT_ENGINE_CAPABILITIES while still supporting this call.
    if (!client.checkFreeSpace) {
        return {
            ready: false,
            blockingOutcome: {
                kind: "path-needed",
                reason: "missing",
                message: FREE_SPACE_UNSUPPORTED_MESSAGE,
            },
        };
    }
    try {
        const freeSpace = await client.checkFreeSpace(path);
        const needed = options?.missingBytes;
        if (typeof needed === "number" && freeSpace.sizeBytes < needed) {
            return {
                ready: false,
                blockingOutcome: {
                    kind: "path-needed",
                    reason: "disk-full",
                    message: "insufficient_free_space",
                },
            };
        }
        return { ready: true };
    } catch (err) {
        const kind = interpretFsError(err);
        if (kind === "enoent") {
            const shouldCreateFolder =
                Boolean(options?.recreateFolder) ||
                Boolean(options?.autoCreateMissingFolder);
            if (shouldCreateFolder) {
                return {
                    ready: false,
                    blockingOutcome: {
                        kind: "path-needed",
                        reason: "missing",
                        message: "directory_creation_not_supported",
                    },
                };
            }
            return {
                ready: false,
                blockingOutcome: {
                    kind: "path-needed",
                    reason: "missing",
                    message: "path_check_failed",
                },
            };
        }
        if (kind === "eacces") {
            return {
                ready: false,
                blockingOutcome: {
                    kind: "path-needed",
                    reason: "unwritable",
                    message: "path_access_denied",
                },
            };
        }
        if (kind === "enospc") {
            return {
                ready: false,
                blockingOutcome: {
                    kind: "path-needed",
                    reason: "disk-full",
                    message: "insufficient_free_space",
                },
            };
        }
        return {
            ready: false,
            blockingOutcome: {
                kind: "path-needed",
                reason: "missing",
                message: "path_check_failed",
            },
        };
    }
}

type PathProbeResult =
    | { success: true }
    | { success: false; errorKind: FsErrorKind };

export async function pollPathAvailability(
    client: EngineAdapter,
    path: string,
    signal?: AbortSignal,
): Promise<PathProbeResult> {
    if (!client.checkFreeSpace) {
        return { success: false, errorKind: "other" as FsErrorKind };
    }
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lastKind: FsErrorKind | null = null;
    while (Date.now() < deadline) {
        if (signal?.aborted) {
            return { success: false, errorKind: lastKind ?? "other" };
        }
        try {
            await client.checkFreeSpace(path);
            return { success: true };
        } catch (err) {
            lastKind = interpretFsError(err);
        }
        await delay(POLL_INTERVAL_MS);
    }
    return { success: false, errorKind: lastKind ?? "other" };
}

function isCheckingState(state?: string) {
    if (!state) return false;
    const normalized = state.toLowerCase();
    return (
        normalized === "checking" ||
        normalized === "check_wait" ||
        normalized === "check_waiting"
    );
}

function isTerminalErrorState(state?: string) {
    return (
        state === STATUS.torrent.ERROR || state === STATUS.torrent.MISSING_FILES
    );
}

interface VerifyWatchResult {
    success: boolean;
    leftUntilDone: number | null;
    state?: string;
    aborted?: boolean;
}

async function watchVerifyCompletion(
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
            const detail = await client.getTorrentDetails(torrentId);
            const state = detail.state;
            const left =
                typeof detail.leftUntilDone === "number"
                    ? detail.leftUntilDone
                    : null;
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
        await delay(VERIFY_WATCH_INTERVAL_MS);
    }
    return {
        success: false,
        leftUntilDone: lastLeft,
        state: lastState,
    };
}

async function runMinimalSequence(
    params: {
        client: EngineAdapter;
        torrent: TorrentEntity | TorrentDetailEntity;
        envelope: ErrorEnvelope;
        classification: MissingFilesClassification;
    },
    options?: RecoverySequenceOptions,
): Promise<RecoverySequenceResult> {
    const { client, torrent, envelope } = params;
    let { classification } = params;
    const fingerprint = deriveFingerprint(torrent, envelope);
    const left =
        typeof torrent.leftUntilDone === "number"
            ? torrent.leftUntilDone
            : null;
    // leftAfterVerify tracks remaining bytes after any verify operation.
    let leftAfterVerify: number | null = left;
    const skipVerifyForEmpty = Boolean(options?.skipVerifyIfEmpty);
    const shouldVerify = determineShouldVerify(torrent) && !skipVerifyForEmpty;
    const skipVerify = shouldVerify && shouldSkipVerify(fingerprint, left);
    const signal = options?.signal;

    if (shouldVerify) {
        if (skipVerify) {
            const isErrorState =
                torrent.state === STATUS.torrent.ERROR ||
                torrent.state === STATUS.torrent.MISSING_FILES;
            if (isErrorState) {
                return {
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "error",
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
                const watchResult = await watchVerifyCompletion(
                    client,
                    torrent.id,
                    signal,
                );
                if (!watchResult.success) {
                    if (watchResult.aborted) {
                        return {
                            status: "noop",
                            classification,
                        };
                    }
                    if (
                        watchResult.state &&
                        isTerminalErrorState(watchResult.state)
                    ) {
                        return {
                            status: "needsModal",
                            classification,
                            blockingOutcome: {
                                kind: "error",
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
                        kind: "error",
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

    try {
        await client.resume([torrent.id]);
    } catch {
        return {
            status: "needsModal",
            classification,
            blockingOutcome: {
                kind: "path-needed",
                reason: "missing",
                message: "path_check_failed",
            },
        };
    }

    if (torrent.id) {
        setClassificationOverride(torrent.id, classification);
    }
    // Fast-path: if a verify completed and left after verify is zero,
    // return a log flag so callers can surface a toast (all files verified).
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

function determineShouldVerify(
    torrent: TorrentEntity | TorrentDetailEntity,
): boolean {
    if (isCheckingState(torrent.state)) {
        return false;
    }
    const isActive =
        torrent.state === STATUS.torrent.DOWNLOADING ||
        torrent.state === STATUS.torrent.SEEDING;
    const left =
        typeof torrent.leftUntilDone === "number"
            ? torrent.leftUntilDone
            : null;
    const expected =
        typeof torrent.sizeWhenDone === "number"
            ? torrent.sizeWhenDone
            : typeof torrent.totalSize === "number"
              ? torrent.totalSize
              : null;
    if (
        left !== null &&
        expected !== null &&
        typeof expected === "number" &&
        left === expected
    ) {
        return false;
    }
    if (left === null || left <= 0) {
        return true;
    }
    return !isActive;
}

function deriveReasonFromFsError(kind: FsErrorKind | null) {
    if (kind === "eacces") {
        return "unwritable";
    }
    if (kind === "enospc") {
        return "disk-full";
    }
    return "missing";
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function probeMissingFiles(
    torrent: TorrentEntity | TorrentDetailEntity,
    client: EngineAdapter,
    engineCapabilities: EngineCapabilities,
): Promise<MissingFilesProbeResult> {
    const ts = Date.now();
    const expectedBytes = getExpectedBytes(torrent);
    const path =
        (torrent as TorrentDetailEntity).downloadDir ??
        torrent.savePath ??
        torrent.downloadDir ??
        "";

    // Local (tinytorrent): attempt authoritative probe
    if (engineCapabilities.executionModel === "local") {
        let onDiskBytes: number | null = null;
        if (client.getTorrentDetails) {
            try {
                const detail = await client.getTorrentDetails(torrent.id);
                if (Array.isArray(detail.files)) {
                    onDiskBytes = detail.files.reduce((acc, file) => {
                        const bytes =
                            typeof file.bytesCompleted === "number"
                                ? file.bytesCompleted
                                : 0;
                        return acc + Math.max(0, bytes);
                    }, 0);
                }
            } catch {
                onDiskBytes = null;
            }
        }
        // Fallback: use downloaded metric if available
        if (onDiskBytes === null && typeof torrent.downloaded === "number") {
            onDiskBytes = Math.max(0, torrent.downloaded);
        }
        const missingBytes =
            onDiskBytes !== null
                ? Math.max(0, expectedBytes - onDiskBytes)
                : null;
        const toDownloadBytes = missingBytes;

        // Path probing for missing folder
        let pathExists: boolean | null = null;
        if (
            engineCapabilities.canCheckFreeSpace &&
            client.checkFreeSpace &&
            path
        ) {
            try {
                await client.checkFreeSpace(path);
                pathExists = true;
            } catch (err) {
                const kind = interpretFsError(err);
                if (kind === "enoent") {
                    pathExists = false;
                }
            }
        }

        if (pathExists === false) {
            return {
                kind: "path_missing",
                confidence: "certain",
                path,
                expectedBytes,
                onDiskBytes: 0,
                missingBytes: expectedBytes,
                toDownloadBytes: expectedBytes,
                ts,
            };
        }

        if (onDiskBytes === null) {
            return {
                kind: "unknown",
                confidence: "unknown",
                expectedBytes,
                ts,
            };
        }

        if (onDiskBytes <= 0 && expectedBytes > 0) {
            return {
                kind: "data_missing",
                confidence: "certain",
                expectedBytes,
                onDiskBytes,
                missingBytes: expectedBytes,
                toDownloadBytes: expectedBytes,
                ts,
            };
        }
        if (onDiskBytes < expectedBytes) {
            return {
                kind: "data_partial",
                confidence: "certain",
                expectedBytes,
                onDiskBytes,
                missingBytes: missingBytes ?? expectedBytes,
                toDownloadBytes: toDownloadBytes ?? expectedBytes,
                ts,
            };
        }
        return {
            kind: "ok",
            confidence: "certain",
            expectedBytes,
            onDiskBytes,
            missingBytes: 0,
            toDownloadBytes: 0,
            ts,
        };
    }

    // RPC: heuristic only, no bytes
    const classification = classifyMissingFilesState(
        torrent.errorEnvelope ?? null,
        path,
        {
            torrentId: torrent.id ?? torrent.hash,
            engineCapabilities,
        },
    );
    const kindMap: Record<
        MissingFilesStateKind,
        MissingFilesProbeResult["kind"]
    > = {
        dataGap: "unknown",
        pathLoss: "path_missing",
        volumeLoss: "path_missing",
        accessDenied: "data_missing",
    };
    const kind = kindMap[classification.kind] ?? "unknown";
    if (kind === "path_missing") {
        return {
            kind: "path_missing",
            confidence: classification.confidence,
            path,
            expectedBytes,
            onDiskBytes: null,
            missingBytes: null,
            toDownloadBytes: null,
            ts,
        };
    }

    if (kind === "data_missing") {
        return {
            kind: "data_missing",
            confidence: classification.confidence,
            expectedBytes,
            onDiskBytes: null,
            missingBytes: null,
            toDownloadBytes: null,
            ts,
        };
    }

    return {
        kind: "unknown",
        confidence: classification.confidence,
        expectedBytes,
        ts,
    };
}

export async function runPartialFilesRecovery(
    deps: RecoveryControllerDeps,
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.verify) {
        return { kind: "error", message: "verify_not_supported" };
    }
    try {
        await client.verify([detail.id]);
        return { kind: "verify-started", message: "verify_started" };
    } catch {
        return {
            kind: "error",
            message: "verify_failed",
        };
    }
}

export async function runReannounce(
    deps: RecoveryControllerDeps,
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.forceTrackerReannounce)
        return { kind: "error", message: "reannounce_not_supported" };
    try {
        await client.forceTrackerReannounce(detail.id);
        return { kind: "reannounce-started", message: "reannounce_started" };
    } catch {
        return {
            kind: "error",
            message: "reannounce_failed",
        };
    }
}
