import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DeleteIntent } from "@/app/types/workspace";
import {
    GLOBAL_ACTION_FEEDBACK_CONFIG,
    useActionFeedback,
    type FeedbackAction,
} from "@/app/hooks/useActionFeedback";
import { useOptimisticStatuses } from "@/app/hooks/useOptimisticStatuses";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentStatus } from "@/services/rpc/entities";
import STATUS from "@/shared/status";
import type { TorrentCommandOutcome } from "@/app/context/AppCommandContext";

// removed unused `FeedbackTone` import
import { useSelection } from "@/app/context/AppShellStateContext";

export type RecheckRefreshOutcome =
    | "success"
    | "refresh_failed"
    | "refresh_skipped";

interface UseTorrentWorkflowParams {
    torrents: Torrent[];
    executeTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean },
    ) => Promise<TorrentCommandOutcome>;
    executeBulkRemove: (
        ids: string[],
        deleteData: boolean,
    ) => Promise<TorrentCommandOutcome>;
    executeSelectionAction: (
        action: TorrentTableAction,
        targets: Torrent[],
    ) => Promise<TorrentCommandOutcome>;
    onRecheckComplete?: () => Promise<RecheckRefreshOutcome>;
    onPrepareDelete?: (torrent: Torrent, deleteData: boolean) => void;
    announceAction?: (
        action: FeedbackAction,
        stage: "start" | "done",
        count: number,
        actionId?: string,
    ) => void;
}

// TODO: Collapse feedback params into a single CommandDescriptor object once this
// workflow view-model stabilizes. That object should carry actionId/count/tone/stage
// so we stop growing the signature while keeping this identity-based model intact.

const getTorrentKey = (torrent: { id?: string | number; hash?: string }) =>
    torrent.id?.toString() ?? torrent.hash ?? "";

const COMMAND_OUTCOME_QUEUED: TorrentCommandOutcome = {
    status: "success",
    reason: "queued",
};
const COMMAND_OUTCOME_REFRESH_SKIPPED: TorrentCommandOutcome = {
    status: "success",
    reason: "refresh_skipped",
};
const COMMAND_OUTCOME_NO_SELECTION: TorrentCommandOutcome = {
    status: "canceled",
    reason: "no_selection",
};
const COMMAND_OUTCOME_REFRESH_FAILED: TorrentCommandOutcome = {
    status: "failed",
    reason: "refresh_failed",
};

const isSuccessfulOutcome = (
    outcome: TorrentCommandOutcome,
): outcome is { status: "success"; reason?: "queued" | "refresh_skipped" } =>
    outcome.status === "success";

