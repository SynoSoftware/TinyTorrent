import { useState, useEffect, useCallback, useRef } from "react";
import { usePerformanceHistory } from "../../../core/hooks/usePerformanceHistory";
import type { TransmissionClient } from "../../../core/rpc-client";
import type { RpcStatus } from "../../../core/hooks/useTransmissionSession";
import { normalizeTorrent } from "../types/torrent";
import type { Torrent } from "../types/torrent";

type UseTorrentDataOptions = {
  client: TransmissionClient;
  sessionReady: boolean;
  pollingIntervalMs: number;
  onRpcStatusChange?: (status: Exclude<RpcStatus, "idle">) => void;
};

type QueueActionHandlers = {
  moveToTop: (ids: number[]) => Promise<void>;
  moveUp: (ids: number[]) => Promise<void>;
  moveDown: (ids: number[]) => Promise<void>;
  moveToBottom: (ids: number[]) => Promise<void>;
};

type UseTorrentDataResult = {
  torrents: Torrent[];
  isInitialLoadFinished: boolean;
  refresh: () => Promise<void>;
  queueActions: QueueActionHandlers;
};

export function useTorrentData({ client, sessionReady, pollingIntervalMs, onRpcStatusChange }: UseTorrentDataOptions): UseTorrentDataResult {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isInitialLoadFinished, setIsInitialLoadFinished] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const initialLoadRef = useRef(false);
  const { pushSpeeds } = usePerformanceHistory();

  const refresh = useCallback(async () => {
    try {
      const data = await client.fetchTorrents();
      if (!isMountedRef.current) return;
      const normalized = data.map(normalizeTorrent);
      setTorrents(normalized);
      const totalDown = normalized.reduce((acc, torrent) => acc + (torrent.status === "downloading" ? torrent.rateDownload : 0), 0);
      const totalUp = normalized.reduce((acc, torrent) => acc + torrent.rateUpload, 0);
      pushSpeeds(totalDown, totalUp);
      onRpcStatusChange?.("connected");
    } catch (error) {
      if (!isMountedRef.current) return;
      onRpcStatusChange?.("error");
      throw error;
    } finally {
      if (isMountedRef.current && !initialLoadRef.current) {
        initialLoadRef.current = true;
        setIsInitialLoadFinished(true);
      }
    }
  }, [client, onRpcStatusChange, pushSpeeds]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh();
    const intervalMs = Math.max(1000, pollingIntervalMs);
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingRef.current = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [sessionReady, pollingIntervalMs, refresh]);

  return {
    torrents,
    isInitialLoadFinished,
    refresh,
    queueActions: {
      moveToTop: async (ids) => {
        await client.moveTorrentsToTop(ids);
        await refresh();
      },
      moveUp: async (ids) => {
        await client.moveTorrentsUp(ids);
        await refresh();
      },
      moveDown: async (ids) => {
        await client.moveTorrentsDown(ids);
        await refresh();
      },
      moveToBottom: async (ids) => {
        await client.moveTorrentsToBottom(ids);
        await refresh();
      },
    },
  };
}
