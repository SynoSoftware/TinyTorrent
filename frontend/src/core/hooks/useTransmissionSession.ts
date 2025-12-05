import { useCallback, useEffect, useRef, useState } from "react";
import type { TransmissionSessionSettings } from "../types";
import type { EngineInfo } from "../domain/entities";
import type { ITorrentClient } from "../domain/client.interface";
import { useRpcConnection, type RpcStatus } from "./useRpcConnection";

type UseTransmissionSessionResult = {
  client: ITorrentClient;
  rpcStatus: RpcStatus;
  isReady: boolean;
  reconnect: () => void;
  sessionSettings: TransmissionSessionSettings | null;
  refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
  reportRpcStatus: (status: RpcStatus) => void;
  updateRequestTimeout: (timeout: number) => void;
  engineInfo: EngineInfo | null;
  isDetectingEngine: boolean;
};

export { type RpcStatus } from "./useRpcConnection";

export function useTransmissionSession(client: ITorrentClient): UseTransmissionSessionResult {
  const { rpcStatus, isReady, reconnect, reportRpcStatus } = useRpcConnection(client);
  const [sessionSettings, setSessionSettings] = useState<TransmissionSessionSettings | null>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [isDetectingEngine, setIsDetectingEngine] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshSessionSettings = useCallback(async () => {
    if (!client.fetchSessionSettings) {
      throw new Error("Session settings not supported by the torrent client");
    }
    try {
      const session = await client.fetchSessionSettings();
      if (isMountedRef.current) {
        setSessionSettings(session);
      }
      return session;
    } catch (error) {
      reportRpcStatus("error");
      throw error;
    }
  }, [client, reportRpcStatus]);

  const updateRequestTimeout = useCallback(
    (timeout: number) => {
      client.updateRequestTimeout?.(timeout);
    },
    [client]
  );

  useEffect(() => {
    let active = true;
    if (!client.detectEngine || rpcStatus !== "connected") {
      if (active) {
        setEngineInfo(null);
        setIsDetectingEngine(false);
      }
      return;
    }
    setIsDetectingEngine(true);
    void client
      .detectEngine()
      .then((info) => {
        if (!active) return;
        setEngineInfo(info);
      })
      .catch(() => {
        if (!active) return;
        setEngineInfo(null);
      })
      .finally(() => {
        if (!active) return;
        setIsDetectingEngine(false);
      });
    return () => {
      active = false;
    };
  }, [client, rpcStatus]);

  return {
    client,
    rpcStatus,
    isReady,
    reconnect,
    sessionSettings,
    refreshSessionSettings,
    reportRpcStatus,
    updateRequestTimeout,
    engineInfo,
    isDetectingEngine,
  };
}
