import { useCallback, useState } from "react";
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

interface UseTorrentWorkflowParams {
    torrents: Torrent[];
    selectedTorrents: Torrent[];
    executeTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean }
    ) => Promise<void>;
    executeBulkRemove: (ids: string[], deleteData: boolean) => Promise<void>;
    /** Optional externally-provided feedback functions (injected by host). */
    announceAction?: (
        action: FeedbackAction,
        stage: "start" | "done",
        count: number
    ) => void;
    showFeedback?: (message: string, tone: FeedbackTone) => void;
}

export function useTorrentWorkflow({
    torrents,
    selectedTorrents,
    executeTorrentAction,
    executeBulkRemove,
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
                for (const torrent of torrentsToUpdate) {
                    await executeTorrentAction(action, torrent);
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
            if (hasFeedback) {
                announceAction(actionKey, "start", 1);
            }
            const success = await runActionsWithOptimism(action, [torrent]);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", 1);
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
            if (hasFeedback) {
                announceAction(actionKey, "start", targets.length);
            }
            const success = await runActionsWithOptimism(action, targets);
            if (hasFeedback && success) {
                announceAction(actionKey, "done", targets.length);
            }
        },
        [
            announceAction,
            requestDelete,
            runActionsWithOptimism,
            selectedTorrents,
        ]
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
            if (hasFeedback) {
                announceAction(actionKey, "start", count);
            }

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

            if (hasFeedback) {
                announceAction(actionKey, "done", count);
            }
        },
        [announceAction, executeBulkRemove, executeTorrentAction, pendingDelete]
    );

    return {
        optimisticStatuses,
        pendingDelete,
        confirmDelete,
        clearPendingDelete,
        showFeedback,
    };
}
