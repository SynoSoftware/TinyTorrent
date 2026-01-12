import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    TorrentDetailEntity,
    TorrentEntity,
    ErrorEnvelope,
    ServerClass,
} from "@/services/rpc/entities";
import { STATUS } from "@/shared/status";
import {
    deriveMissingFilesStateKind,
    type MissingFilesStateKind,
} from "@/shared/utils/recoveryFormat";
import { interpretFsError, type FsErrorKind } from "@/shared/utils/fsErrors";

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

export interface MissingFilesClassification {
    kind: MissingFilesStateKind;
    confidence: ConfidenceLevel;
    path?: string;
    root?: string;
}

export interface RecoverySequenceOptions {
    recreateFolder?: boolean;
    retryOnly?: boolean;
}

export interface RecoverySequenceParams {
    client: EngineAdapter;
    torrent: TorrentEntity | TorrentDetailEntity;
    envelope: ErrorEnvelope;
    classification: MissingFilesClassification;
    serverClass: ServerClass;
    options?: RecoverySequenceOptions;
}

export type RecoverySequenceStatus = "resolved" | "needsModal" | "noop";

export interface RecoverySequenceResult {
    status: RecoverySequenceStatus;
    classification: MissingFilesClassification;
    blockingOutcome?: RecoveryOutcome;
    log?: string;
}

const VERIFY_GUARD = new Map<string, number | null>();

export function resetVerifyGuard() {
    VERIFY_GUARD.clear();
}

export function shouldSkipVerify(
    fingerprint?: string | null,
    left?: number | null
) {
    if (!fingerprint || left === null) return false;
    const entry = VERIFY_GUARD.get(fingerprint);
    return entry !== undefined && entry === left;
}

export function recordVerifyAttempt(
    fingerprint: string | null,
    left: number | null
) {
    if (!fingerprint) return;
    VERIFY_GUARD.set(fingerprint, left);
}

