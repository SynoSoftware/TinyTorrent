import { useCallback, type MutableRefObject } from "react";
import type { TorrentTableAction } from "../components/TorrentTable";
import type { QueueActionHandlers } from "./useTorrentData";
import type { Torrent } from "../types/torrent";
import type { ITorrentClient } from "../../../core/domain/client.interface";
import type { RpcStatus } from "../../../core/hooks/useRpcConnection";

interface UseTorrentActionsParams {
  torrentClient: ITorrentClient;
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
    [refreshDetailData, refreshSessionStatsData, refreshTorrents, reportRpcStatus, isMountedRef]
  );

  const handleTorrentAction = useCallback(
    async (action: TorrentTableAction, torrent: Torrent, options?: { deleteData?: boolean }) => {
      if (!torrent) return;
      const ids = [torrent.id];
      if (action === "pause") {
        await runWithRefresh(() => torrentClient.pause(ids));
      } else if (action === "resume") {
        await runWithRefresh(() => torrentClient.resume(ids));
      } else if (action === "recheck") {
        await runWithRefresh(() => torrentClient.verify(ids));
      } else if (action === "remove") {
        await runWithRefresh(() => torrentClient.remove(ids, Boolean(options?.deleteData)));
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

  return {
    handleTorrentAction,
  };
}
