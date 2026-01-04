import { useCallback, useEffect, useRef, useState } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ReportCommandErrorFn,
    ReportReadErrorFn,
    RpcStatus,
} from "@/shared/types/rpc";

type UseRpcConnectionResult = {
    rpcStatus: RpcStatus;
    isReady: boolean;
    reconnect: () => void;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
};

export function useRpcConnection(
    client?: EngineAdapter
): UseRpcConnectionResult {
    // If a client isn't provided, fall back to the app-wide client from context.
    const defaultClient = useTorrentClient();
    const resolvedClient: EngineAdapter = client ?? defaultClient;
    const [rpcStatus, setRpcStatus] = useState<RpcStatus>("idle");
    const [isReady, setIsReady] = useState(false);
    const isMountedRef = useRef(false);
    const isHandshakingRef = useRef(false);
    const pendingReconnectRef = useRef(false);
    const latestHandshakeRef = useRef<() => Promise<void>>(() =>
        Promise.resolve()
    );

    const updateStatus = useCallback((next: RpcStatus) => {
        //        console.log(`[tiny-torrent][rpc] status -> ${next}`);
        if (isMountedRef.current) {
            setRpcStatus(next);
        }
    }, []);

    const reportTransportError = useCallback(
        (error?: unknown) => {
            console.error("[tiny-torrent][rpc] transport error", error);
            updateStatus("error");
        },
        [updateStatus]
    );

    const markTransportConnected = useCallback(() => {
        updateStatus("connected");
    }, [updateStatus]);

    const reportCommandError = useCallback((error?: unknown) => {
        console.warn("[tiny-torrent][rpc] command error", error);
    }, []);

    const reportReadError = useCallback((error?: unknown) => {
        console.warn(
            "[tiny-torrent][rpc] read RPC error - transport status remains connected",
            error
        );
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
            if (resolvedClient.handshake) {
                await resolvedClient.handshake();
            }
            markTransportConnected();
            console.log("[tiny-torrent][rpc] handshake succeeded");
        } catch (error) {
            console.log("[tiny-torrent][rpc] handshake failed");
            reportTransportError(error);
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
    }, [
        resolvedClient,
        markTransportConnected,
        reportTransportError,
        updateStatus,
    ]);

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

    return {
        rpcStatus,
        isReady,
        reconnect,
        markTransportConnected,
        reportCommandError,
        reportReadError,
    };
}