function deriveFingerprint(
    torrent: TorrentEntity | TorrentDetailEntity,
    envelope: ErrorEnvelope
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

export function classifyMissingFilesState(
    envelope: ErrorEnvelope | null | undefined,
    downloadDir?: string,
    serverClass: ServerClass = "unknown"
): MissingFilesClassification {
    const kind = envelope
        ? deriveMissingFilesStateKind(envelope, downloadDir)
        : "dataGap";
    const root = resolveRootFromPath(downloadDir);
    const confidence = determineConfidence(kind, envelope, serverClass);
    return {
        kind,
        confidence,
        path: downloadDir,
        root,
    };
}

function determineConfidence(
    kind: MissingFilesStateKind,
    envelope: ErrorEnvelope | null | undefined,
    serverClass: ServerClass
): ConfidenceLevel {
    if (serverClass === "tinytorrent") {
        return "certain";
    }
    if (
        kind === "pathLoss" ||
        kind === "volumeLoss" ||
        kind === "accessDenied"
    ) {
        if (envelope?.errorMessage?.length) {
            return "likely";
        }
        return "unknown";
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

export async function runMissingFilesRecoverySequence(
    params: RecoverySequenceParams
): Promise<RecoverySequenceResult> {
    const { client, torrent, envelope, classification, options } = params;
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
        }
    );

    IN_FLIGHT_RECOVERY.set(fingerprint, deferredPromise);

    (async () => {
        try {
            const downloadDir =
                (torrent as TorrentDetailEntity).downloadDir ??
                torrent.savePath ??
                torrent.downloadDir ??
                "";

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
                const probe = await pollPathAvailability(client, downloadDir);
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
                }
            }

            const ensure = await ensurePathReady({
                client,
                path: downloadDir,
                options,
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

            if (options?.retryOnly) {
                deferredHandlers.resolve({ status: "noop", classification });
                return;
            }

            if (client.setTorrentLocation) {
                try {
                    await client.setTorrentLocation(
                        torrent.id,
                        downloadDir,
                        false
                    );
                } catch (err) {
                    const reason = deriveReasonFromFsError(
                        interpretFsError(err)
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

            const minimal = await runMinimalSequence({
                client,
                torrent,
                envelope,
                classification,
            });
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
        await client.checkFreeSpace(path);
        return { ready: true };
    } catch (err) {
        const kind = interpretFsError(err);
        if (kind === "enoent") {
            if (options?.recreateFolder && client.createDirectory) {
                try {
                    await client.createDirectory(path);
                    return { ready: true };
                } catch (createErr) {
                    const createKind = interpretFsError(createErr);
                    if (createKind === "eacces") {
                        return {
                            ready: false,
                            blockingOutcome: {
                                kind: "path-needed",
                                reason: "unwritable",
                                message: "directory_creation_denied",
                            },
                        };
                    }
                    return {
                        ready: false,
                        blockingOutcome: {
                            kind: "path-needed",
                            reason: "missing",
                            message: "directory_creation_failed",
                        },
                    };
                }
            }
            return {
                ready: false,
                blockingOutcome: {
                    kind: "path-needed",
                    reason: "missing",
                    message:
                        client.createDirectory === undefined
                            ? "directory_creation_not_supported"
                            : "path_check_failed",
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

async function pollPathAvailability(
    client: EngineAdapter,
    path: string
): Promise<PathProbeResult> {
    if (!client.checkFreeSpace) {
        return { success: false, errorKind: "other" as FsErrorKind };
    }
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lastKind: FsErrorKind | null = null;
    while (Date.now() < deadline) {
        try {
            await client.checkFreeSpace(path);
            return { success: true };
        } catch (err) {
            lastKind = interpretFsError(err);
            if (lastKind !== "enoent") {
                return { success: false, errorKind: lastKind };
            }
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

async function watchVerifyCompletion(
    client: EngineAdapter,
    torrentId: string
): Promise<{ success: boolean; leftUntilDone: number | null; state?: string }> {
    if (!client.getTorrentDetails) {
        return { success: true, leftUntilDone: null };
    }
    const deadline = Date.now() + VERIFY_WATCH_TIMEOUT_MS;
    let lastLeft: number | null = null;
    while (Date.now() < deadline) {
        try {
            const detail = await client.getTorrentDetails(torrentId);
            const state = detail.state;
            const left =
                typeof detail.leftUntilDone === "number"
                    ? detail.leftUntilDone
                    : null;
            lastLeft = left;
            if (!isCheckingState(state)) {
                return { success: true, leftUntilDone: left, state };
            }
        } catch {
            // best-effort; continue polling
        }
        await delay(VERIFY_WATCH_INTERVAL_MS);
    }
    return { success: false, leftUntilDone: lastLeft };
}

async function runMinimalSequence(params: {
    client: EngineAdapter;
    torrent: TorrentEntity | TorrentDetailEntity;
    envelope: ErrorEnvelope;
    classification: MissingFilesClassification;
}): Promise<RecoverySequenceResult> {
    const { client, torrent, envelope } = params;
    let { classification } = params;
    const fingerprint = deriveFingerprint(torrent, envelope);
    const left =
        typeof torrent.leftUntilDone === "number"
            ? torrent.leftUntilDone
            : null;
    // leftAfterVerify tracks remaining bytes after any verify operation.
    let leftAfterVerify: number | null = left;
    const shouldVerify = determineShouldVerify(torrent);

    if (shouldVerify && client.verify) {
        if (!shouldSkipVerify(fingerprint, left)) {
            try {
                await client.verify([torrent.id]);
                const watchResult = await watchVerifyCompletion(
                    client,
                    torrent.id
                );
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
            } catch (err) {
                return {
                    status: "needsModal",
                    classification,
                    blockingOutcome: {
                        kind: "error",
                        message: "verify_failed",
                    },
                };
            }
        } else {
            classification = {
                ...classification,
                kind: "dataGap",
                confidence: "certain",
            };
        }
    }

    try {
        await client.resume([torrent.id]);
    } catch (err) {
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
    torrent: TorrentEntity | TorrentDetailEntity
): boolean {
    const isActive =
        torrent.state === STATUS.torrent.DOWNLOADING ||
        torrent.state === STATUS.torrent.SEEDING;
    const left =
        typeof torrent.leftUntilDone === "number"
            ? torrent.leftUntilDone
            : null;
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

export async function runPartialFilesRecovery(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.verify) {
        return { kind: "error", message: "verify_not_supported" };
    }
    try {
        await client.verify([detail.id]);
        return { kind: "verify-started", message: "verify_started" };
    } catch (err) {
        return {
            kind: "error",
            message: "verify_failed",
        };
    }
}

export async function runReannounce(
    deps: RecoveryControllerDeps
): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.forceTrackerReannounce)
        return { kind: "error", message: "reannounce_not_supported" };
    try {
        await client.forceTrackerReannounce(detail.id);
        return { kind: "reannounce-started", message: "reannounce_started" };
    } catch (err) {
        return {
            kind: "error",
            message: "reannounce_failed",
        };
    }
}
