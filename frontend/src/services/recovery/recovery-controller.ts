import type { TorrentDetailEntity } from "@/services/rpc/entities";
import { interpretFsError } from "@/shared/utils/fsErrors";
import { setClassificationOverride } from "@/services/recovery/missingFilesStore";
import { resolveRecoveryFingerprint } from "@/services/recovery/recoveryFingerprint";
import { isActionableRecoveryErrorClass } from "@/services/recovery/errorClassificationGuards";
import { classifyMissingFilesState, deriveRecommendedActions } from "@/services/recovery/recovery-classifier";
import {
    deriveReasonFromFsError,
    ensurePathReady,
    FREE_SPACE_UNSUPPORTED_MESSAGE,
    pollPathAvailability,
    probeMissingFiles,
} from "@/services/recovery/recovery-prober";
import {
    clearVerifyGuardEntry,
    recordVerifyAttempt,
    resetVerifyGuard,
    runMinimalRecoverySequence,
    shouldSkipVerify,
    watchVerifyCompletion,
} from "@/services/recovery/recovery-verifier";
import type {
    RecoveryControllerDeps,
    RecoveryOutcome,
    RecoverySequenceParams,
    RecoverySequenceResult,
} from "@/services/recovery/recovery-contracts";

export type {
    RecoveryControllerDeps,
    RecoveryOutcome,
    RecoveryRecommendedAction,
    MissingFilesClassification,
    MissingFilesProbeResult,
    RecoverySequenceOptions,
    RecoverySequenceParams,
    RecoverySequenceStatus,
    RecoverySequenceResult,
} from "@/services/recovery/recovery-contracts";

export {
    classifyMissingFilesState,
    clearVerifyGuardEntry,
    deriveRecommendedActions,
    isActionableRecoveryErrorClass,
    pollPathAvailability,
    probeMissingFiles,
    recordVerifyAttempt,
    resetVerifyGuard,
    shouldSkipVerify,
    watchVerifyCompletion,
};

const IN_FLIGHT_RECOVERY = new Map<string, Promise<RecoverySequenceResult>>();

export function resetRecoveryControllerState() {
    resetVerifyGuard();
    IN_FLIGHT_RECOVERY.clear();
}

function appendTrailingSlashForForce(path: string): string {
    if (!path) return path;
    if (path.endsWith("\\") || path.endsWith("/")) return path;

    const lastForwardSlash = path.lastIndexOf("/");
    const lastBackSlash = path.lastIndexOf("\\");

    // Preserve the dominant separator style already present in the path.
    if (lastForwardSlash >= 0 || lastBackSlash >= 0) {
        return `${path}${lastForwardSlash > lastBackSlash ? "/" : "\\"}`;
    }

    // No separator in the path string:
    // - Windows drive/UNC shapes should remain backslash-based.
    // - Everything else defaults to POSIX slash for remote daemons.
    if (/^[a-zA-Z]:/.test(path) || path.startsWith("\\\\")) {
        return `${path}\\`;
    }

    return `${path}/`;
}

export async function recoverMissingFiles(params: RecoverySequenceParams): Promise<RecoverySequenceResult> {
    const { client, torrent, envelope, options } = params;
    let classification = params.classification;
    if (!envelope || !isActionableRecoveryErrorClass(envelope.errorClass)) {
        return { status: "noop", classification };
    }
    const fingerprint = resolveRecoveryFingerprint({
        fingerprint: envelope.fingerprint ?? null,
        hash: torrent.hash ?? null,
        id: torrent.id ?? null,
    });
    if (IN_FLIGHT_RECOVERY.has(fingerprint)) {
        return IN_FLIGHT_RECOVERY.get(fingerprint)!;
    }

    const deferredHandlers: {
        resolve: (v: RecoverySequenceResult) => void;
        reject: (e: unknown) => void;
    } = {
        resolve: () => {},
        reject: () => {},
    };

    const deferredPromise = new Promise<RecoverySequenceResult>((resolve, reject) => {
        deferredHandlers.resolve = resolve;
        deferredHandlers.reject = reject;
    });

    IN_FLIGHT_RECOVERY.set(fingerprint, deferredPromise);

    (async () => {
        try {
            const downloadDir =
                (torrent as TorrentDetailEntity).downloadDir ?? torrent.savePath ?? torrent.downloadDir ?? "";
            // Always force-refresh: append a trailing slash so
            // Transmission re-evaluates the path even when the
            // stored location string hasn't changed.
            const requestLocation = appendTrailingSlashForForce(downloadDir);

            const missingBytes = typeof torrent.leftUntilDone === "number" ? torrent.leftUntilDone : null;
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
                const probe = await pollPathAvailability(client, downloadDir, options?.signal);
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
                classification = {
                    ...classification,
                    confidence: "likely",
                };
                if (torrent.id) {
                    setClassificationOverride(torrent.id, classification);
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
                    await client.setTorrentLocation(torrent.id, requestLocation, false);
                } catch (err) {
                    const reason = deriveReasonFromFsError(interpretFsError(err));
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

            const minimal = await runMinimalRecoverySequence(
                {
                    client,
                    torrent,
                    classification,
                    fingerprint,
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

export async function runPartialFilesRecovery(deps: RecoveryControllerDeps): Promise<RecoveryOutcome> {
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

export async function runReannounce(deps: RecoveryControllerDeps): Promise<RecoveryOutcome> {
    const { client, detail } = deps;
    if (!client.forceTrackerReannounce) return { kind: "error", message: "reannounce_not_supported" };
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
