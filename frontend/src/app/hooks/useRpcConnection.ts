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
    // If a client isn't provided, fall back to the app-wide client from context.
    const defaultClient = useTorrentClient();
    const resolvedClient: EngineAdapter = client ?? defaultClient;
    const [rpcStatus, setRpcStatus] = useState<ConnectionStatus>(
        STATUS.connection.IDLE
    );
    const [isReady, setIsReady] = useState(false);
    const isMountedRef = useRef(false);
    const isHandshakingRef = useRef(false);
    const pendingReconnectRef = useRef(false);
    const latestHandshakeRef = useRef<() => Promise<void>>(() =>
        Promise.resolve()
    );
    const lastHandshakeTs = useRef(0);
    const HANDSHAKE_MIN_INTERVAL_MS = 800; // coalesce rapid handshake requests

    const updateStatus = useCallback((next: ConnectionStatus) => {
        //        console.log(`[tiny-torrent][rpc] status -> ${next}`);
        if (isMountedRef.current) {
            setRpcStatus(next);
        }
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
            console.log(
                "[tiny-torrent][rpc] handshake already running, queuing reconnect"
            );
            pendingReconnectRef.current = true;
            return;
        }

        // If we recently completed a handshake, coalesce additional requests
        // to avoid a burst of back-to-back handshakes (likely a race).
        if (now - lastHandshakeTs.current < HANDSHAKE_MIN_INTERVAL_MS) {
            console.debug(
                `[tiny-torrent][rpc] handshake suppressed; last handshake ${
                    now - lastHandshakeTs.current
                }ms ago`
            );
            // ensure a reconnect is scheduled once the current activity finishes
            pendingReconnectRef.current = true;
            return;
        }
        isHandshakingRef.current = true;
        pendingReconnectRef.current = false;
        console.log("[tiny-torrent][rpc] handshake start");
        setIsReady(false);
        updateStatus(STATUS.connection.IDLE);
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
            lastHandshakeTs.current = Date.now();
            if (pendingReconnectRef.current) {
                // consume the pending flag and run a single coalesced reconnect
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
