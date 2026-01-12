// TODO: Extracted from src/app/App.tsx (Phase-3A structural extraction)
// This file contains the code cut from App.tsx. It must be rewired to accept
// dependencies (torrentClientRef, refreshTorrentsRef, reportCommandError, etc.)
// and to export a hook `useTorrentOrchestrator` that App.tsx can call.
// TODO: Add proper imports and parameter typing; this is a mechanical paste.

import { useCallback, useRef, useState, useMemo } from "react";

// Recovery helper functions (copied verbatim from RecoveryGateContext)
const getRecoveryFingerprint = (torrent: any) =>
    torrent.errorEnvelope?.fingerprint ?? torrent.hash ?? torrent.id ??
    "<no-recovery-fingerprint>";

const derivePathReason = (errorClass?: string | null) => {
    switch (errorClass) {
        case "permissionDenied":
            return "unwritable";
        case "diskFull":
            return "disk-full";
        case "missingFiles":
            return "missing";
        default:
            return "missing";
    }
};

// NOTE: The following code is intentionally a near-verbatic copy from
// App.tsx. It will compile only after wiring imports and parameters.

export function useTorrentOrchestrator(/* TODO: pass dependencies here */) {
    // State & refs (copied)
    const recoveryFingerprintRef = useRef<string | null>(null);
    const recoveryPromiseRef = useRef<Promise<any> | null>(null);

    const recoveryResolverRef = useRef<
        ((result: any) => void) | null
    >(null);
    const [recoverySession, setRecoverySession] = useState<
        | {
              torrent: any;
              action: any;
              outcome?: any | null;
          }
        | null
    >(null);

    // --- runMissingFilesFlow (copied)
    const runMissingFilesFlow = useCallback(
        async (
            torrent: any,
            options?: { recreateFolder?: boolean }
        ) => {
            const client = /* TODO: wire torrentClientRef.current */ null;
            const envelope = torrent.errorEnvelope;
            if (!client || !envelope) return null;
            const classification = /* TODO: classifyMissingFilesState */ null;
            try {
                return await /* TODO: runMissingFilesRecoverySequence */ null;
            } catch (err) {
                console.error("missing files recovery flow failed", err);
                throw err;
            }
        },
        []
    );

    // --- requestRecovery (copied)
    const requestRecovery = useCallback(async ({ torrent, action, options }: any) => {
        const envelope = torrent.errorEnvelope;
        if (!envelope) return null;
        if (action === "setLocation") return null;

        let blockingOutcome: any | null = null;
        try {
            const flowResult = await runMissingFilesFlow(torrent, options);
            if (flowResult?.status === "resolved") {
                console.info(
                    `[tiny-torrent][recovery] ${action} executed recovery for torrent=${torrent.id}`
                );
                return { status: "handled" };
            }
            if (flowResult?.status === "needsModal") {
                blockingOutcome = flowResult.blockingOutcome ?? null;
            }
        } catch (err) {
            console.error("recovery flow failed", err);
            blockingOutcome = {
                kind: "path-needed",
                reason: /* TODO: derivePathReason(envelope.errorClass) */ "missing",
            };
        }

        if (!blockingOutcome) {
            return null;
        }

        if (action === "recheck") {
            return { status: "continue" };
        }

        const fingerprint = /* TODO: getRecoveryFingerprint(torrent) */ "";
        const activeFingerprint = recoveryFingerprintRef.current;
        if (activeFingerprint) {
            if (activeFingerprint === fingerprint) {
                return recoveryPromiseRef.current ?? null;
            }
            return { status: "cancelled" };
        }
        if (recoveryResolverRef.current) {
            return { status: "cancelled" };
        }
        const promise = new Promise<any>((resolve) => {
            recoveryResolverRef.current = resolve;
            setRecoverySession({
                torrent,
                action,
                outcome: blockingOutcome,
            });
        });
        recoveryFingerprintRef.current = fingerprint;
        recoveryPromiseRef.current = promise;
        return promise;
    }, [runMissingFilesFlow]);

    // --- finalizeRecovery (copied)
    const finalizeRecovery = useCallback((result: any) => {
        const resolver = recoveryResolverRef.current;
        recoveryResolverRef.current = null;
        recoveryFingerprintRef.current = null;
        recoveryPromiseRef.current = null;
        setRecoverySession(null);
        resolver?.(result);
    }, []);

    // --- capability refresh + server class detection (moved)
    const performCapabilityRefresh = useCallback(async (/* client: EngineAdapter */) => {
        // TODO: wiring - call client.getExtendedCapabilities and update server class
        // Original logic lived in App.tsx and has been moved here for Phase-3A.
    }, []);

    // --- UI ready / detach lifecycle (moved)
    const notifyUiReady = useCallback(async (/* client: EngineAdapter */) => {
        // TODO: wiring - call client.notifyUiReady when session is ready
    }, []);

    const registerUiDetach = useCallback((/* clientRef: { current: EngineAdapter | null } */) => {
        // TODO: wiring - register beforeunload to call clientRef.current.notifyUiDetached
        // Return an unregister function when wired.
        return () => {};
    }, []);

    // --- interpretRecoveryOutcome (copied)
    const interpretRecoveryOutcome = useCallback((action: any, outcome: any): any => {
        if (!outcome) return null;
        switch (outcome.kind) {
            case "resolved":
            case "noop":
                return { status: "continue" };
            case "verify-started":
                return action === "recheck" ? { status: "handled" } : { status: "continue" };
            case "reannounce-started":
                return { status: "continue" };
            case "path-needed":
                return null;
            case "error":
                return { status: "cancelled" };
            default:
                return { status: "continue" };
        }
    }, []);

    const handleRecoveryOutcome = useCallback((outcome: any) => {
        if (!recoverySession) return;
        const result = interpretRecoveryOutcome(recoverySession.action, outcome);
        if (result) {
            finalizeRecovery(result);
        }
    }, [finalizeRecovery, interpretRecoveryOutcome, recoverySession]);

    const runRecoveryOperation = useCallback(async (operation?: () => Promise<any>) => {
        if (!operation) return;
        const outcome = await operation();
        handleRecoveryOutcome(outcome);
    }, [handleRecoveryOutcome]);

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    const isDetailRecoveryBlocked = useMemo(() => {
        // TODO: requires detailData to be provided
        return false;
    }, []);

    const choosePathViaNativeShell = useCallback(async (initialPath?: string | null) => {
        // TODO: use NativeShell.isAvailable and openFolderDialog
        return null as string | null;
    }, []);

    const recoveryRequestBrowse = useCallback(async (currentPath?: string | null) => {
        const nativePath = await choosePathViaNativeShell(currentPath);
        return nativePath ?? null;
    }, [choosePathViaNativeShell]);

    const handleRecoveryPickPath = useCallback(async (path: string) => {
        if (!/* recoveryCallbacks?.handlePickPath */) return;
        await runRecoveryOperation(() => /* recoveryCallbacks.handlePickPath(path) */ Promise.resolve(null));
    }, [runRecoveryOperation]);

    // executeRetryFetch (copied placeholder)
    const executeRetryFetch = useCallback(async (target: any) => {
        // TODO: call requestRecovery with retryOnly and then refresh UI
    }, [requestRecovery]);

    const handleRecoveryRetry = useCallback(async () => {
        if (!recoverySession?.torrent) return;
        await executeRetryFetch(recoverySession.torrent);
        handleRecoveryClose();
    }, [executeRetryFetch, recoverySession, handleRecoveryClose]);

    // executeRedownload + dedupe guard
    const redownloadInFlight = useRef<Set<string>>(new Set());
    const executeRedownload = useCallback(async (target: any, options?: { recreateFolder?: boolean }) => {
        const key = target.errorEnvelope?.fingerprint ?? String(target.id ?? target.hash);
        if (redownloadInFlight.current.has(key)) {
            return;
        }
        redownloadInFlight.current.add(key);
        try {
            const gateResult = await requestRecovery({ torrent: target, action: "redownload", options });
            if (gateResult && gateResult.status !== "continue") {
                if (gateResult.status === "handled") {
                    // TODO: showFeedback and refreshAfterRecovery
                }
                return;
            }
        } catch (err) {
            // TODO: reportCommandError
        } finally {
            redownloadInFlight.current.delete(key);
        }
    }, [requestRecovery]);

    const refreshAfterRecovery = useCallback(async (target: any) => {
        // TODO: call refreshTorrentsRef.current, refreshSessionStatsDataRef.current, refreshDetailData
    }, []);

    // Event handlers (placeholders)
    const findTorrentById = useCallback((idOrHash?: string | null) => {
        // TODO: implement lookup using torrents and detailData
        return null as any;
    }, []);

    // Provide a public API surface for App.tsx to call
    return {
        requestRecovery,
        executeRetryFetch,
        executeRedownload,
        handleRecoveryRetry,
        handleRecoveryClose,
        handleRecoveryPickPath,
        recoverySession,
        isDetailRecoveryBlocked,
        // TODO: expose more methods as needed
    };
}

