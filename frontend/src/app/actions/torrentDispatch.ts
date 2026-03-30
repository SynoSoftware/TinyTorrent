import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { isRpcCommandError } from "@/services/rpc/errors";
import type { TorrentIntentExtended, QueueReorderIntent } from "@/app/intents/torrentIntents";
import { watchVerifyCompletion } from "@/services/rpc/verify-watcher";
import { toMoveDataFlag } from "@/modules/dashboard/domain/torrentRelocation";
import { infraLogger } from "@/shared/utils/infraLogger";

export type DispatchStatus = "applied" | "unsupported" | "failed";
export type DispatchReason =
    | "client_unavailable"
    | "intent_unsupported"
    | "method_missing"
    | "execution_failed";

export const dispatchReason = {
    clientUnavailable: "client_unavailable",
    intentUnsupported: "intent_unsupported",
    methodMissing: "method_missing",
    executionFailed: "execution_failed",
} as const satisfies Record<string, DispatchReason>;

export type TorrentDispatchOutcome =
    | { status: "applied" }
    | {
          status: "unsupported";
          reason: "client_unavailable" | "intent_unsupported" | "method_missing";
      }
    | {
          status: "failed";
          reason: "execution_failed";
      };

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
    | "TORRENT_SET_TRACKER_LIST"
    | "TORRENT_REANNOUNCE"
    | "SET_TORRENT_FILES_WANTED"
    | "SET_TORRENT_FILES_PRIORITY"
    | "SET_TORRENT_SEQUENTIAL"
    | "SET_TORRENT_SUPERSEEDING"
    | "ENSURE_SELECTION_ACTIVE"
    | "ENSURE_SELECTION_ACTIVE_NOW"
    | "ENSURE_SELECTION_PAUSED"
    | "ENSURE_SELECTION_REMOVED"
    | "ENSURE_SELECTION_VALID"
    | "QUEUE_REORDER"
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
    queueLocationFollowUp: (
        intent: DispatchIntentByType<"ENSURE_TORRENT_AT_LOCATION">,
    ) => void;
}

type DispatchHandlerOutcome =
    | { status: "applied" }
    | {
          status: "unsupported";
          reason: "method_missing";
      };

interface DispatchHandlerDefinition<TType extends DispatchableIntentType> {
    run: (intent: DispatchIntentByType<TType>, context: DispatchContext) => Promise<DispatchHandlerOutcome>;
    refresh?: RefreshPolicy;
}

type DispatchHandlerTable = {
    [TType in DispatchableIntentType]: DispatchHandlerDefinition<TType>;
};

const dispatchOutcome = {
    applied(): DispatchHandlerOutcome {
        return { status: "applied" };
    },
    methodMissing(): DispatchHandlerOutcome {
        return {
            status: "unsupported",
            reason: dispatchReason.methodMissing,
        };
    },
    executionFailed(): TorrentDispatchOutcome {
        return {
            status: "failed",
            reason: dispatchReason.executionFailed,
        };
    },
};

const requireClientMethod = <TMethod extends keyof EngineAdapter>(client: EngineAdapter, method: TMethod) => {
    const methodRef = client[method];
    if (!methodRef) {
        return null;
    }
    return methodRef;
};

type QueueReorderOperation =
    | { method: "moveToTop"; torrentId: string }
    | { method: "moveToBottom"; torrentId: string };

const planQueueReorder = (intent: QueueReorderIntent) => {
    const queueOrder = (intent.queueOrder || []).map(String).filter(Boolean);
    const torrentIds = (intent.torrentIds || []).map(String).filter(Boolean);
    if (torrentIds.length === 0) {
        return null;
    }

    const requestedMovingIds = new Set(torrentIds);
    const orderedTorrentIds = queueOrder.filter((torrentId) =>
        requestedMovingIds.has(torrentId),
    );
    if (orderedTorrentIds.length === 0) {
        return null;
    }

    const movingSet = new Set(orderedTorrentIds);
    const reducedOrderLength = queueOrder.length - orderedTorrentIds.length;
    const boundedInsertIndex = Math.max(
        0,
        Math.min(reducedOrderLength, Number(intent.targetInsertionIndex) || 0),
    );
    const reducedOrder = queueOrder.filter((torrentId) => !movingSet.has(torrentId));
    const nextOrder = [
        ...reducedOrder.slice(0, boundedInsertIndex),
        ...orderedTorrentIds,
        ...reducedOrder.slice(boundedInsertIndex),
    ];
    if (nextOrder.length === queueOrder.length && nextOrder.every((torrentId, index) => torrentId === queueOrder[index])) {
        return null;
    }

    const prefixIds = nextOrder.slice(0, boundedInsertIndex);
    const suffixIds = nextOrder.slice(
        boundedInsertIndex + orderedTorrentIds.length,
    );

    const operations: QueueReorderOperation[] = [
        ...prefixIds.slice().reverse().map((torrentId) => ({
            method: "moveToTop" as const,
            torrentId,
        })),
        ...suffixIds.map((torrentId) => ({
            method: "moveToBottom" as const,
            torrentId,
        })),
    ];

    return {
        operations,
        nextOrder,
    };
};

