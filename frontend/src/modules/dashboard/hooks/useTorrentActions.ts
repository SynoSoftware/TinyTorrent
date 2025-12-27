import { useCallback, type MutableRefObject } from "react";
import type { TorrentTableAction } from "@/modules/dashboard/types/torrentTable";
import type { QueueActionHandlers } from "@/modules/dashboard/hooks/useTorrentData";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { RpcStatus } from "@/shared/types/rpc";

interface UseTorrentActionsParams {
    torrentClient: EngineAdapter;
    queueActions: QueueActionHandlers;
    refreshTorrents: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
}

interface RefreshOptions {
    refreshTorrents?: boolean;
    refreshDetail?: boolean;
    refreshStats?: boolean;
}

export function useTorrentActions({
    torrentClient,
    queueActions,
    refreshTorrents,
    refreshDetailData,
    refreshSessionStatsData,
    reportRpcStatus,
    isMountedRef,
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
            } catch {
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
            }
        },
        [
            refreshDetailData,
            refreshSessionStatsData,
            refreshTorrents,
            reportRpcStatus,
            isMountedRef,
        ]
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
                await runWithRefresh(() => torrentClient.resume(ids));
            } else if (action === "recheck") {
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
        [queueActions, runWithRefresh, torrentClient]
    );

    const handleOpenFolder = useCallback(
        async (torrent: Torrent) => {
            if (!torrentClient.openPath) return;
            const targetPath = torrent.savePath ?? "";
            if (!targetPath) return;
            try {
                await torrentClient.openPath(targetPath);
            } catch {
                if (isMountedRef.current) {
                    reportRpcStatus("error");
                }
            }
        },
        [reportRpcStatus, torrentClient, isMountedRef]
    );

    return {
        handleTorrentAction,
        handleOpenFolder,
    };
}
