import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { scheduler } from "@/app/services/scheduler";
import { registry } from "@/config/logic";
import type {
    RpcConnectionTimeoutDialogController,
    RpcConnectionRetryStatus,
    RpcConnectionStatusView,
    ReportCommandErrorFn,
    ReportReadErrorFn,
    ConnectionStatus,
    RpcConnectionAction,
    RpcConnectionOutcome,
    RpcReconnectOptions,
} from "@/shared/types/rpc";
import { status } from "@/shared/status";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";
import { infraLogger } from "@/shared/utils/infraLogger";
const { timing } = registry;

class RpcConnectionTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Transmission RPC connection timed out after ${timeoutMs}ms`);
        this.name = "RpcConnectionTimeoutError";
    }
}

type ConnectionAttemptOptions = {
    preserveStatus?: boolean;
    resetConnectionBeforeAttempt?: boolean;
    suppressTimeoutDialog?: boolean;
    disableRetry?: boolean;
};

type PrimedProbeRequest = {
    action: RpcConnectionAction;
    options: RpcReconnectOptions;
};

type UseRpcConnectionResult = {
    rpcStatus: ConnectionStatus;
    connectionStatusView: RpcConnectionStatusView;
    isReady: boolean;
    reconnect: (options?: RpcReconnectOptions) => Promise<RpcConnectionOutcome>;
    primeNextProbe: (
        action: RpcConnectionAction,
        options?: RpcReconnectOptions,
    ) => void;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
    connectionTimeoutDialog: RpcConnectionTimeoutDialogController;
};

export function useRpcConnection(
    client?: EngineAdapter
): UseRpcConnectionResult {
    const sessionDomain = useEngineSessionDomain(client);

    const [rpcStatus, setRpcStatus] = useState<ConnectionStatus>(
        status.connection.idle
    );
    const [isReady, setIsReady] = useState(false);
    const [showConnectionTimeoutDialog, setShowConnectionTimeoutDialog] =
        useState(false);
    const [connectionTimeoutDialogAction, setConnectionTimeoutDialogAction] =
        useState<RpcConnectionAction | null>(null);
    const [activeConnectionAction, setActiveConnectionAction] =
        useState<RpcConnectionAction | null>(null);
    const [connectionTimeoutDialogSuppressed, setConnectionTimeoutDialogSuppressed] =
        useState(false);
    const [retryStatus, setRetryStatus] =
        useState<RpcConnectionRetryStatus | null>(null);
    const isMountedRef = useRef(false);
    const connectPromiseRef = useRef<Promise<RpcConnectionOutcome> | null>(null);
    const retryDelayMsRef = useRef(timing.wsReconnect.initialDelayMs);
    const connectionTimeoutDialogSuppressedRef = useRef(false);
    const showConnectionTimeoutDialogRef = useRef(false);
    const nextProbeRequestRef = useRef<PrimedProbeRequest | null>(null);

    const updateStatus = useCallback((next: ConnectionStatus) => {
        if (isMountedRef.current) setRpcStatus(next);
    }, []);

    const markTransportConnected = useCallback(() => {
        updateStatus(status.connection.connected);
    }, [updateStatus]);

    useEffect(() => {
        connectionTimeoutDialogSuppressedRef.current =
            connectionTimeoutDialogSuppressed;
    }, [connectionTimeoutDialogSuppressed]);

    useEffect(() => {
        showConnectionTimeoutDialogRef.current = showConnectionTimeoutDialog;
    }, [showConnectionTimeoutDialog]);

    const resetRetryBackoff = useCallback(() => {
        retryDelayMsRef.current = timing.wsReconnect.initialDelayMs;
    }, []);

    const scheduleNextRetry = useCallback(() => {
        const retryDelayMs = retryDelayMsRef.current;
        retryDelayMsRef.current = Math.min(
            retryDelayMs * 2,
            timing.wsReconnect.maxDelayMs,
        );
        setRetryStatus({
            kind: "scheduled",
            retryAtMs: Date.now() + retryDelayMs,
        });
    }, []);

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

    const runProbeWithTimeout = useCallback(async () => {
        let cancelTimeout = () => {};
        try {
            await Promise.race([
                sessionDomain.probeConnection(),
                new Promise<never>((_, reject) => {
                    cancelTimeout = scheduler.scheduleTimeout(() => {
                        try {
                            sessionDomain.resetConnection();
                        } catch {
                            // Ignore reset failures while timing out a probe.
                        }
                        reject(
                            new RpcConnectionTimeoutError(
                                timing.connection.timeoutMs,
                            ),
                        );
                    }, timing.connection.timeoutMs);
                }),
            ]);
        } finally {
            cancelTimeout();
        }
    }, [sessionDomain]);

    // Probe to verify connectivity. Adapter/Transport handle Transmission RPC session handshakes.
    // TODO: Ensure this hook never triggers any TinyTorrent-only handshake (`tt-get-capabilities`, websocket setup, etc.). Those must be deleted from the adapter layer (see todo.md task 1).
    const connect = useCallback(
        async (
            action: RpcConnectionAction,
            options?: ConnectionAttemptOptions,
        ): Promise<RpcConnectionOutcome> => {
            if (connectPromiseRef.current) {
                return connectPromiseRef.current;
            }

            const promise = (async () => {
                if (!options?.preserveStatus) {
                    updateStatus(status.connection.idle);
                    if (isMountedRef.current) {
                        setActiveConnectionAction(action);
                        setIsReady(false);
                        setRetryStatus(null);
                        setConnectionTimeoutDialogSuppressed(false);
                    }
                    resetRetryBackoff();
                } else if (isMountedRef.current) {
                    setActiveConnectionAction(action);
                }
                if (options?.resetConnectionBeforeAttempt) {
                    try {
                        sessionDomain.resetConnection();
                    } catch {
                        // Ignore reset failures; the probe will still surface
                        // the connection state.
                    }
                }
                try {
                    await runProbeWithTimeout();
                    updateStatus(status.connection.connected);
                    if (isMountedRef.current) {
                        setActiveConnectionAction(null);
                        setIsReady(true);
                        setRetryStatus(null);
                        setShowConnectionTimeoutDialog(false);
                        setConnectionTimeoutDialogAction(null);
                        setConnectionTimeoutDialogSuppressed(false);
                    }
                    resetRetryBackoff();
                    return {
                        status: "connected",
                        action,
                    } satisfies RpcConnectionOutcome;
                } catch (err) {
                    const isTimeout = err instanceof RpcConnectionTimeoutError;
                    infraLogger.error(
                        {
                            scope: "rpc_connection",
                            event: isTimeout
                                ? "connect_timed_out"
                                : "connect_failed",
                            message: isTimeout
                                ? "RPC connection probe timed out"
                                : "RPC connection probe failed",
                            details: {
                                action,
                                timeoutMs: timing.connection.timeoutMs,
                            },
                        },
                        err,
                    );
                    updateStatus(status.connection.error);
                    if (isMountedRef.current) {
                        setActiveConnectionAction(null);
                        setIsReady(false);
                        if (isTimeout && !options?.disableRetry) {
                            scheduleNextRetry();
                        } else {
                            setRetryStatus(null);
                            resetRetryBackoff();
                        }
                        if (
                            isTimeout &&
                            !options?.suppressTimeoutDialog &&
                            !connectionTimeoutDialogSuppressedRef.current &&
                            !showConnectionTimeoutDialogRef.current
                        ) {
                            setConnectionTimeoutDialogAction(action);
                            setShowConnectionTimeoutDialog(true);
                        }
                    }
                    return {
                        status: "failed",
                        action,
                        reason:
                            action === "reconnect"
                                ? "reconnect_failed"
                                : "probe_failed",
                    } satisfies RpcConnectionOutcome;
                }
            })();

            connectPromiseRef.current = promise;
            try {
                return await promise;
            } finally {
                connectPromiseRef.current = null;
            }
        },
        [
            resetRetryBackoff,
            runProbeWithTimeout,
            scheduleNextRetry,
            sessionDomain,
            updateStatus,
        ],
    );

    const connectionStatusView = useCallback((): RpcConnectionStatusView => {
        const isConnecting =
            activeConnectionAction !== null ||
            retryStatus?.kind === "connecting" ||
            rpcStatus === status.connection.idle;
        if (isConnecting) {
            return {
                state: "connecting",
                activeAction: activeConnectionAction,
                retryStatus,
            };
        }
        if (rpcStatus === status.connection.connected) {
            return {
                state: "connected",
                activeAction: activeConnectionAction,
                retryStatus,
            };
        }
        return {
            state: "offline",
            activeAction: activeConnectionAction,
            retryStatus,
        };
    }, [activeConnectionAction, retryStatus, rpcStatus]);

    useEffect(() => {
        isMountedRef.current = true;
        // `connect` already updates status state on failure. Swallow here to
        // avoid unhandled promise rejections during initial mount probing.
        const cancelMountProbeTimer = scheduler.scheduleTimeout(() => {
            const nextProbeRequest = nextProbeRequestRef.current;
            nextProbeRequestRef.current = null;
            const nextAction = nextProbeRequest?.action ?? "probe";
            void connect(nextAction, {
                resetConnectionBeforeAttempt: nextAction === "reconnect",
                suppressTimeoutDialog:
                    nextProbeRequest?.options?.suppressTimeoutDialog,
                disableRetry: nextProbeRequest?.options?.disableRetry,
            });
        }, 0);
        return () => {
            cancelMountProbeTimer();
            isMountedRef.current = false;
        };
    }, [connect]);

    useEffect(() => {
        if (
            retryStatus?.kind !== "scheduled" ||
            rpcStatus === status.connection.connected
        ) {
            return;
        }
        const retryDelayMs = Math.max(0, retryStatus.retryAtMs - Date.now());
        return scheduler.scheduleTimeout(() => {
            if (isMountedRef.current) {
                setRetryStatus({ kind: "connecting" });
            }
            void connect("reconnect", {
                preserveStatus: true,
                resetConnectionBeforeAttempt: true,
            });
        }, retryDelayMs);
    }, [connect, retryStatus, rpcStatus]);

    const reconnect = useCallback(
        (options?: RpcReconnectOptions) =>
            connect("reconnect", {
                resetConnectionBeforeAttempt: true,
                suppressTimeoutDialog: options?.suppressTimeoutDialog,
                disableRetry: options?.disableRetry,
            }),
        [connect],
    );

    const primeNextProbe = useCallback(
        (action: RpcConnectionAction, options?: RpcReconnectOptions) => {
            nextProbeRequestRef.current = {
                action,
                options: options ?? {},
            };
        },
        [],
    );

    const dismissConnectionTimeoutDialog = useCallback(() => {
        if (!isMountedRef.current) {
            return;
        }
        setConnectionTimeoutDialogSuppressed(true);
        setShowConnectionTimeoutDialog(false);
    }, []);

    return {
        rpcStatus,
        connectionStatusView: connectionStatusView(),
        isReady,
        reconnect,
        primeNextProbe,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        connectionTimeoutDialog: {
            isOpen: showConnectionTimeoutDialog,
            action: connectionTimeoutDialogAction,
            retryStatus,
            dismiss: dismissConnectionTimeoutDialog,
        },
    };
}
