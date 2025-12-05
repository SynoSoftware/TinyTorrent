import { useState, useEffect, useCallback, useRef } from "react";
import { usePerformanceHistory } from "../../../core/hooks/usePerformanceHistory";
import type { ITorrentClient } from "../../../core/domain/client.interface";
import type { RpcStatus } from "../../../core/hooks/useRpcConnection";
import type { Torrent } from "../types/torrent";

type UseTorrentDataOptions = {
  client: ITorrentClient;
  sessionReady: boolean;
  pollingIntervalMs: number;
  autoRefresh?: boolean;
  onRpcStatusChange?: (status: Exclude<RpcStatus, "idle">) => void;
};

export type QueueActionHandlers = {
  moveToTop: (ids: string[]) => Promise<void>;
  moveUp: (ids: string[]) => Promise<void>;
  moveDown: (ids: string[]) => Promise<void>;
  moveToBottom: (ids: string[]) => Promise<void>;
};

type UseTorrentDataResult = {
  torrents: Torrent[];
  isInitialLoadFinished: boolean;
  refresh: () => Promise<void>;
  queueActions: QueueActionHandlers;
};

export function useTorrentData({
  client,
  sessionReady,
  pollingIntervalMs,
  autoRefresh = true,
  onRpcStatusChange,
}: UseTorrentDataOptions): UseTorrentDataResult {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isInitialLoadFinished, setIsInitialLoadFinished] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const initialLoadRef = useRef(false);
  const { pushSpeeds } = usePerformanceHistory();

  const refresh = useCallback(async () => {
    try {
      const data = await client.getTorrents();
      if (!isMountedRef.current) return;
      setTorrents(data);
      const totalDown = data.reduce((acc, torrent) => acc + (torrent.state === "downloading" ? torrent.speed.down : 0), 0);
      const totalUp = data.reduce((acc, torrent) => acc + torrent.speed.up, 0);
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
    if (!sessionReady || !autoRefresh) return;
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
  }, [sessionReady, pollingIntervalMs, refresh, autoRefresh]);

  return {
    torrents,
    isInitialLoadFinished,
    refresh,
    queueActions: {
      moveToTop: async (ids) => {
        await client.moveToTop(ids);
      },
      moveUp: async (ids) => {
        await client.moveUp(ids);
      },
      moveDown: async (ids) => {
        await client.moveDown(ids);
      },
      moveToBottom: async (ids) => {
        await client.moveToBottom(ids);
      },
    },
  };
}
