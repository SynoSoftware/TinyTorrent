import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { isRpcCommandError } from "@/services/rpc/errors";
import type {
    TorrentIntentExtended,
    QueueMoveIntent,
} from "@/app/intents/torrentIntents";

export interface CreateTorrentDispatchOptions {
    client: EngineAdapter | null | undefined;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    reportCommandError?: (error: unknown) => void;
}
// TODO: This dispatch builder has a “do-everything” surface (client selection + refresh policy + intent mapping) and is another source of AI regressions.
// TODO: Target architecture:
// TODO: - Define a single “command bus” boundary (e.g., `TorrentCommandBus`) with a small, stable API.
// TODO: - Move refresh policy into one owner (Session provider / ViewModel), not per-intent switch cases.
// TODO: - Ensure intent mapping exists in exactly one place (avoid duplicates across hooks/orchestrators).

export function createTorrentDispatch({
    client,
    refreshTorrents,
    refreshSessionStatsData,
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
                await refreshTorrents();
            }
            if (options?.refreshDetail ?? true) {
                await refreshDetailData();
            }
            if (options?.refreshStats ?? true) {
                await refreshSessionStatsData();
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
        if (!client) return;
        const activeClient = client;

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
            await runWithRefresh(async () => {
                await activeClient.verify([String(intent.torrentId)]);
            });
            break;
        case "SET_TORRENT_FILES_WANTED": {
            if (!activeClient.updateFileSelection) return;
            await runWithRefresh(async () => {
                await activeClient.updateFileSelection(
                    String(intent.torrentId),
                    intent.fileIndexes,
                    intent.wanted
                );
            });
            break;
        }
        case "SET_TORRENT_SEQUENTIAL": {
            if (!activeClient.setSequentialDownload) return;
            const setSequentialDownload =
                activeClient.setSequentialDownload.bind(activeClient);
                await runWithRefresh(
                    async () => {
                        await setSequentialDownload(
                            String(intent.torrentId),
                            intent.enabled,
                        );
                    }
                );
            break;
        }
        case "SET_TORRENT_SUPERSEEDING": {
            if (!activeClient.setSuperSeeding) return;
            const setSuperSeeding =
                activeClient.setSuperSeeding.bind(activeClient);
                await runWithRefresh(
                    async () => {
                        await setSuperSeeding(
                            String(intent.torrentId),
                            intent.enabled,
                        );
                    }
                );
            break;
        }
        case "ENSURE_SELECTION_ACTIVE":
            await activeClient.resume((intent.torrentIds || []).map(String));
            break;
        case "ENSURE_SELECTION_PAUSED":
            await activeClient.pause((intent.torrentIds || []).map(String));
            break;
        case "ENSURE_SELECTION_REMOVED":
            await activeClient.remove(
                (intent.torrentIds || []).map(String),
                Boolean(intent.deleteData)
            );
            break;
        case "ENSURE_SELECTION_VALID":
            await runWithRefresh(async () => {
                await activeClient.verify(
                    (intent.torrentIds || []).map(String)
                );
            });
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
                    const shouldStart = !intent.paused;
                    const verifyBeforeStart =
                        shouldStart && intent.skipHashCheck === false;
                    const addPaused = verifyBeforeStart ? true : intent.paused;

                    const result = await activeClient.addTorrent({
                        metainfo: intent.metainfoBase64,
                        downloadDir: intent.downloadDir,
                        paused: addPaused,
                        filesUnwanted: intent.filesUnwanted,
                        priorityHigh: intent.priorityHigh,
                        priorityNormal: intent.priorityNormal,
                        priorityLow: intent.priorityLow,
                    });

                    if (intent.sequentialDownload) {
                        if (activeClient.setSequentialDownload) {
                            await activeClient.setSequentialDownload(
                                result.id,
                                true
                            );
                        }
                    }

                    if (verifyBeforeStart) {
                        await activeClient.verify([result.id]);
                        await activeClient.resume([result.id]);
                    }
                },
                { refreshStats: false, refreshDetail: false }
            );
            break;
        case "FINALIZE_EXISTING_TORRENT": {
            if (!activeClient.setTorrentLocation) return;
            const setTorrentLocation =
                activeClient.setTorrentLocation.bind(activeClient);
            await runWithRefresh(
                async () => {
                    await setTorrentLocation(
                        String(intent.torrentId),
                        intent.downloadDir,
                        true
                    );
                    if (
                        intent.filesUnwanted.length &&
                        activeClient.updateFileSelection
                    ) {
                        await activeClient.updateFileSelection(
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
