import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { TorrentIntentExtended, QueueMoveIntent } from "@/app/intents/torrentIntents";
import { watchVerifyCompletion } from "@/services/recovery/recovery-verifier";

export type TorrentDispatchOutcome =
    | { status: "applied" }
    | {
          status: "unsupported";
          reason: "client_unavailable" | "intent_unsupported" | "method_missing";
      }
    | { status: "failed"; reason: "execution_failed" };

export interface CreateTorrentDispatchOptions {
    client: EngineAdapter | null | undefined;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    reportCommandError?: (error: unknown) => void;
}

type DispatchableIntentType =
    | "ENSURE_TORRENT_ACTIVE"
    | "ENSURE_TORRENT_ACTIVE_NOW"
    | "ENSURE_TORRENT_PAUSED"
    | "ENSURE_TORRENT_REMOVED"
    | "ENSURE_TORRENT_AT_LOCATION"
    | "ENSURE_TORRENT_VALID"
    | "TORRENT_ADD_TRACKER"
    | "TORRENT_REMOVE_TRACKER"
    | "TORRENT_REPLACE_TRACKERS"
    | "SET_TORRENT_FILES_WANTED"
    | "SET_TORRENT_SEQUENTIAL"
    | "SET_TORRENT_SUPERSEEDING"
    | "ENSURE_SELECTION_ACTIVE"
    | "ENSURE_SELECTION_ACTIVE_NOW"
    | "ENSURE_SELECTION_PAUSED"
    | "ENSURE_SELECTION_REMOVED"
    | "ENSURE_SELECTION_VALID"
    | "QUEUE_MOVE"
    | "ADD_MAGNET_TORRENT"
    | "ADD_TORRENT_FROM_FILE"
    | "FINALIZE_EXISTING_TORRENT";

type DispatchableIntent = Extract<TorrentIntentExtended, { type: DispatchableIntentType }>;

type DispatchIntentByType<TType extends DispatchableIntentType> = Extract<DispatchableIntent, { type: TType }>;

interface RefreshPolicy {
    refreshTorrents?: boolean;
    refreshDetail?: boolean;
    refreshStats?: boolean;
    reportError?: boolean;
}

interface DispatchContext {
    client: EngineAdapter;
}

type DispatchHandlerOutcome = { status: "applied" } | { status: "unsupported"; reason: "method_missing" };

interface DispatchHandlerDefinition<TType extends DispatchableIntentType> {
    run: (intent: DispatchIntentByType<TType>, context: DispatchContext) => Promise<DispatchHandlerOutcome>;
    refresh?: RefreshPolicy;
}

type DispatchHandlerTable = {
    [TType in DispatchableIntentType]: DispatchHandlerDefinition<TType>;
};

const requireClientMethod = <TMethod extends keyof EngineAdapter>(client: EngineAdapter, method: TMethod) => {
    const methodRef = client[method];
    if (!methodRef) {
        return null;
    }
    return methodRef;
};

const runQueueMove = async (intent: QueueMoveIntent, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    const torrentId = String(intent.torrentId);
    const steps = Math.max(1, Number(intent.steps ?? 1));
    for (let step = 0; step < steps; step++) {
        if (intent.direction === "up") {
            await context.client.moveUp([torrentId]);
            continue;
        }
        if (intent.direction === "down") {
            await context.client.moveDown([torrentId]);
            continue;
        }
        if (intent.direction === "top") {
            await context.client.moveToTop([torrentId]);
            continue;
        }
        await context.client.moveToBottom([torrentId]);
    }
    return { status: "applied" };
};

const runAddTorrentFromFile = async (intent: DispatchIntentByType<"ADD_TORRENT_FROM_FILE">, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    const shouldStart = !intent.paused;
    const verifyBeforeStart = shouldStart && intent.skipHashCheck === false;
    const addPaused = verifyBeforeStart ? true : intent.paused;

    const result = await context.client.addTorrent({
        metainfo: intent.metainfoBase64,
        downloadDir: intent.downloadDir,
        paused: addPaused,
        filesUnwanted: intent.filesUnwanted,
        priorityHigh: intent.priorityHigh,
        priorityNormal: intent.priorityNormal,
        priorityLow: intent.priorityLow,
    });

    if (intent.sequentialDownload && context.client.setSequentialDownload) {
        await context.client.setSequentialDownload(result.id, true);
    }

    if (verifyBeforeStart) {
        await context.client.verify([result.id]);
        // Wait for the hash check to finish before resuming.
        // Without this, torrent-start fires while Transmission is
        // still verifying and can abort the recheck.
        await watchVerifyCompletion(context.client, String(result.id));
        await context.client.resume([result.id]);
    }
    return { status: "applied" };
};

