import type { MutableRefObject } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { isRpcCommandError } from "@/services/rpc/errors";
import type {
    TorrentIntentExtended,
    QueueMoveIntent,
} from "@/app/intents/torrentIntents";

export interface CreateTorrentDispatchOptions {
    client: EngineAdapter | null | undefined;
    clientRef: MutableRefObject<EngineAdapter | null>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshDetailData: () => Promise<void>;
    reportCommandError?: (error: unknown) => void;
}
// TODO: This dispatch builder has a “do-everything” surface (client selection + refresh policy + intent mapping) and is another source of AI regressions.
// TODO: Target architecture:
// TODO: - Define a single “command bus” boundary (e.g., `TorrentCommandBus`) with a small, stable API.
// TODO: - Move refresh policy into one owner (Session provider / ViewModel), not per-intent switch cases.
// TODO: - Collapse `client/clientRef` duplication: one authority selects the active client.
// TODO: - Ensure intent mapping exists in exactly one place (avoid duplicates across hooks/orchestrators).

export function createTorrentDispatch({
    client,
    clientRef,
    refreshTorrentsRef,
    refreshSessionStatsDataRef,
    refreshDetailData,
    reportCommandError,
}: CreateTorrentDispatchOptions) {
    const runWithRefresh = async (
        operation: () => Promise<void>,
        options?: {
            refreshTorrents?: boolean;
            refreshDetail?: boolean;
            refreshStats?: boolean;
            reportError?: boolean;
        }
    ) => {
        try {
            await operation();
            if (options?.refreshTorrents ?? true) {
                await refreshTorrentsRef.current();
            }
            if (options?.refreshDetail ?? true) {
                await refreshDetailData();
            }
            if (options?.refreshStats ?? true) {
                await refreshSessionStatsDataRef.current();
            }
        } catch (error) {
            if ((options?.reportError ?? true) && reportCommandError) {
                if (!isRpcCommandError(error)) {
                    reportCommandError(error);
                }
            }
            throw error;
        }
    };

    return async (intent: TorrentIntentExtended) => {
        const activeClient = clientRef.current || client;
        if (!activeClient) return;

        // TODO: Replace this large `switch` with a table-driven mapping:
        // TODO: - `intent.type` => `{ run(client), refresh: {torrents,detail,stats}, optimistic?: ... }`
        // TODO: - makes behavior explicit, reduces chance of missing a refresh, and improves testability.
        switch (intent.type) {
            case "ENSURE_TORRENT_ACTIVE":
                await activeClient.resume([String(intent.torrentId)]);
                break;
            case "ENSURE_TORRENT_PAUSED":
                await activeClient.pause([String(intent.torrentId)]);
                break;
            case "ENSURE_TORRENT_REMOVED":
                await activeClient.remove(
                    [String(intent.torrentId)],
                    Boolean(intent.deleteData)
                );
                break;
            case "ENSURE_TORRENT_VALID":
                await activeClient.verify([String(intent.torrentId)]);
                break;
            case "SET_TORRENT_FILES_WANTED": {
                const updateFileSelection = activeClient.updateFileSelection;
                if (!updateFileSelection) return;
                await runWithRefresh(
                    async () => {
                        await updateFileSelection(
                            String(intent.torrentId),
                            intent.fileIndexes,
                            intent.wanted
                        );
                    }
                );
                break;
            }
            case "SET_TORRENT_SEQUENTIAL":
                if (!activeClient.setSequentialDownload) return;
                {
                    const setSequential = activeClient.setSequentialDownload;
                    await runWithRefresh(
                        async () => {
                            await setSequential(
                                String(intent.torrentId),
                                intent.enabled
                            );
                        }
                    );
                    break;
                }
            case "SET_TORRENT_SUPERSEEDING":
                if (!activeClient.setSuperSeeding) return;
                {
                    const setSuperSeeding = activeClient.setSuperSeeding;
                    await runWithRefresh(
                        async () => {
                            await setSuperSeeding(
                                String(intent.torrentId),
                                intent.enabled
                            );
                        }
                    );
                    break;
                }
            case "ENSURE_SELECTION_ACTIVE":
                await activeClient.resume(
                    (intent.torrentIds || []).map(String)
                );
                break;
            case "ENSURE_SELECTION_PAUSED":
                await activeClient.pause(
                    (intent.torrentIds || []).map(String)
                );
                break;
            case "ENSURE_SELECTION_REMOVED":
                await activeClient.remove(
                    (intent.torrentIds || []).map(String),
                    Boolean(intent.deleteData)
                );
                break;
            case "ENSURE_SELECTION_VALID":
                await activeClient.verify(
                    (intent.torrentIds || []).map(String)
                );
                break;
        case "QUEUE_MOVE": {
            const q = intent as QueueMoveIntent;
            const tid = String(q.torrentId);
            const steps = Math.max(1, Number(q.steps ?? 1));
            for (let i = 0; i < steps; i++) {
                if (q.direction === "up") await activeClient.moveUp([tid]);
                else if (q.direction === "down")
                    await activeClient.moveDown([tid]);
                else if (q.direction === "top")
                    await activeClient.moveToTop([tid]);
                else if (q.direction === "bottom")
                    await activeClient.moveToBottom([tid]);
            }
            break;
        }
        case "ADD_MAGNET_TORRENT":
            await runWithRefresh(
                async () => {
                    await activeClient.addTorrent({
                        magnetLink: intent.magnetLink,
                        paused: intent.paused,
                        downloadDir: intent.downloadDir,
                    });
                },
                { refreshStats: false, refreshDetail: false }
            );
            break;
        case "ADD_TORRENT_FROM_FILE":
            await runWithRefresh(
                async () => {
                    await activeClient.addTorrent({
                        metainfo: intent.metainfoBase64,
                        downloadDir: intent.downloadDir,
                        paused: intent.paused,
                        filesUnwanted: intent.filesUnwanted,
                        priorityHigh: intent.priorityHigh,
                        priorityNormal: intent.priorityNormal,
                        priorityLow: intent.priorityLow,
                    });
                },
                { refreshStats: false, refreshDetail: false }
            );
            break;
        case "FINALIZE_EXISTING_TORRENT": {
            const setTorrentLocation = activeClient.setTorrentLocation;
            if (!setTorrentLocation) return;
            const updateFileSelection = activeClient.updateFileSelection;
            await runWithRefresh(
                async () => {
                    await setTorrentLocation(
                        String(intent.torrentId),
                        intent.downloadDir,
                        true
                    );
                    if (intent.filesUnwanted.length && updateFileSelection) {
                        await updateFileSelection(
                            String(intent.torrentId),
                            intent.filesUnwanted,
                            false
                        );
                    }
                    if (intent.resume) {
                        await activeClient.resume([String(intent.torrentId)]);
                    }
                },
                { refreshTorrents: false, refreshStats: false, refreshDetail: false }
            );
            break;
        }
    }
    };
}
