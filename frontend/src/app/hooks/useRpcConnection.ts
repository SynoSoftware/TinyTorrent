import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { RpcStatus } from "@/shared/types/rpc";

type UseRpcConnectionResult = {
    rpcStatus: RpcStatus;
    isReady: boolean;
    reconnect: () => void;
    reportRpcStatus: (status: RpcStatus) => void;
};

export function useRpcConnection(
    client: EngineAdapter
): UseRpcConnectionResult {
    const [rpcStatus, setRpcStatus] = useState<RpcStatus>("idle");
    const [isReady, setIsReady] = useState(false);
    const isMountedRef = useRef(false);
    const isHandshakingRef = useRef(false);
    const pendingReconnectRef = useRef(false);
    const latestHandshakeRef = useRef<() => Promise<void>>(
        () => Promise.resolve()
    );

    const updateStatus = useCallback((next: RpcStatus) => {
        console.log(`[tiny-torrent][rpc] status -> ${next}`);
        if (isMountedRef.current) {
            setRpcStatus(next);
        }
    }, []);

    const handshake = useCallback(async () => {
        if (isHandshakingRef.current) {
            console.log(
                "[tiny-torrent][rpc] handshake already running, queuing reconnect"
            );
            pendingReconnectRef.current = true;
            return;
        }
        isHandshakingRef.current = true;
        pendingReconnectRef.current = false;
        console.log("[tiny-torrent][rpc] handshake start");
        setIsReady(false);
        updateStatus("idle");
        try {
            if (client.handshake) {
                await client.handshake();
            }
            updateStatus("connected");
            console.log("[tiny-torrent][rpc] handshake succeeded");
        } catch {
            console.log("[tiny-torrent][rpc] handshake failed");
            updateStatus("error");
        } finally {
            if (isMountedRef.current) {
                setIsReady(true);
            }
            isHandshakingRef.current = false;
            if (pendingReconnectRef.current) {
                console.log(
                    "[tiny-torrent][rpc] running queued reconnect handshake"
                );
                pendingReconnectRef.current = false;
                void latestHandshakeRef.current?.();
            }
        }
    }, [client, updateStatus]);

    useEffect(() => {
        latestHandshakeRef.current = handshake;
    }, [handshake]);

    useEffect(() => {
        isMountedRef.current = true;
        void handshake();
        return () => {
            isMountedRef.current = false;
        };
    }, [handshake]);

    const reconnect = useCallback(() => {
        console.log("[tiny-torrent][rpc] reconnect requested");
        void handshake();
    }, [handshake]);

    const reportRpcStatus = useCallback(
        (status: RpcStatus) => {
            console.log(`[tiny-torrent][rpc] report status -> ${status}`);
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