const runQueueReorder = async (intent: QueueReorderIntent, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    const plan = planQueueReorder(intent);
    if (!plan) {
        return dispatchOutcome.applied();
    }

    for (const operation of plan.operations) {
        if (operation.method === "moveToTop") {
            await context.client.moveToTop([operation.torrentId]);
            continue;
        }
        await context.client.moveToBottom([operation.torrentId]);
    }

    return dispatchOutcome.applied();
};

const runAddTorrentFromFile = async (intent: DispatchIntentByType<"ADD_TORRENT_FROM_FILE">, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    await context.client.addTorrent({
        metainfo: intent.metainfoBase64,
        downloadDir: intent.downloadDir,
        paused: intent.paused,
        sequentialDownload: intent.sequentialDownload,
        filesUnwanted: intent.filesUnwanted,
        priorityHigh: intent.priorityHigh,
        priorityNormal: intent.priorityNormal,
        priorityLow: intent.priorityLow,
    });
    return dispatchOutcome.applied();
};

const runAddMagnetTorrent = async (intent: DispatchIntentByType<"ADD_MAGNET_TORRENT">, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    await context.client.addTorrent({
        magnetLink: intent.magnetLink,
        paused: intent.paused,
        downloadDir: intent.downloadDir,
        sequentialDownload: intent.sequentialDownload,
    });

    return dispatchOutcome.applied();
};

const runFinalizeExistingTorrent = async (intent: DispatchIntentByType<"FINALIZE_EXISTING_TORRENT">, context: DispatchContext): Promise<DispatchHandlerOutcome> => {
    const setTorrentLocation = requireClientMethod(context.client, "setTorrentLocation");
    if (typeof setTorrentLocation !== "function") {
        return dispatchOutcome.methodMissing();
    }
    const setTorrentLocationBound = setTorrentLocation.bind(context.client);
    await setTorrentLocationBound(String(intent.torrentId), intent.downloadDir, true);

    if (intent.filesUnwanted.length && context.client.updateFileSelection) {
        await context.client.updateFileSelection(String(intent.torrentId), intent.filesUnwanted, false);
    }
    if (intent.resume) {
        await context.client.resume([String(intent.torrentId)]);
    }
    return dispatchOutcome.applied();
};

