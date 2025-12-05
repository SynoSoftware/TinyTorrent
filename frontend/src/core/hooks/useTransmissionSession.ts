import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { TransmissionClient } from "../rpc-client";
import type { TransmissionSessionSettings } from "../types";

export type RpcStatus = "idle" | "connected" | "error";

type UseTransmissionSessionResult = {
  client: TransmissionClient;
  rpcStatus: RpcStatus;
  isReady: boolean;
  reconnect: () => void;
  sessionSettings: TransmissionSessionSettings | null;
  refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
  reportRpcStatus: (status: RpcStatus) => void;
  updateRequestTimeout: (timeout: number) => void;
};

export function useTransmissionSession(): UseTransmissionSessionResult {
  const client = useMemo(
    () =>
      new TransmissionClient({
        username: import.meta.env.VITE_RPC_USERNAME ?? "",
        password: import.meta.env.VITE_RPC_PASSWORD ?? "",
      }),
    []
  );
  const [rpcStatus, setRpcStatus] = useState<RpcStatus>("idle");
  const [isReady, setIsReady] = useState(false);
  const [sessionSettings, setSessionSettings] = useState<TransmissionSessionSettings | null>(null);
  const isMountedRef = useRef(false);

  const updateStatus = useCallback((next: RpcStatus) => {
    if (isMountedRef.current) {
      setRpcStatus(next);
    }
  }, []);

  const handshake = useCallback(async () => {
    setIsReady(false);
    updateStatus("idle");
    try {
      await client.handshake();
      updateStatus("connected");
    } catch {
      updateStatus("error");
    } finally {
      if (isMountedRef.current) {
        setIsReady(true);
      }
    }
  }, [client, updateStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    void handshake();
    return () => {
      isMountedRef.current = false;
    };
  }, [handshake]);

  const reconnect = useCallback(() => {
    void handshake();
  }, [handshake]);

  const refreshSessionSettings = useCallback(async () => {
    try {
      const session = await client.fetchSessionSettings();
      if (isMountedRef.current) {
        setSessionSettings(session);
      }
      return session;
    } catch (error) {
      updateStatus("error");
      throw error;
    }
  }, [client, updateStatus]);

  const reportRpcStatus = useCallback(
    (status: RpcStatus) => {
      updateStatus(status);
    },
    [updateStatus]
  );

  const updateRequestTimeout = useCallback(
    (timeout: number) => {
      client.updateRequestTimeout(timeout);
    },
    [client]
  );

  return {
    client,
    rpcStatus,
    isReady,
    reconnect,
    sessionSettings,
    refreshSessionSettings,
    reportRpcStatus,
    updateRequestTimeout,
  };
}