// ---------------------------------------------------------------------------
// Additional control blocks copied verbatim from App.tsx (mechanical paste)
// TODO: These must be wired to dependencies; left unmodified as requested.
// ---------------------------------------------------------------------------

// Re-download idempotency guard per-fingerprint
const redownloadInFlight = globalThis?.__tt_redownload_inflight ?? new Set<string>();
(globalThis as any).__tt_redownload_inflight = redownloadInFlight;

const executeRedownload = async (
    target: any,
    options?: { recreateFolder?: boolean }
) => {
    const key =
        target.errorEnvelope?.fingerprint ?? String(target.id ?? target.hash);
    if (redownloadInFlight.has(key)) {
        return;
    }
    redownloadInFlight.add(key);
    try {
        const gateResult = await requestRecovery({
            torrent: target,
            action: "redownload",
            options,
        });
        if (gateResult && gateResult.status !== "continue") {
            if (gateResult.status === "handled") {
                // showFeedback and refreshAfterRecovery should be called by wiring
            }
            return;
        }
    } catch (err) {
        // reportCommandError should be called by wiring
    } finally {
        redownloadInFlight.delete(key);
    }
};

// Magnet resolution helper (heartbeat subscription + timeout)
// Persistence helpers for add-torrent lifecycle (LAST_DOWNLOAD_DIR_KEY + read/write)
const LAST_DOWNLOAD_DIR_KEY = "tiny-torrent.last-download-dir";