const dispatchHandlers: DispatchHandlerTable = {
    ENSURE_TORRENT_ACTIVE: {
        run: async (intent, context) => {
            await context.client.resume([String(intent.torrentId)]);
            return dispatchOutcome.applied();
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
                return dispatchOutcome.methodMissing();
            }
            await startNow.bind(context.client)([String(intent.torrentId)]);
            return dispatchOutcome.applied();
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
            return dispatchOutcome.applied();
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
            return dispatchOutcome.applied();
        },
    },
    ENSURE_TORRENT_AT_LOCATION: {
        run: async (intent, context) => {
            const setTorrentLocation = requireClientMethod(
                context.client,
                "setTorrentLocation",
            );
            if (typeof setTorrentLocation !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await setTorrentLocation.bind(context.client)(
                String(intent.torrentId),
                intent.path,
                toMoveDataFlag(intent.locationMode),
            );
            context.queueLocationFollowUp(intent);
            return dispatchOutcome.applied();
        },
        // Keep set-location command path responsive; UI convergence is owned by heartbeat.
        refresh: {},
    },
    ENSURE_TORRENT_VALID: {
        run: async (intent, context) => {
            await context.client.verify([String(intent.torrentId)]);
            return dispatchOutcome.applied();
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
                return dispatchOutcome.methodMissing();
            }
            await addTrackers
                .bind(context.client)(
                    (intent.torrentIds || []).map(String),
                    intent.trackers,
                );
            return dispatchOutcome.applied();
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
                return dispatchOutcome.methodMissing();
            }
            await removeTrackers
                .bind(context.client)(
                    (intent.torrentIds || []).map(String),
                    intent.trackerIds,
                );
            return dispatchOutcome.applied();
        },
        refresh: {
            refreshDetail: true,
        },
    },
    TORRENT_REANNOUNCE: {
        run: async (intent, context) => {
            const reannounce = requireClientMethod(
                context.client,
                "forceTrackerReannounce",
            );
            if (typeof reannounce !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await reannounce.bind(context.client)(String(intent.torrentId));
            return dispatchOutcome.applied();
        },
        refresh: {
            refreshDetail: true,
        },
    },
    TORRENT_SET_TRACKER_LIST: {
        run: async (intent, context) => {
            const setTrackerList = requireClientMethod(
                context.client,
                "setTrackerList",
            );
            if (typeof setTrackerList !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await setTrackerList
                .bind(context.client)(
                    String(intent.torrentId),
                    intent.trackerList,
                );
            return dispatchOutcome.applied();
        },
        refresh: {
            refreshDetail: true,
        },
    },
    SET_TORRENT_FILES_WANTED: {
        run: async (intent, context) => {
            const updateFileSelection = requireClientMethod(context.client, "updateFileSelection");
            if (typeof updateFileSelection !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await updateFileSelection.bind(context.client)(String(intent.torrentId), intent.fileIndexes, intent.wanted);
            return dispatchOutcome.applied();
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    SET_TORRENT_FILES_PRIORITY: {
        run: async (intent, context) => {
            const setFilePriority = requireClientMethod(context.client, "setFilePriority");
            if (typeof setFilePriority !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await setFilePriority.bind(context.client)(
                String(intent.torrentId),
                intent.fileIndexes,
                intent.priority,
            );
            return dispatchOutcome.applied();
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
                return dispatchOutcome.methodMissing();
            }
            await setSequentialDownload.bind(context.client)(String(intent.torrentId), intent.enabled);
            return dispatchOutcome.applied();
        },
        // Keep sequential-toggle command flow responsive. UI convergence is
        // owned by the optimistic overlay plus heartbeat snapshots, and this
        // command does not need to churn session stats or force sibling HUDs.
        refresh: {},
    },
    SET_TORRENT_SUPERSEEDING: {
        run: async (intent, context) => {
            const setSuperSeeding = requireClientMethod(context.client, "setSuperSeeding");
            if (typeof setSuperSeeding !== "function") {
                return dispatchOutcome.methodMissing();
            }
            await setSuperSeeding.bind(context.client)(String(intent.torrentId), intent.enabled);
            return dispatchOutcome.applied();
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
            return dispatchOutcome.applied();
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
                return dispatchOutcome.methodMissing();
            }
            await startNow
                .bind(context.client)((intent.torrentIds || []).map(String));
            return dispatchOutcome.applied();
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
            return dispatchOutcome.applied();
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
            return dispatchOutcome.applied();
        },
    },
    ENSURE_SELECTION_VALID: {
        run: async (intent, context) => {
            await context.client.verify((intent.torrentIds || []).map(String));
            return dispatchOutcome.applied();
        },
        refresh: {
            refreshTorrents: true,
            refreshDetail: true,
            refreshStats: true,
        },
    },
    QUEUE_REORDER: {
        run: async (intent, context) => {
            return runQueueReorder(intent, context);
        },
        refresh: {
            refreshTorrents: true,
        },
    },
    ADD_MAGNET_TORRENT: {
        run: runAddMagnetTorrent,
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

const isDispatchableIntent = (intent: TorrentIntentExtended): intent is DispatchableIntent => Object.prototype.hasOwnProperty.call(dispatchHandlers, intent.type);

export function createTorrentDispatch({ client, refreshTorrents, refreshSessionStatsData, refreshDetailData, reportCommandError }: CreateTorrentDispatchOptions) {
    const locationFollowUpTokens = new Map<string, symbol>();

    const refreshAuthoritativeState = async () => {
        await refreshTorrents();
        await refreshDetailData();
        await refreshSessionStatsData();
    };

    const reportBackgroundOperationError = (error: unknown) => {
        infraLogger.warn(
            {
                scope: "torrent_dispatch",
                event: "background_operation_failed",
                message: "Background torrent operation failed",
            },
            error,
        );
        if (reportCommandError && !isRpcCommandError(error)) {
            reportCommandError(error);
        }
    };

    const queueLocationFollowUp = (
        intent: DispatchIntentByType<"ENSURE_TORRENT_AT_LOCATION">,
    ) => {
        const dispatchClient = client;
        if (!dispatchClient) {
            return;
        }
        const torrentId = String(intent.torrentId);
        const token = Symbol(`location-follow-up:${torrentId}`);
        locationFollowUpTokens.set(torrentId, token);

        void (async () => {
            try {
                if (intent.locationMode === "locate") {
                    await dispatchClient.verify([torrentId]);
                    await refreshAuthoritativeState();
                    await watchVerifyCompletion(dispatchClient, torrentId);
                }

                if (locationFollowUpTokens.get(torrentId) !== token) {
                    return;
                }

                if (intent.resumeAfter) {
                    await dispatchClient.resume([torrentId]);
                }

                if (locationFollowUpTokens.get(torrentId) !== token) {
                    return;
                }

                await refreshAuthoritativeState();
            } catch (error) {
                if (locationFollowUpTokens.get(torrentId) === token) {
                    reportBackgroundOperationError(error);
                }
            } finally {
                if (locationFollowUpTokens.get(torrentId) === token) {
                    locationFollowUpTokens.delete(torrentId);
                }
            }
        })();
    };

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
            return dispatchOutcome.executionFailed();
        }
    };

    const executeIntent = async <TType extends DispatchableIntentType>(intent: DispatchIntentByType<TType>, context: DispatchContext) => {
        const handler = dispatchHandlers[intent.type];
        return runWithRefresh(() => handler.run(intent, context), handler.refresh);
    };

    return async (intent: TorrentIntentExtended) => {
        if (!client) {
            return {
                status: "unsupported",
                reason: dispatchReason.clientUnavailable,
            } as const;
        }
        if (!isDispatchableIntent(intent)) {
            return {
                status: "unsupported",
                reason: dispatchReason.intentUnsupported,
            } as const;
        }
        return executeIntent(intent, { client, queueLocationFollowUp });
    };
}
