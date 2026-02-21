import type {
    EngineAdapter,
    EngineRuntimeCapabilities,
} from "@/services/rpc/engine-adapter";
import { scheduler } from "@/app/services/scheduler";
import type {
    MissingFilesClassificationKind,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";
import { interpretFsError, type FsErrorKind } from "@/shared/utils/fsErrors";
import {
    RECOVERY_PROBE_POLL_INTERVAL_MS,
    RECOVERY_PROBE_TIMEOUT_MS,
} from "@/config/logic";
import type {
    MissingFilesProbeResult,
    RecoveryOutcome,
    RecoverySequenceOptions,
} from "@/services/recovery/recovery-contracts";
import { classifyMissingFilesState } from "@/services/recovery/recovery-classifier";

export const FREE_SPACE_UNSUPPORTED_MESSAGE = "free_space_check_not_supported";

interface EnsurePathParams {
    client: EngineAdapter;
    path: string;
    options?: RecoverySequenceOptions;
}

export async function ensurePathReady({
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

export type PathProbeResult =
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
    const deadline = Date.now() + RECOVERY_PROBE_TIMEOUT_MS;
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
        await delay(RECOVERY_PROBE_POLL_INTERVAL_MS);
    }
    return { success: false, errorKind: lastKind ?? "other" };
}

export async function probeMissingFiles(
    torrent: TorrentEntity | TorrentDetailEntity,
    client: EngineAdapter,
    engineCapabilities: EngineRuntimeCapabilities,
): Promise<MissingFilesProbeResult> {
    const ts = Date.now();
    const expectedBytes = getExpectedBytes(torrent);
    const path =
        (torrent as TorrentDetailEntity).downloadDir ??
        torrent.savePath ??
        torrent.downloadDir ??
        "";

    if (engineCapabilities.executionModel === "local") {
        let onDiskBytes: number | null = null;
        if (client.getTorrentDetails) {
            try {
                const detail = await client.getTorrentDetails(torrent.id, {
                    profile: "standard",
                    includeTrackerStats: false,
                });
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
        if (onDiskBytes === null && typeof torrent.downloaded === "number") {
            onDiskBytes = Math.max(0, torrent.downloaded);
        }
        const missingBytes =
            onDiskBytes !== null
                ? Math.max(0, expectedBytes - onDiskBytes)
                : null;
        const toDownloadBytes = missingBytes;

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

    const classification = classifyMissingFilesState(
        torrent.errorEnvelope ?? null,
        path,
        {
            torrentId: torrent.id ?? torrent.hash,
            engineCapabilities,
        },
    );
    const kindMap: Record<
        MissingFilesClassificationKind,
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

export function deriveReasonFromFsError(kind: FsErrorKind | null) {
    if (kind === "eacces") {
        return "unwritable";
    }
    if (kind === "enospc") {
        return "disk-full";
    }
    return "missing";
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

function delay(ms: number) {
    return new Promise<void>((resolve) => {
        scheduler.scheduleTimeout(resolve, ms);
    });
}
