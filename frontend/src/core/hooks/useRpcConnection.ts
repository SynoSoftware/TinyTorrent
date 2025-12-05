import { useCallback, useEffect, useRef, useState } from "react";
import type { ITorrentClient } from "../domain/client.interface";

export type RpcStatus = "idle" | "connected" | "error";

type UseRpcConnectionResult = {
  rpcStatus: RpcStatus;
  isReady: boolean;
  reconnect: () => void;
  reportRpcStatus: (status: RpcStatus) => void;
};

export function useRpcConnection(client: ITorrentClient): UseRpcConnectionResult {
  const [rpcStatus, setRpcStatus] = useState<RpcStatus>("idle");
  const [isReady, setIsReady] = useState(false);
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
      if (client.handshake) {
        await client.handshake();
      }
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

  const reportRpcStatus = useCallback(
    (status: RpcStatus) => {
      updateStatus(status);
    },
    [updateStatus]
  );

  return {
    rpcStatus,
    isReady,
    reconnect,
    reportRpcStatus,
  };
}