const readLastDownloadDir = () => {
    try {
        return window.localStorage.getItem(LAST_DOWNLOAD_DIR_KEY);
    } catch {
        return null;
    }
};

const writeLastDownloadDir = (path?: string | null) => {
    try {
        if (path) {
            window.localStorage.setItem(LAST_DOWNLOAD_DIR_KEY, path);
        } else {
            window.localStorage.removeItem(LAST_DOWNLOAD_DIR_KEY);
        }
    } catch {
        // swallow
    }
};

// settingsConfigRef snapshot logic (module-scope snapshot object)
const settingsConfigRef: { current: any } = { current: null };

const resolveMagnetToMetadata = async (
    magnetLink: string
): Promise<{ torrentId: string; metadata: any } | null> => {
    const normalized = normalizeMagnetLink(magnetLink as any);
    if (!normalized) {
        return null;
    }

    // setIsResolvingMagnet and state handling must be wired by caller
    let addedId: string | null = null;
    try {
        const targetDownloadDir = /* wiring needed */ undefined as any;
        const added = await (/* torrentClient */ null as any).addTorrent({
            magnetLink: normalized,
            paused: true,
            downloadDir: targetDownloadDir,
        });
        addedId = added.id;

        // Wait for metadata via Heartbeat (timeout 30s)
        const metadata = await new Promise<any | null>((resolve) => {
            let timeoutId: number;
            const sub = (/* torrentClient */ null as any).subscribeToHeartbeat({
                mode: "detail",
                detailId: added.id,
                onUpdate: ({ detail }: any) => {
                    if (detail && (detail.files?.length ?? 0) > 0) {
                        clearTimeout(timeoutId);
                        sub.unsubscribe();
                        resolve({
                            name: detail.name,
                            files: detail.files!.map((f: any) => ({
                                path: f.name,
                                length: f.length ?? 0,
                            })),
                        });
                    }
                },
                onError: () => {
                    // Keep waiting on transient errors, or fail?
                    // Let's keep waiting until timeout.
                },
            });

            timeoutId = window.setTimeout(() => {
                sub.unsubscribe();
                resolve(null);
            }, 30_000);
        });

        if (metadata) {
            return { torrentId: added.id, metadata };
        }

        if (addedId) {
            try {
                await (/* torrentClient */ null as any).remove([addedId], false);
            } catch {
                // ignore cleanup failures
            }
        }
        return null;
    } finally {
        // setIsResolvingMagnet false should be wired by caller
    }
};

