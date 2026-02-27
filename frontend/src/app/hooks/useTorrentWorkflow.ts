import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DeleteIntent } from "@/app/types/workspace";
import {
    GLOBAL_ACTION_FEEDBACK_CONFIG, useActionFeedback, type FeedbackAction, } from "@/app/hooks/useActionFeedback";
import type { TorrentEntity as Torrent } from "@/services/rpc/entities";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import {
    commandOutcome, commandReason, isCommandFailed, isCommandSuccess, type SuccessReason, type TorrentCommandOutcome, } from "@/app/context/AppCommandContext";
import { buildOptimisticStatusUpdatesForAction } from "@/app/domain/torrentActionPolicy";
import type { OptimisticStatusMap } from "@/modules/dashboard/types/contracts";
import type { TorrentStatus } from "@/services/rpc/entities";
import { registry } from "@/config/logic";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import {
    evaluateRelocationMoveVerification,
    resolveSetDownloadLocationMode,
    type LocationMode,
} from "@/modules/dashboard/domain/torrentRelocation";

// removed unused `FeedbackTone` import
import { useSelection } from "@/app/context/AppShellStateContext";
const { timing } = registry;

export type RecheckRefreshOutcome =
    | "success"
    | typeof commandReason.refreshFailed
    | typeof commandReason.refreshSkipped;