const runFinalizeExistingTorrent = async (intent: DispatchIntentByType<"FINALIZE_EXISTING_TORRENT">, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    const setTorrentLocation = requireClientMethod(context.client, "setTorrentLocation");
    if (typeof setTorrentLocation !== "function") {
        return { status: "unsupported", reason: "method_missing" };
    }
    const setTorrentLocationBound = setTorrentLocation.bind(context.client);
    await setTorrentLocationBound(String(intent.torrentId), intent.downloadDir, true);

    if (intent.filesUnwanted.length && context.client.updateFileSelection) {
        await context.client.updateFileSelection(String(intent.torrentId), intent.filesUnwanted, false);
    }
    if (intent.resume) {
        await context.client.resume([String(intent.torrentId)]);
    }
    return { status: "applied" };
};

const DISPATCH_HANDLERS: DispatchHandlerTable = {
    ENSURE_TORRENT_ACTIVE: {
        run: async (intent, context) => {
            await context.client.resume([String(intent.torrentId)]);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_TORRENT_ACTIVE_NOW: {
        run: async (intent, context) => {
            const startNow = requireClientMethod(context.client, "startNow");
            if (typeof startNow !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await startNow.bind(context.client)([String(intent.torrentId)]);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_TORRENT_PAUSED: {
        run: async (intent, context) => {
            await context.client.pause([String(intent.torrentId)]);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_TORRENT_REMOVED: {
        run: async (intent, context) => {
            await context.client.remove([String(intent.torrentId)], Boolean(intent.deleteData));
            return { status: "applied" };
        },
    },
    ENSURE_TORRENT_AT_LOCATION: {
        run: async (intent, context) => {
            const setTorrentLocation = requireClientMethod(
                context.client,
                "setTorrentLocation",
            );
            if (typeof setTorrentLocation !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await setTorrentLocation.bind(context.client)(
                String(intent.torrentId),
                intent.path,
                intent.moveData ?? true,
            );
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_TORRENT_VALID: {
        run: async (intent, context) => {
            await context.client.verify([String(intent.torrentId)]);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    TORRENT_ADD_TRACKER: {
        run: async (intent, context) => {
            const addTrackers = requireClientMethod(context.client, "addTrackers");
            if (typeof addTrackers !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await addTrackers
                .bind(context.client)(
                    (intent.torrentIds || []).map(String),
                    intent.trackers,
                );
            return { status: "applied" };
        },
        refresh: {
            refreshDetail: true,
        },
    },
    TORRENT_REMOVE_TRACKER: {
        run: async (intent, context) => {
            const removeTrackers = requireClientMethod(
                context.client,
                "removeTrackers",
            );
            if (typeof removeTrackers !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await removeTrackers
                .bind(context.client)(
                    (intent.torrentIds || []).map(String),
                    intent.trackerIds,
                );
            return { status: "applied" };
        },
        refresh: {
            refreshDetail: true,
        },
    },
    TORRENT_REPLACE_TRACKERS: {
        run: async (intent, context) => {
            const replaceTrackers = requireClientMethod(
                context.client,
                "replaceTrackers",
            );
            if (typeof replaceTrackers !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await replaceTrackers
                .bind(context.client)(
                    (intent.torrentIds || []).map(String),
                    intent.trackers,
                );
            return { status: "applied" };
        },
        refresh: {
            refreshDetail: true,
        },
    },
    SET_TORRENT_FILES_WANTED: {
        run: async (intent, context) => {
            const updateFileSelection = requireClientMethod(context.client, "updateFileSelection");
            if (typeof updateFileSelection !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await updateFileSelection.bind(context.client)(String(intent.torrentId), intent.fileIndexes, intent.wanted);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    SET_TORRENT_SEQUENTIAL: {
        run: async (intent, context) => {
            const setSequentialDownload = requireClientMethod(context.client, "setSequentialDownload");
            if (typeof setSequentialDownload !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await setSequentialDownload.bind(context.client)(String(intent.torrentId), intent.enabled);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    SET_TORRENT_SUPERSEEDING: {
        run: async (intent, context) => {
            const setSuperSeeding = requireClientMethod(context.client, "setSuperSeeding");
            if (typeof setSuperSeeding !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await setSuperSeeding.bind(context.client)(String(intent.torrentId), intent.enabled);
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_SELECTION_ACTIVE: {
        run: async (intent, context) => {
            await context.client.resume((intent.torrentIds || []).map(String));
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_SELECTION_ACTIVE_NOW: {
        run: async (intent, context) => {
            const startNow = requireClientMethod(context.client, "startNow");
            if (typeof startNow !== "function") {
                return { status: "unsupported", reason: "method_missing" };
            }
            await startNow
                .bind(context.client)((intent.torrentIds || []).map(String));
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_SELECTION_PAUSED: {
        run: async (intent, context) => {
            await context.client.pause((intent.torrentIds || []).map(String));
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    ENSURE_SELECTION_REMOVED: {
        run: async (intent, context) => {
            await context.client.remove((intent.torrentIds || []).map(String), Boolean(intent.deleteData));
            return { status: "applied" };
        },
    },
    ENSURE_SELECTION_VALID: {
        run: async (intent, context) => {
            await context.client.verify((intent.torrentIds || []).map(String));
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    QUEUE_MOVE: {
        run: async (intent, context) => {
            return runQueueMove(intent, context);
        },
    },
    ADD_MAGNET_TORRENT: {
        run: async (intent, context) => {
            await context.client.addTorrent({
                magnetLink: intent.magnetLink,
                paused: intent.paused,
                downloadDir: intent.downloadDir,
            });
            return { status: "applied" };
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: false,
            refreshStats: false,
        },
    },
    ADD_TORRENT_FROM_FILE: {
        run: runAddTorrentFromFile,
        refresh: {
            refreshTorrents: true,
            refreshDetail: false,
            refreshStats: false,
        },
    },
    FINALIZE_EXISTING_TORRENT: {
        run: runFinalizeExistingTorrent,
        refresh: {
            refreshTorrents: false,
            refreshDetail: false,
            refreshStats: false,
        },
    },
};

const isDispatchableIntent = (intent: TorrentIntentExtended): intent is DispatchableIntent => Object.prototype.hasOwnProperty.call(DISPATCH_HANDLERS, intent.type);

export function createTorrentDispatch({ client, refreshTorrents, refreshSessionStatsData, refreshDetailData, reportCommandError }: CreateTorrentDispatchOptions) {
    const runWithRefresh = async (operation: () => Promise<DispatchHandlerOutcome>, options?: RefreshPolicy): Promise<TorrentDispatchOutcome> => {
        const refreshPolicy = {
            refreshTorrents: false,
            refreshDetail: false,
            refreshStats: false,
            reportError: true,
            ...options,
        };
        try {
            const outcome = await operation();
            if (outcome.status !== "applied") {
                return outcome;
            }
            if (refreshPolicy.refreshTorrents) {
                await refreshTorrents();
            }
            if (refreshPolicy.refreshDetail) {
                await refreshDetailData();
            }
            if (refreshPolicy.refreshStats) {
                await refreshSessionStatsData();
            }
            return outcome;
        } catch (error) {
            if (refreshPolicy.reportError && reportCommandError) {
                if (!isRpcCommandError(error)) {
                    reportCommandError(error);
                }
            }
            return { status: "failed", reason: "execution_failed" };
        }
    };

    const executeIntent = async <TType extends DispatchableIntentType>(intent: DispatchIntentByType<TType>, context: DispatchContext) => {
        const handler = DISPATCH_HANDLERS[intent.type];
        return runWithRefresh(() => handler.run(intent, context), handler.refresh);
    };

    return async (intent: TorrentIntentExtended) => {
        if (!client) {
            return {
                status: "unsupported",
                reason: "client_unavailable",
            } as const;
        }
        if (!isDispatchableIntent(intent)) {
            return {
                status: "unsupported",
                reason: "intent_unsupported",
            } as const;
        }
        return executeIntent(intent, { client });
    };
}
