import { useCallback, useEffect, useRef, useState } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ReportCommandErrorFn,
    ReportReadErrorFn,
    ConnectionStatus,
} from "@/shared/types/rpc";
import { STATUS } from "@/shared/status";

type UseRpcConnectionResult = {
    rpcStatus: ConnectionStatus;
    isReady: boolean;
    reconnect: () => void;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
};

export function useRpcConnection(
    client?: EngineAdapter
): UseRpcConnectionResult {
    const defaultClient = useTorrentClient();
    const resolvedClient: EngineAdapter = client ?? defaultClient;

    const [rpcStatus, setRpcStatus] = useState<ConnectionStatus>(
        STATUS.connection.IDLE
    );
    const [isReady, setIsReady] = useState(false);
    const isMountedRef = useRef(false);
    const isHandshakingRef = useRef(false);
    const pendingReconnectRef = useRef(false);
    const lastHandshakeTs = useRef(0);
    const HANDSHAKE_MIN_INTERVAL_MS = 800;

    const updateStatus = useCallback((next: ConnectionStatus) => {
        if (isMountedRef.current) setRpcStatus(next);
    }, []);

    const reportTransportError = useCallback(
        (error?: unknown) => {
            console.error("[tiny-torrent][rpc] transport error", error);
            updateStatus(STATUS.connection.ERROR);
        },
        [updateStatus]
    );

    const markTransportConnected = useCallback(() => {
        updateStatus(STATUS.connection.CONNECTED);
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
        const now = Date.now();
        if (isHandshakingRef.current) {
            pendingReconnectRef.current = true;
            return;
        }
        if (now - lastHandshakeTs.current < HANDSHAKE_MIN_INTERVAL_MS) {
            pendingReconnectRef.current = true;
            return;
        }
        isHandshakingRef.current = true;
        pendingReconnectRef.current = false;
        setIsReady(false);
        updateStatus(STATUS.connection.IDLE);
        try {
            if (resolvedClient.handshake) {
                await resolvedClient.handshake();
            }
            markTransportConnected();
            if (isMountedRef.current) setIsReady(true);
        } catch (err) {
            reportTransportError(err);
            if (isMountedRef.current) setIsReady(false);
        } finally {
            isHandshakingRef.current = false;
            lastHandshakeTs.current = Date.now();
            pendingReconnectRef.current = false;
        }
    }, [
        resolvedClient,
        markTransportConnected,
        reportTransportError,
        updateStatus,
    ]);

    useEffect(() => {
        isMountedRef.current = true;
        void handshake();
        return () => {
            isMountedRef.current = false;
        };
    }, [handshake]);

    const reconnect = useCallback(async () => {
        console.log("[tiny-torrent][rpc] reconnect requested");
        updateStatus(STATUS.connection.IDLE);
        setIsReady(false);

        try {
            const anyClient = resolvedClient as any;
            if (anyClient && typeof anyClient.closeSession === "function") {
                try {
                    await anyClient.closeSession();
                } catch (err) {
                    console.debug(
                        "[tiny-torrent][rpc] closeSession failed",
                        err
                    );
                }
            }

            if (anyClient && typeof anyClient.handshake === "function") {
                await anyClient.handshake();
                markTransportConnected();
                if (isMountedRef.current) setIsReady(true);
            } else {
                console.debug(
                    "[tiny-torrent][rpc] reconnect: adapter has no handshake()"
                );
            }
        } catch (err) {
            console.warn("[tiny-torrent][rpc] reconnect handshake failed", err);
            reportTransportError(err);
            if (isMountedRef.current) setIsReady(false);
        }
    }, [
        resolvedClient,
        updateStatus,
        markTransportConnected,
        reportTransportError,
    ]);

    return {
        rpcStatus,
        isReady,
        reconnect,
        markTransportConnected,
        reportCommandError,
        reportReadError,
    };
}
