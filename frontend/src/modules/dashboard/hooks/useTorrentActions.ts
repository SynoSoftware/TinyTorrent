import { useCallback, type MutableRefObject } from "react";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { QueueActionHandlers } from "@/modules/dashboard/hooks/useTorrentData";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ReportCommandErrorFn } from "@/shared/types/rpc";
import { isRpcCommandError } from "@/services/rpc/errors";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
} from "@/app/types/recoveryGate";

interface UseTorrentActionsParams {
    torrentClient: EngineAdapter;
    queueActions: QueueActionHandlers;
    refreshTorrents: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportCommandError: ReportCommandErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    requestRecovery?: RecoveryGateCallback;
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
}: UseTorrentActionsParams) {
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

    const shouldRunRecovery = useCallback(
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
                return true;
            }
            if (action !== "resume" && action !== "recheck") {
                return true;
            }
            const gateAction = (action === "resume"
                ? "resume"
                : "recheck") as RecoveryGateAction;
            const result = await requestRecovery({
                torrent: target,
                action: gateAction,
            });
            if (!result) return true;
            return result.status === "continue";
        },
        [requestRecovery]
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
            try {
                await torrentClient.openPath(targetPath);
            } catch (error) {
                if (
                    isMountedRef.current &&
                    !isRpcCommandError(error)
                ) {
                    reportCommandError(error);
                }
            }
        },
        [reportCommandError, torrentClient, isMountedRef]
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