// Global window event handlers copied from App.tsx; wiring required.
function registerGlobalTinyTorrentHandlers() {
    type EventDetailLike = {
        id?: string | number | null;
        hash?: string | number | null;
    };
    const extractIdOrHash = (ev: Event): string | null | undefined => {
        if (!(ev instanceof CustomEvent)) return undefined;
        const detail = (ev as CustomEvent<EventDetailLike>).detail;
        if (!detail) return undefined;
        const raw = detail.id ?? detail.hash;
        if (typeof raw === "string") return raw;
        if (typeof raw === "number") return String(raw);
        return null;
    };

    const handleRemoveEvent = async (ev: Event) => {
        try {
            const idOrHash = extractIdOrHash(ev);
            const target = /* findTorrentById wiring needed */ null as any;
            if (!target) return;
            const client = /* torrentClientRef.current */ null as any;
            if (!client) return;
            try {
                await client.remove([target.id], false);
                // await refreshTorrentsRef.current?.();
                // If the removed torrent is currently inspected, close the detail view
                // handleCloseDetail wiring needed
            } catch (err) {
                // reportCommandError wiring
            }
        } catch (err) {
            // reportCommandError wiring
        }
    };

    const handleRedownloadEvent = async (ev: Event) => {
        try {
            const idOrHash = extractIdOrHash(ev);
            const target = /* findTorrentById wiring needed */ null as any;
            if (!target) return;
            await executeRedownload(target);
        } catch (err) {
            console.error("tiny-torrent:redownload event handler failed", err);
        }
    };

    window.addEventListener("tiny-torrent:remove", handleRemoveEvent as EventListener);
    window.addEventListener("tiny-torrent:redownload", handleRedownloadEvent as EventListener);

    return () => {
        window.removeEventListener("tiny-torrent:remove", handleRemoveEvent as EventListener);
        window.removeEventListener("tiny-torrent:redownload", handleRedownloadEvent as EventListener);
    };
}

import { useCallback, useMemo, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    TorrentIntentExtended,
    QueueMoveIntent,
} from "@/app/intents/torrentIntents";
import { runReannounce } from "@/services/recovery/recovery-controller";
import { NativeShell } from "@/app/runtime";

function assertNever(x: never): never {
    throw new Error("Unreachable intent encountered: " + JSON.stringify(x));
}

