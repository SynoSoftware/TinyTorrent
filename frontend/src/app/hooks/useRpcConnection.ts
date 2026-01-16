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
            // TODO: Standardize log prefixes to “Transmission RPC” (not “tiny-torrent”) once legacy RPC-extended paths are removed.
            console.error("[tiny-torrent][rpc] transport error", error);
            updateStatus(STATUS.connection.ERROR);
        },
        [updateStatus]
    );

    const markTransportConnected = useCallback(() => {
        updateStatus(STATUS.connection.CONNECTED);
    }, [updateStatus]);

    const reportCommandError = useCallback((error?: unknown) => {
        // TODO: Unify error reporting through a single logger/telemetry boundary (Session provider), so leaf hooks don’t each invent their own logging semantics.
        console.warn("[tiny-torrent][rpc] command error", error);
    }, []);

    const reportReadError = useCallback((error?: unknown) => {
        // TODO: Clarify terminology: this is not a “read error” vs “transport status” distinction users care about. Replace with a single app-level status model (connected/offline/degraded) owned by the Session provider.
        console.warn(
            "[tiny-torrent][rpc] read RPC error - transport status remains connected",
            error
        );
    }, []);

    // Probe to verify connectivity. Adapter/Transport handle Transmission RPC session handshakes.
    // TODO: Ensure this hook never triggers any TinyTorrent-only handshake (`tt-get-capabilities`, websocket setup, etc.). Those must be deleted from the adapter layer (see todo.md task 1).
    const connect = useCallback(async () => {
        updateStatus(STATUS.connection.IDLE);
        setIsReady(false);
        try {
            // Prefer a raw session-settings probe which allows errors to
            // surface (so the UI sees true connection failures). Fall back
            // to getSessionStats when fetchSessionSettings is not available.
            const anyClient = resolvedClient as any;
            if (
                anyClient &&
                typeof anyClient.fetchSessionSettings === "function"
            ) {
                await anyClient.fetchSessionSettings();
            } else {
                await resolvedClient.getSessionStats();
            }

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
