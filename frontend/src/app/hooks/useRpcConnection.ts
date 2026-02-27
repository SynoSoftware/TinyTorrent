import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { scheduler } from "@/app/services/scheduler";
import type {
    ReportCommandErrorFn,
    ReportReadErrorFn,
    ConnectionStatus,
    RpcConnectionAction,
    RpcConnectionOutcome,
} from "@/shared/types/rpc";
import { status } from "@/shared/status";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";
import { infraLogger } from "@/shared/utils/infraLogger";

type UseRpcConnectionResult = {
    rpcStatus: ConnectionStatus;
    isReady: boolean;
    lastConnectionAttempt: RpcConnectionOutcome | null;
    reconnect: () => Promise<RpcConnectionOutcome>;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
};

export function useRpcConnection(
    client?: EngineAdapter
): UseRpcConnectionResult {
    const sessionDomain = useEngineSessionDomain(client);

    const [rpcStatus, setRpcStatus] = useState<ConnectionStatus>(
        status.connection.idle
    );
    const [isReady, setIsReady] = useState(false);
    const [lastConnectionAttempt, setLastConnectionAttempt] =
        useState<RpcConnectionOutcome | null>(null);
    const isMountedRef = useRef(false);

    const updateStatus = useCallback((next: ConnectionStatus) => {
        if (isMountedRef.current) setRpcStatus(next);
    }, []);

    const reportTransportError = useCallback(
        (error?: unknown) => {
            // TODO: Standardize log prefixes to “Transmission RPC” (not “tiny-torrent”) once legacy RPC-extended paths are removed.
            infraLogger.error(
                {
                    scope: "rpc_connection",
                    event: "transport_error",
                    message: "RPC transport error reported",
                },
                error,
            );
            updateStatus(status.connection.error);
        },
        [updateStatus]
    );

    const markTransportConnected = useCallback(() => {
        updateStatus(status.connection.connected);
    }, [updateStatus]);

    const reportCommandError = useCallback((error?: unknown) => {
        // TODO: Unify error reporting through a single logger/telemetry boundary (Session provider), so leaf hooks don’t each invent their own logging semantics.
        infraLogger.warn(
            {
                scope: "rpc_connection",
                event: "command_error",
                message: "RPC command error reported",
            },
            error,
        );
    }, []);

    const reportReadError = useCallback((error?: unknown) => {
        // TODO: Clarify terminology: this is not a “read error” vs “transport status” distinction users care about. Replace with a single app-level status model (connected/offline/degraded) owned by the Session provider.
        infraLogger.warn(
            {
                scope: "rpc_connection",
                event: "read_error",
                message:
                    "RPC read operation failed while transport remains connected",
            },
            error,
        );
    }, []);

    const recordAttempt = useCallback(
        (outcome: RpcConnectionOutcome) => {
            if (isMountedRef.current) {
                setLastConnectionAttempt(outcome);
            }
            return outcome;
        },
        []
    );

    // Probe to verify connectivity. Adapter/Transport handle Transmission RPC session handshakes.
    // TODO: Ensure this hook never triggers any TinyTorrent-only handshake (`tt-get-capabilities`, websocket setup, etc.). Those must be deleted from the adapter layer (see todo.md task 1).
    const connect = useCallback(
        async (action: RpcConnectionAction): Promise<RpcConnectionOutcome> => {
        updateStatus(status.connection.idle);
        setIsReady(false);
        try {
            await sessionDomain.probeConnection();

            updateStatus(status.connection.connected);
            if (isMountedRef.current) setIsReady(true);
            return recordAttempt({
                status: "connected",
                action,
            });
        } catch (err) {
            infraLogger.error(
                {
                    scope: "rpc_connection",
                    event: "connect_failed",
                    message: "RPC connection probe failed",
                    details: { action },
                },
                err,
            );
            updateStatus(status.connection.error);
            if (isMountedRef.current) setIsReady(false);
            return recordAttempt({
                status: "failed",
                action,
                reason:
                    action === "reconnect"
                        ? "reconnect_failed"
                        : "probe_failed",
            });
        }
        },
        [sessionDomain, updateStatus, recordAttempt]
    );

    useEffect(() => {
        isMountedRef.current = true;
        // `connect` already updates status state on failure. Swallow here to
        // avoid unhandled promise rejections during initial mount probing.
        const cancelMountProbeTimer = scheduler.scheduleTimeout(() => {
            void connect("probe");
        }, 0);
        return () => {
            cancelMountProbeTimer();
            isMountedRef.current = false;
        };
    }, [connect]);

    const reconnect = useCallback(async () => {
        updateStatus(status.connection.idle);
        setIsReady(false);

        try {
            sessionDomain.resetConnection();

            return await connect("reconnect");
        } catch (err) {
            infraLogger.warn(
                {
                    scope: "rpc_connection",
                    event: "reconnect_failed",
                    message: "RPC reconnect request failed",
                },
                err,
            );
            reportTransportError(err);
            if (isMountedRef.current) setIsReady(false);
            return recordAttempt({
                status: "failed",
                action: "reconnect",
                reason: "reconnect_failed",
            });
        }
    }, [sessionDomain, connect, reportTransportError, updateStatus, recordAttempt]);

    return {
        rpcStatus,
        isReady,
        lastConnectionAttempt,
        reconnect,
        markTransportConnected,
        reportCommandError,
        reportReadError,
    };
}
