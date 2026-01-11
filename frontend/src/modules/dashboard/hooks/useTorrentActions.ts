import { useCallback, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { QueueActionHandlers } from "@/modules/dashboard/hooks/useTorrentData";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ReportCommandErrorFn } from "@/shared/types/rpc";
import { isRpcCommandError } from "@/services/rpc/errors";
import { interpretFsError } from "@/shared/utils/fsErrors";
import type { FeedbackTone } from "@/shared/types/feedback";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
} from "@/app/types/recoveryGate";

const normalizePath = (value: string) => value.replace(/[\\/]+$/g, "");

const buildAncestorPaths = (value: string) => {
    const cleaned = normalizePath(value);
    if (!cleaned) return [];
    const ancestors: string[] = [];
    let current = cleaned;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
        ancestors.push(current);
        seen.add(current);
        const lastSlash = Math.max(
            current.lastIndexOf("/"),
            current.lastIndexOf("\\")
        );
        if (lastSlash === -1) {
            break;
        }
        current = normalizePath(current.slice(0, lastSlash));
        if (!current) break;
    }
    if (!ancestors[ancestors.length - 1]) {
        ancestors.push("");
    }
    return ancestors;
};
interface UseTorrentActionsParams {
    torrentClient: EngineAdapter;
    queueActions: QueueActionHandlers;
    refreshTorrents: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportCommandError: ReportCommandErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    requestRecovery?: RecoveryGateCallback;
    showFeedback: (message: string, tone: FeedbackTone) => void;
}

interface RefreshOptions {
    refreshTorrents?: boolean;
    refreshDetail?: boolean;
    refreshStats?: boolean;
    reportRpcError?: boolean;
}

export function useTorrentActions({
    torrentClient,
    queueActions,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportCommandError,
    isMountedRef,
    requestRecovery,
    showFeedback,
}: UseTorrentActionsParams) {
    const { t } = useTranslation();
    const runWithRefresh = useCallback(
        async (operation: () => Promise<void>, options?: RefreshOptions) => {
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
                if (isMountedRef.current && (options?.reportRpcError ?? true)) {
                    if (!isRpcCommandError(error)) {
                        reportCommandError(error);
                    }
                }
            }
        },
        [
            refreshDetailData,
            refreshSessionStatsData,
            refreshTorrents,
            reportCommandError,
            isMountedRef,
        ]
    );

    const evaluateRecoveryGate = useCallback(
        async (action: TorrentTableAction, target: Torrent) => {
            if (!requestRecovery) {
                if (
                    import.meta.env.DEV &&
                    target.errorEnvelope
                ) {
                    console.error(
                        "Recovery gate missing for action",
                        action,
                        target.errorEnvelope.errorClass
                    );
                }
                return null;
            }

            if (action !== "resume" && action !== "recheck") {
                return null;
            }
            const gateAction = (action === "resume"
                ? "resume"
                : "recheck") as RecoveryGateAction;
            return requestRecovery({
                torrent: target,
                action: gateAction,
            });
        },
        [requestRecovery]
    );

    const refreshAfterRecovery = useCallback(async () => {
        await refreshTorrents();
        await refreshSessionStatsData();
        await refreshDetailData();
    }, [refreshDetailData, refreshSessionStatsData, refreshTorrents]);

    const shouldRunRecovery = useCallback(
        async (action: TorrentTableAction, target: Torrent) => {
            const result = await evaluateRecoveryGate(action, target);
            if (!result) return true;
            if (result.status === "handled") {
                await refreshAfterRecovery();
                showFeedback(
                    t("recovery.feedback.download_resumed"),
                    "info"
                );
            }
            return result.status === "continue";
        },
        [evaluateRecoveryGate, refreshAfterRecovery, showFeedback, t]
    );
    const handleTorrentAction = useCallback(
        async (
            action: TorrentTableAction,
            torrent: Torrent,
            options?: { deleteData?: boolean }
        ) => {
            if (!torrent) return;
            const ids = torrent ? [torrent.id] : [];
            if (!ids || ids.length === 0) return;
            if (action === "pause") {
                await runWithRefresh(() => torrentClient.pause(ids));
            } else if (action === "resume") {
                if (!(await shouldRunRecovery(action, torrent))) return;
                await runWithRefresh(() => torrentClient.resume(ids));
            } else if (action === "recheck") {
                if (!(await shouldRunRecovery(action, torrent))) return;
                await runWithRefresh(() => torrentClient.verify(ids));
            } else if (action === "remove") {
                await runWithRefresh(() =>
                    torrentClient.remove(ids, Boolean(options?.deleteData))
                );
            } else if (action === "remove-with-data") {
                await runWithRefresh(() => torrentClient.remove(ids, true));
            } else if (action === "queue-move-top") {
                await runWithRefresh(() => queueActions.moveToTop(ids));
            } else if (action === "queue-move-up") {
                await runWithRefresh(() => queueActions.moveUp(ids));
            } else if (action === "queue-move-down") {
                await runWithRefresh(() => queueActions.moveDown(ids));
            } else if (action === "queue-move-bottom") {
                await runWithRefresh(() => queueActions.moveToBottom(ids));
            }
        },
        [queueActions, runWithRefresh, torrentClient, shouldRunRecovery]
    );

    const handleOpenFolder = useCallback(
        async (torrent: Torrent) => {
            if (!torrentClient.openPath) return;
            const targetPath = torrent.savePath ?? "";
            if (!targetPath) return;

            let openedPath: string | null = null;
            const ancestors = buildAncestorPaths(targetPath);
            for (const path of ancestors) {
                try {
                    await torrentClient.openPath(path);
                    openedPath = path;
                    break;
                } catch (error) {
                    const kind = interpretFsError(error);
                    if (kind !== "enoent") {
                        if (
                            isMountedRef.current &&
                            !isRpcCommandError(error)
                        ) {
                            reportCommandError(error);
                        }
                        return;
                    }
                }
            }
            const normalizedTarget = normalizePath(targetPath);
            if (!openedPath) {
                try {
                    await torrentClient.openPath("");
                    openedPath = "";
                } catch {
                    // Swallow fallback failures; explorer opening is best-effort.
                }
            }

            if (openedPath !== null) {
                const normalizedOpenedPath = normalizePath(openedPath);
                if (normalizedOpenedPath !== normalizedTarget) {
                    showFeedback(
                        t("recovery.feedback.folder_parent_opened"),
                        "info"
                    );
                }
            }
        },
        [reportCommandError, torrentClient, isMountedRef, showFeedback, t]
    );

    const executeBulkRemove = useCallback(
        (ids: string[], deleteData: boolean) =>
            runWithRefresh(() => torrentClient.remove(ids, deleteData)),
        [runWithRefresh, torrentClient]
    );

    return {
        handleTorrentAction,
        handleOpenFolder,
        executeBulkRemove,
    };
}