interface UseTorrentWorkflowParams {
    torrents: Torrent[];
    optimisticStatuses: OptimisticStatusMap;
    updateOptimisticStatuses: (
        updates: Array<{
            id: string;
            state?: TorrentStatus;
            operation?: "moving" | null;
        }>,
    ) => void;
    executeTorrentAction: (
        action: TorrentTableAction,
        torrent: Torrent,
        options?: { deleteData?: boolean },
    ) => Promise<TorrentCommandOutcome>;
    executeBulkRemove: (
        ids: string[],
        deleteData: boolean,
    ) => Promise<TorrentCommandOutcome>;
    executeSetDownloadLocation: (
        torrentId: string,
        path: string,
        locationMode: LocationMode,
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

const ACTION_ID_PREVIEW_COUNT = 3;
const ACTION_ID_PREVIEW_ID_MAX = 12;

const hashActionIds = (ids: string[]): string => {
    let hash = 0x811c9dc5;
    ids.forEach((id) => {
        for (let index = 0; index < id.length; index += 1) {
            hash ^= id.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    });
    return (hash >>> 0).toString(36);
};

type PendingMoveOperation = {
    torrentId: string;
    requestedPath: string;
    timeoutAtMs: number;
};

const isSuccessfulOutcome = (
    outcome: TorrentCommandOutcome,
): outcome is {
    status: "success";
    reason?: SuccessReason;
} => isCommandSuccess(outcome);

export function useTorrentWorkflow({
    torrents,
    optimisticStatuses,
    updateOptimisticStatuses,
    executeTorrentAction,
    executeBulkRemove,
    executeSetDownloadLocation,
    executeSelectionAction,
    onRecheckComplete,
    onPrepareDelete,
    announceAction: injectedAnnounce,
}: UseTorrentWorkflowParams) {
    const { t } = useTranslation();
    const internal = useActionFeedback();
    const announceAction = injectedAnnounce ?? internal.announceAction;
    const showFeedback = internal.showFeedback;
    const [pendingDelete, setPendingDelete] = useState<DeleteIntent | null>(
        null,
    );
    const [pendingMoveOperations, setPendingMoveOperations] = useState<
        Record<string, PendingMoveOperation>
    >({});
    const { selectedIds, activeId, setSelectedIds, setActiveId } = useSelection();
    const selectedTorrentIdsSet = useMemo(
        () => new Set(selectedIds.map(String)),
        [selectedIds],
    );
    const selectedTorrents = useMemo(
        () =>
            torrents.filter((torrent) =>
                selectedTorrentIdsSet.has(String(torrent.id)),
            ),
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
        const preview = ids
            .slice(0, ACTION_ID_PREVIEW_COUNT)
            .map((id) => id.slice(0, ACTION_ID_PREVIEW_ID_MAX))
            .join(",");
        const overflow =
            ids.length > ACTION_ID_PREVIEW_COUNT
                ? `,+${ids.length - ACTION_ID_PREVIEW_COUNT}`
                : "";
        const suffix = ids.length
            ? `${preview}${overflow}#${hashActionIds(ids)}`
            : "unknown";
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

    const startMoveOperation = useCallback(
        (torrentId: string, requestedPath: string) => {
            const startedAtMs = Date.now();
            setPendingMoveOperations((prev) => ({
                ...prev,
                [torrentId]: {
                    torrentId,
                    requestedPath,
                    timeoutAtMs: startedAtMs + timing.timeouts.setLocationMoveMs,
                },
            }));
            updateOptimisticStatuses([
                { id: torrentId, operation: "moving" },
            ]);
        },
        [updateOptimisticStatuses],
    );

    const clearMoveOperations = useCallback(
        (ids: string[]) => {
            if (!ids.length) {
                return;
            }
            setPendingMoveOperations((prev) => {
                let changed = false;
                const next = { ...prev };
                ids.forEach((id) => {
                    if (next[id]) {
                        changed = true;
                        delete next[id];
                    }
                });
                return changed ? next : prev;
            });
            updateOptimisticStatuses(
                ids.map((id) => ({ id, operation: null })),
            );
        },
        [updateOptimisticStatuses],
    );

    useEffect(() => {
        const pendingIds = Object.keys(pendingMoveOperations);
        if (!pendingIds.length) {
            return;
        }

        const torrentById = new Map(
            torrents.map((torrent) => [String(torrent.id), torrent]),
        );
        const resolvedIds: string[] = [];
        const nowMs = Date.now();

        pendingIds.forEach((id) => {
            const pendingMove = pendingMoveOperations[id];
            if (!pendingMove) {
                return;
            }
            const torrent = torrentById.get(id);
            if (!torrent) {
                resolvedIds.push(id);
                return;
            }

            const verification = evaluateRelocationMoveVerification({
                requestedPath: pendingMove.requestedPath,
                reportedPath: resolveTorrentPath(torrent),
                torrentError: torrent.error,
                nowMs,
                timeoutAtMs: pendingMove.timeoutAtMs,
            });

            if (!verification.settled) {
                return;
            }

            if (verification.outcome === "failed_error") {
                showFeedback(
                    torrent.errorString?.trim().length
                        ? torrent.errorString
                        : t("set_location.reason.move_failed"),
                    "danger",
                );
                resolvedIds.push(id);
                return;
            }

            if (verification.outcome === "succeeded") {
                resolvedIds.push(id);
                return;
            }

            if (verification.outcome === "failed_timeout") {
                showFeedback(t("set_location.reason.move_timeout"), "danger");
                resolvedIds.push(id);
            }
        });

        if (resolvedIds.length) {
            clearMoveOperations(resolvedIds);
        }
    }, [
        clearMoveOperations,
        pendingMoveOperations,
        showFeedback,
        t,
        torrents,
    ]);

    const runActionsWithOptimism = useCallback(
        async (
            action: TorrentTableAction,
            torrentsToUpdate: Torrent[],
        ): Promise<TorrentCommandOutcome> => {
            const optimisticTargets = buildOptimisticStatusUpdatesForAction(
                action,
                torrentsToUpdate,
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

            if (isCommandFailed(outcome)) {
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
                return commandOutcome.success(commandReason.refreshSkipped);
            }

            let refreshOutcome: RecheckRefreshOutcome;
            try {
                refreshOutcome = await onRecheckComplete();
            } catch {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                return commandOutcome.failed(commandReason.refreshFailed);
            }

            if (refreshOutcome === "success") {
                return outcome;
            }
            if (refreshOutcome === commandReason.refreshSkipped) {
                return commandOutcome.success(commandReason.refreshSkipped);
            }
            if (refreshOutcome === commandReason.refreshFailed) {
                showFeedback(t("toolbar.feedback.failed"), "danger");
                return commandOutcome.failed(commandReason.refreshFailed);
            }

            const exhaustive: never = refreshOutcome;
            return exhaustive;
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
                return commandOutcome.success(commandReason.queued);
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
            if (!selectedTorrents.length) return commandOutcome.noSelection();
            const targets = [...selectedTorrents];
            if (action === "remove" || action === "remove-with-data") {
                requestDelete(targets, action, action === "remove-with-data");
                return commandOutcome.success(commandReason.queued);
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

    const handleSetDownloadLocation = useCallback(
        async ({
            torrent,
            path,
        }: {
            torrent: Torrent;
            path: string;
        }): Promise<TorrentCommandOutcome> => {
            const locationMode = resolveSetDownloadLocationMode(torrent);
            const outcome = await executeSetDownloadLocation(
                String(torrent.id),
                path,
                locationMode,
            );

            if (!isSuccessfulOutcome(outcome)) {
                if (isCommandFailed(outcome)) {
                    showFeedback(t("toolbar.feedback.failed"), "danger");
                }
                return outcome;
            }

            if (locationMode === "move") {
                startMoveOperation(String(torrent.id), path);
            }

            return outcome;
        },
        [
            executeSetDownloadLocation,
            showFeedback,
            startMoveOperation,
            t,
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
            onPrepareDelete?.(torrent, deleteData);
        },
        [markRemoved, onPrepareDelete],
    );

    const confirmDelete = useCallback(
        async (overrideDeleteData?: boolean): Promise<TorrentCommandOutcome> => {
            if (!pendingDelete) return commandOutcome.noSelection();
            const {
                torrents: toDelete,
                action,
                deleteData: pdDelete,
            } = pendingDelete;
            const previousSelectedIds = selectedIds;
            const previousActiveId = activeId;
            setPendingDelete(null);
            const deleteData = overrideDeleteData ?? pdDelete;
            const count = toDelete.length;
            const hasFeedback = action in GLOBAL_ACTION_FEEDBACK_CONFIG;
            const actionKey = action as FeedbackAction;
            const actionId = buildActionId(actionKey, toDelete);
            if (hasFeedback) {
                announceAction(actionKey, "start", count, actionId);
            }

            setSelectedIds([]);
            setActiveId(null);
            toDelete.forEach((torrent) => {
                performUIActionDelete(torrent, deleteData);
            });

            let outcome: TorrentCommandOutcome = commandOutcome.success();
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
                if (isCommandFailed(outcome)) {
                    showFeedback(t("toolbar.feedback.failed"), "danger");
                }
                revertRemovedKeys(toDelete);
                setSelectedIds(previousSelectedIds);
                setActiveId(previousActiveId);
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
            selectedIds,
            activeId,
            setActiveId,
            setSelectedIds,
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
        handleSetDownloadLocation,
        removedIds: removedKeys,
    };
}