export function useTorrentOrchestrator({
    client,
}: {
    client: EngineAdapter | null | undefined;
}) {
    const [recoveryState] = useState<null>(null);

    const dispatch = useCallback(
        async (intent: TorrentIntentExtended) => {
            switch (intent.type) {
                case "ENSURE_TORRENT_ACTIVE":
                    if (!client) return;
                    await client.resume([String(intent.torrentId)]);
                    return;
                case "ENSURE_TORRENT_PAUSED":
                    if (!client) return;
                    await client.pause([String(intent.torrentId)]);
                    return;
                case "ENSURE_TORRENT_REMOVED":
                    if (!client) return;
                    await client.remove(
                        [String(intent.torrentId)],
                        Boolean(intent.deleteData)
                    );
                    return;
                case "ENSURE_TORRENT_VALID":
                    if (!client) return;
                    await client.verify([String(intent.torrentId)]);
                    return;
                case "ENSURE_TORRENT_ANNOUNCED":
                    if (!client) return;
                    try {
                        const detail = await client.getTorrentDetails(
                            String(intent.torrentId)
                        );
                        await runReannounce({ client, detail });
                    } catch {
                        // swallow errors — best-effort
                    }
                    return;
                case "ENSURE_TORRENT_AT_LOCATION":
                    if (!client || !client.setTorrentLocation) return;
                    await client.setTorrentLocation(
                        String(intent.torrentId),
                        intent.path,
                        Boolean(intent.recreate)
                    );
                    try {
                        await client.resume([String(intent.torrentId)]);
                    } catch {}
                    return;
                case "ENSURE_TORRENT_DATA_PRESENT":
                    if (!client) return;
                    // Best-effort: trigger verify — detailed recovery sequences
                    // are handled in the recovery controller when available.
                    await client.verify([String(intent.torrentId)]);
                    return;
                case "OPEN_TORRENT_FOLDER":
                    if (!client) return;
                    try {
                        const detail = await client.getTorrentDetails(
                            String(intent.torrentId)
                        );
                        if (detail && detail.savePath) {
                            if (client.openPath) {
                                await client.openPath(detail.savePath);
                            } else if (NativeShell.isAvailable) {
                                await NativeShell.openFolderDialog(
                                    detail.savePath
                                );
                            }
                        }
                    } catch {
                        // noop
                    }
                    return;
                case "ENSURE_SELECTION_ACTIVE":
                    if (!client) return;
                    for (const id of intent.torrentIds) {
                        // serial to preserve ordering semantics
                        // eslint-disable-next-line no-await-in-loop
                        await client.resume([String(id)]);
                    }
                    return;
                case "ENSURE_SELECTION_PAUSED":
                    if (!client) return;
                    await client.pause((intent.torrentIds || []).map(String));
                    return;
                case "ENSURE_SELECTION_VALID":
                    if (!client) return;
                    await client.verify((intent.torrentIds || []).map(String));
                    return;
                case "ENSURE_SELECTION_REMOVED":
                    if (!client) return;
                    await client.remove(
                        (intent.torrentIds || []).map(String),
                        Boolean(intent.deleteData)
                    );
                    return;
                case "QUEUE_MOVE": {
                    if (!client) return;
                    const q = intent as QueueMoveIntent;
                    const tid = String(q.torrentId);
                    const steps = Math.max(1, Number(q.steps ?? 1));
                    for (let i = 0; i < steps; i++) {
                        // eslint-disable-next-line no-await-in-loop
                        switch (q.direction) {
                            case "up":
                                await client.moveUp([tid]);
                                break;
                            case "down":
                                await client.moveDown([tid]);
                                break;
                            case "top":
                                await client.moveToTop([tid]);
                                break;
                            case "bottom":
                                await client.moveToBottom([tid]);
                                break;
                            default:
                                break;
                        }
                    }
                    return;
                }
            }
            // Ensure compile-time exhaustiveness
            return assertNever(intent as never);
        },
        [client]
    );

    return useMemo(
        () => ({ dispatch, recoveryState }),
        [dispatch, recoveryState]
    );
}

export default useTorrentOrchestrator;