export function useTorrentWorkflow({
    torrents,
    executeTorrentAction,
    executeBulkRemove,
    executeSelectionAction,
    onRecheckComplete,
    onPrepareDelete,
    announceAction: injectedAnnounce,
}: UseTorrentWorkflowParams) {
    const { t } = useTranslation();
    const internal = useActionFeedback();
    const announceAction = injectedAnnounce ?? internal.announceAction;
    const showFeedback = internal.showFeedback;
    const { optimisticStatuses, updateOptimisticStatuses } =
        useOptimisticStatuses(torrents);
    const [pendingDelete, setPendingDelete] = useState<DeleteIntent | null>(
        null,
    );
    const { selectedIds, setSelectedIds, setActiveId } = useSelection();
    const selectedTorrentIdsSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds],
    );
    const selectedTorrents = useMemo(
        () =>
            torrents.filter((torrent) => selectedTorrentIdsSet.has(torrent.id)),
        [selectedTorrentIdsSet, torrents],
    );
    // TODO: Move selection-aware action logic into a view-model/shared handler (aligned with App split) so workflow is not tightly coupled to SelectionContext and prop drilling.

    const [removedKeys, setRemovedKeys] = useState<Set<string>>(
        () => new Set(),
    );
    const recentlyRemovedKeysRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!recentlyRemovedKeysRef.current.size) return;
        const activeKeys = new Set(
            torrents
                .map((torrent) => getTorrentKey(torrent))
                .filter((key): key is string => Boolean(key)),
        );
        recentlyRemovedKeysRef.current.forEach((key) => {
            if (activeKeys.has(key)) {
                setRemovedKeys((prev) => {
                    if (!prev.has(key)) return prev;
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                recentlyRemovedKeysRef.current.delete(key);
            }
        });
    }, [torrents]);

    const markRemoved = useCallback((key: string) => {
        setRemovedKeys((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    }, []);

    const unmarkRemoved = useCallback((key: string) => {
        setRemovedKeys((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    }, []);

    const buildActionId = (
        action: FeedbackAction,
        targets: (Torrent | { id?: string | number; hash?: string })[],
    ) => {
        // Guardrail: actionId must be deterministic and stable (no randomness/timing).
        const ids = targets
            .map((torrent) => torrent.id ?? torrent.hash ?? "unknown")
            .map(String)
            .filter(Boolean)
            .sort();
        const suffix = ids.length ? ids.join(",") : "unknown";
        return `${action}:${suffix}`;
    };

    const requestDelete = useCallback(
        (
            torrentsToDelete: Torrent[],
            action: DeleteIntent["action"],
            deleteData: boolean,
        ) => {
            if (!torrentsToDelete.length) return;
            setPendingDelete({
                torrents: torrentsToDelete.map((torrent) => torrent),
                action,
                deleteData,
            });
        },
        [],
    );

    const clearPendingDelete = useCallback(() => {
        setPendingDelete(null);
    }, []);

    const getOptimisticStateForAction = useCallback(
        (
            action: TorrentTableAction,
            torrent: Torrent,
        ): TorrentStatus | undefined => {
            if (action === "pause") {
                return STATUS.torrent.PAUSED;
            }
            if (action === "resume") {
                return torrent.state === STATUS.torrent.SEEDING
                    ? STATUS.torrent.SEEDING
                    : STATUS.torrent.DOWNLOADING;
            }
            if (action === "recheck") {
                return STATUS.torrent.CHECKING;
            }
            return undefined;
        },
        [],
    );

    const runActionsWithOptimism = useCallback(
        async (
            action: TorrentTableAction,
            torrentsToUpdate: Torrent[],
        ): Promise<TorrentCommandOutcome> => {
            const optimisticTargets = torrentsToUpdate
                .map((torrent) => {
                    const state = getOptimisticStateForAction(action, torrent);
                    return state ? ({ id: torrent.id, state } as const) : null;
                })
                .filter(
                    (update): update is { id: string; state: TorrentStatus } =>
                        Boolean(update),
                );
            if (optimisticTargets.length) {
                updateOptimisticStatuses(optimisticTargets);
            }

            const outcome =
                torrentsToUpdate.length > 1
                    ? await executeSelectionAction(action, torrentsToUpdate)
                    : await executeTorrentAction(action, torrentsToUpdate[0]);

            if (isSuccessfulOutcome(outcome)) {
                return outcome;
            }

            if (outcome.status === "failed") {
                showFeedback(t("toolbar.feedback.failed"), "danger");
            }
            if (optimisticTargets.length) {
                updateOptimisticStatuses(
                    optimisticTargets.map(({ id }) => ({ id })),
                );
            }
            return outcome;
        },
        [
            executeTorrentAction,
            getOptimisticStateForAction,
            showFeedback,
            executeSelectionAction,
            t,
            updateOptimisticStatuses,
        ],
    );

    const resolveRecheckRefreshOutcome = useCallback(
        async (
            action: TorrentTableAction,
            outcome: TorrentCommandOutcome,
        ): Promise<TorrentCommandOutcome> => {
            if (action !== "recheck" || !isSuccessfulOutcome(outcome)) {
                return outcome;
            }

            if (typeof onRecheckComplete !== "function") {
                return COMMAND_OUTCOME_REFRESH_SKIPPED;
            }

            try {
                const refreshOutcome = await onRecheckComplete();
                if (refreshOutcome === "success") {
                    return outcome;
                }
                if (refreshOutcome === "refresh_skipped") {
                    return COMMAND_OUTCOME_REFRESH_SKIPPED;
                }
            } catch {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                return COMMAND_OUTCOME_REFRESH_FAILED;
            }

            showFeedback(t("toolbar.feedback.failed"), "danger");
            return COMMAND_OUTCOME_REFRESH_FAILED;
        },
        [onRecheckComplete, showFeedback, t],
    );

    const handleTorrentAction = useCallback(
        async (
            action: TorrentTableAction,
            torrent: Torrent,
        ): Promise<TorrentCommandOutcome> => {
            if (action === "remove" || action === "remove-with-data") {
                requestDelete([torrent], action, action === "remove-with-data");
                return COMMAND_OUTCOME_QUEUED;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, [torrent]);
            if (hasFeedback) {
                announceAction(actionKey, "start", 1, actionId);
            }
            const outcome = await runActionsWithOptimism(action, [torrent]);
            const settledOutcome = await resolveRecheckRefreshOutcome(
                action,
                outcome,
            );

            if (
                hasFeedback &&
                isSuccessfulOutcome(settledOutcome) &&
                action !== "recheck"
            ) {
                announceAction(actionKey, "done", 1, actionId);
            }
            return settledOutcome;
        },
        [
            announceAction,
            requestDelete,
            resolveRecheckRefreshOutcome,
            runActionsWithOptimism,
        ],
    );

    const handleBulkAction = useCallback(
        async (action: TorrentTableAction): Promise<TorrentCommandOutcome> => {
            if (!selectedTorrents.length) return COMMAND_OUTCOME_NO_SELECTION;
            const targets = [...selectedTorrents];
            if (action === "remove" || action === "remove-with-data") {
                requestDelete(targets, action, action === "remove-with-data");
                return COMMAND_OUTCOME_QUEUED;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, targets);
            if (hasFeedback) {
                announceAction(actionKey, "start", targets.length, actionId);
            }
            const outcome = await runActionsWithOptimism(action, targets);
            const settledOutcome = await resolveRecheckRefreshOutcome(
                action,
                outcome,
            );

            if (
                hasFeedback &&
                isSuccessfulOutcome(settledOutcome) &&
                action !== "recheck"
            ) {
                announceAction(actionKey, "done", targets.length, actionId);
            }
            return settledOutcome;
        },
        [
            announceAction,
            requestDelete,
            resolveRecheckRefreshOutcome,
            runActionsWithOptimism,
            selectedTorrents,
        ],
    );

    const revertRemovedKeys = useCallback(
        (targets: Torrent[]) => {
            targets.forEach((torrent) => {
                const key = getTorrentKey(torrent);
                if (key) {
                    unmarkRemoved(key);
                }
            });
        },
        [unmarkRemoved],
    );

    const performUIActionDelete = useCallback(
        (torrent: Torrent, deleteData = false) => {
            const key = getTorrentKey(torrent);
            if (!key) return;
            markRemoved(key);
            recentlyRemovedKeysRef.current.add(key);
            setSelectedIds([]);
            setActiveId(null);
            onPrepareDelete?.(torrent, deleteData);
        },
        [markRemoved, onPrepareDelete, setActiveId, setSelectedIds],
    );

    const confirmDelete = useCallback(
        async (overrideDeleteData?: boolean): Promise<TorrentCommandOutcome> => {
            if (!pendingDelete) return COMMAND_OUTCOME_NO_SELECTION;
            const {
                torrents: toDelete,
                action,
                deleteData: pdDelete,
            } = pendingDelete;
            setPendingDelete(null);
            const deleteData = overrideDeleteData ?? pdDelete;
            const count = toDelete.length;
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, toDelete);
            if (hasFeedback) {
                announceAction(actionKey, "start", count, actionId);
            }

            toDelete.forEach((torrent) => {
                performUIActionDelete(torrent, deleteData);
            });

            let outcome: TorrentCommandOutcome = { status: "success" };
            if (
                toDelete.length > 1 &&
                (action === "remove" || action === "remove-with-data")
            ) {
                const ids = toDelete.map((torrent) => torrent.id);
                const shouldDeleteData =
                    action === "remove-with-data" ? true : deleteData;
                outcome = await executeBulkRemove(ids, shouldDeleteData);
            } else {
                for (const torrent of toDelete) {
                    const options =
                        action === "remove" ? { deleteData } : undefined;
                    outcome = await executeTorrentAction(action, torrent, options);
                    if (!isSuccessfulOutcome(outcome)) {
                        break;
                    }
                }
            }

            if (!isSuccessfulOutcome(outcome)) {
                if (outcome.status === "failed") {
                    showFeedback(t("toolbar.feedback.failed"), "danger");
                }
                revertRemovedKeys(toDelete);
            }

            if (hasFeedback && isSuccessfulOutcome(outcome)) {
                announceAction(actionKey, "done", count, actionId);
            }

            return outcome;
        },
        [
            announceAction,
            executeBulkRemove,
            executeTorrentAction,
            pendingDelete,
            performUIActionDelete,
            revertRemovedKeys,
            t,
            showFeedback,
        ],
    );

    return {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        handleTorrentAction,
        handleBulkAction,
        removedIds: removedKeys,
        performUIActionDelete,
    };
}

