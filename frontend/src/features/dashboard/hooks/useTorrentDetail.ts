import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { ITorrentClient } from "../../../core/domain/client.interface";
import type { RpcStatus } from "../../../core/hooks/useRpcConnection";
import type { TorrentDetail } from "../types/torrent";

interface UseTorrentDetailParams {
  torrentClient: ITorrentClient;
  reportRpcStatus: (status: RpcStatus) => void;
  isMountedRef: MutableRefObject<boolean>;
}

interface UseTorrentDetailResult {
  detailData: TorrentDetail | null;
  loadDetail: (torrentId: string, placeholder?: TorrentDetail) => Promise<void>;
  refreshDetailData: () => Promise<void>;
  clearDetail: () => void;
  mutateDetail: (updater: (current: TorrentDetail) => TorrentDetail | null) => void;
}

export function useTorrentDetail({
  torrentClient,
  reportRpcStatus,
  isMountedRef,
}: UseTorrentDetailParams): UseTorrentDetailResult {
  const [detailData, setDetailData] = useState<TorrentDetail | null>(null);
  const detailRequestRef = useRef(0);

  const loadDetail = useCallback(
    async (torrentId: string, placeholder?: TorrentDetail) => {
      const requestId = ++detailRequestRef.current;
      if (placeholder) {
        setDetailData(placeholder);
      }
      try {
        const detail = await torrentClient.getTorrentDetails(torrentId);
        if (detailRequestRef.current !== requestId) return;
        if (isMountedRef.current) {
          setDetailData(detail);
        }
      } catch {
        if (detailRequestRef.current !== requestId) return;
        if (isMountedRef.current) {
          reportRpcStatus("error");
        }
      }
    },
    [torrentClient, reportRpcStatus, isMountedRef]
  );

  const refreshDetailData = useCallback(async () => {
    if (!detailData) return;
    await loadDetail(detailData.id);
  }, [detailData, loadDetail]);

  const mutateDetail = useCallback((updater: (current: TorrentDetail) => TorrentDetail | null) => {
    setDetailData((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      return next;
    });
  }, []);

  const clearDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setDetailData(null);
  }, []);

  return {
    detailData,
    loadDetail,
    refreshDetailData,
    clearDetail,
    mutateDetail,
  };
}
