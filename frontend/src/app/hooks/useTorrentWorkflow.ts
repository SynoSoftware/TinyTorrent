import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DeleteIntent } from "@/app/types/workspace";
import {
    GLOBAL_ACTION_FEEDBACK_CONFIG,
    useActionFeedback,
    type FeedbackAction,
} from "./useActionFeedback";
import { useOptimisticStatuses } from "./useOptimisticStatuses";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { TorrentStatus } from "@/services/rpc/entities";
import STATUS from "@/shared/status";

import type { FeedbackTone } from "@/shared/types/feedback";
import { useSelection } from "@/app/context/SelectionContext";

interface UseTorrentWorkflowParams {
    torrents: Torrent[];
    executeTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean }
    ) => Promise<void>;
    executeBulkRemove: (ids: string[], deleteData: boolean) => Promise<void>;
    executeSelectionAction: (
        action: TorrentTableAction,
        ids: string[]
    ) => Promise<void>;
    onPrepareDelete?: (torrent: Torrent, deleteData: boolean) => void;
    /** Optional externally-provided feedback functions (injected by host). */
    announceAction?: (
        action: FeedbackAction,
        stage: "start" | "done",
        count: number,
        actionId?: string
    ) => void;
    showFeedback?: (message: string, tone: FeedbackTone) => void;
}

// TODO: Collapse feedback params into a single CommandDescriptor object once this
// workflow view-model stabilizes. That object should carry actionId/count/tone/stage
// so we stop growing the signature while keeping this identity-based model intact.

const getTorrentKey = (torrent: {
    id?: string | number;
    hash?: string;
}) => torrent.id?.toString() ?? torrent.hash ?? "";

export function useTorrentWorkflow({
    torrents,
    executeTorrentAction,
    executeBulkRemove,
    executeSelectionAction,
    onPrepareDelete,
    announceAction: injectedAnnounce,
    showFeedback: injectedShowFeedback,
}: UseTorrentWorkflowParams) {
    const { t } = useTranslation();
    const internal = useActionFeedback();
    const announceAction = injectedAnnounce ?? internal.announceAction;
    const showFeedback = injectedShowFeedback ?? internal.showFeedback;
    const { optimisticStatuses, updateOptimisticStatuses } =
        useOptimisticStatuses(torrents);
    const [pendingDelete, setPendingDelete] = useState<DeleteIntent | null>(
        null
    );
    const { selectedIds, setSelectedIds, setActiveId } = useSelection();
    const selectedTorrentIdsSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds]
    );
    const selectedTorrents = useMemo(
        () => torrents.filter((torrent) => selectedTorrentIdsSet.has(torrent.id)),
        [selectedTorrentIdsSet, torrents]
    );
    // TODO: Move selection-aware action logic into a view-model/shared handler (aligned with App split) so workflow is not tightly coupled to SelectionContext and prop drilling.

    const [removedKeys, setRemovedKeys] = useState<Set<string>>(() => new Set());
    const recentlyRemovedKeysRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!recentlyRemovedKeysRef.current.size) return;
        const activeKeys = new Set(
            torrents
                .map((torrent) => getTorrentKey(torrent))
                .filter((key): key is string => Boolean(key))
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
        targets: (Torrent | { id?: string | number; hash?: string })[]
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
            deleteData: boolean
        ) => {
            if (!torrentsToDelete.length) return;
            setPendingDelete({
                torrents: torrentsToDelete.map((torrent) => torrent),
                action,
                deleteData,
            });
        },
        []
    );

    const clearPendingDelete = useCallback(() => {
        setPendingDelete(null);
    }, []);

    const getOptimisticStateForAction = useCallback(
        (
            action: TorrentTableAction,
            torrent: Torrent
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
        []
    );

    const runActionsWithOptimism = useCallback(
        async (action: TorrentTableAction, torrentsToUpdate: Torrent[]) => {
            const optimisticTargets = torrentsToUpdate
                .map((torrent) => {
                    const state = getOptimisticStateForAction(action, torrent);
                    return state ? ({ id: torrent.id, state } as const) : null;
                })
                .filter(
                    (update): update is { id: string; state: TorrentStatus } =>
                        Boolean(update)
                );
            if (optimisticTargets.length) {
                updateOptimisticStatuses(optimisticTargets);
            }

            let succeeded = false;
            try {
                if (torrentsToUpdate.length > 1) {
                    const ids = torrentsToUpdate.map((t) => t.id);
                    await executeSelectionAction(action, ids);
                } else {
                    await executeTorrentAction(action, torrentsToUpdate[0]);
                }
                succeeded = true;
            } catch {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                if (optimisticTargets.length) {
                    updateOptimisticStatuses(
                        optimisticTargets.map(({ id }) => ({ id }))
                    );
                }
            }

            return succeeded;
        },
        [
            executeTorrentAction,
            getOptimisticStateForAction,
            showFeedback,
            t,
            updateOptimisticStatuses,
        ]
    );

    const handleTorrentAction = useCallback(
        async (action: TorrentTableAction, torrent: Torrent) => {
            if (action === "remove" || action === "remove-with-data") {
                requestDelete([torrent], action, action === "remove-with-data");
                return;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, [torrent]);
            if (hasFeedback) {
                announceAction(actionKey, "start", 1, actionId);
            }
            const success = await runActionsWithOptimism(action, [torrent]);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", 1, actionId);
            }
        },
        [announceAction, requestDelete, runActionsWithOptimism]
    );

    const handleBulkAction = useCallback(
        async (action: TorrentTableAction) => {
            if (!selectedTorrents.length) return;
            const targets = [...selectedTorrents];
            if (action === "remove" || action === "remove-with-data") {
                requestDelete(targets, action, action === "remove-with-data");
                return;
            }
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, targets);
            if (hasFeedback) {
                announceAction(actionKey, "start", targets.length, actionId);
            }
            const success = await runActionsWithOptimism(action, targets);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", targets.length, actionId);
            }
        },
        [
            announceAction,
            requestDelete,
            runActionsWithOptimism,
            selectedTorrents,
        ]
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
        [unmarkRemoved]
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
        [markRemoved, onPrepareDelete, setActiveId, setSelectedIds]
    );

    const confirmDelete = useCallback(
        async (overrideDeleteData?: boolean) => {
            if (!pendingDelete) return;
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

            let succeeded = true;
            try {
                if (
                    toDelete.length > 1 &&
                    (action === "remove" || action === "remove-with-data")
                ) {
                    const ids = toDelete.map((torrent) => torrent.id);
                    const shouldDeleteData =
                        action === "remove-with-data" ? true : deleteData;
                    await executeBulkRemove(ids, shouldDeleteData);
                } else {
                    for (const torrent of toDelete) {
                        const options =
                            action === "remove" ? { deleteData } : undefined;
                        await executeTorrentAction(action, torrent, options);
                    }
                }
            } catch {
                succeeded = false;
                showFeedback(t("toolbar.feedback.failed"), "danger");
                revertRemovedKeys(toDelete);
            }

            if (hasFeedback && succeeded) {
                announceAction(actionKey, "done", count, actionId);
            }
        },
        [
            announceAction,
            executeBulkRemove,
            executeTorrentAction,
            pendingDelete,
            performUIActionDelete,
            revertRemovedKeys,
            showFeedback,
            t,
        ]
    );

    return {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        showFeedback,
        handleTorrentAction,
        handleBulkAction,
        removedIds: removedKeys,
        performUIActionDelete,
    };
}
