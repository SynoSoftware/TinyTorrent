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
    reconnect: () => Promise<void>;
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

    // Probe to verify connectivity. Adapter/Transport handle session handshakes.
    const connect = useCallback(async () => {
        updateStatus(STATUS.connection.IDLE);
        setIsReady(false);
        try {
            await resolvedClient.getSessionStats();
            updateStatus(STATUS.connection.CONNECTED);
            if (isMountedRef.current) setIsReady(true);
        } catch (err) {
            console.error("[tiny-torrent][rpc] connection failed", err);
            updateStatus(STATUS.connection.ERROR);
            if (isMountedRef.current) setIsReady(false);
            throw err;
        }
    }, [resolvedClient, updateStatus]);

    useEffect(() => {
        isMountedRef.current = true;
        void connect();
        return () => {
            isMountedRef.current = false;
        };
    }, [connect]);

    const reconnect = useCallback(async () => {
        console.log("[tiny-torrent][rpc] reconnect requested");
        updateStatus(STATUS.connection.IDLE);
        setIsReady(false);

        try {
            const anyClient = resolvedClient as any;
            if (anyClient && typeof anyClient.resetConnection === "function") {
                try {
                    anyClient.resetConnection();
                } catch (err) {
                    console.debug(
                        "[tiny-torrent][rpc] resetConnection failed",
                        err
                    );
                }
            }

            await connect();
        } catch (err) {
            console.warn("[tiny-torrent][rpc] reconnect failed", err);
            reportTransportError(err);
            if (isMountedRef.current) setIsReady(false);
        }
    }, [resolvedClient, connect, reportTransportError]);

    return {
        rpcStatus,
        isReady,
        reconnect,
        markTransportConnected,
        reportCommandError,
        reportReadError,
    };
}
