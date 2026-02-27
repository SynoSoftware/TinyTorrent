import { useCallback, useEffect, useRef, useState } from "react";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import type { EngineInfo } from "@/services/rpc/entities";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ReportCommandErrorFn,
    ReportReadErrorFn,
    ConnectionStatus,
    RpcConnectionOutcome,
} from "@/shared/types/rpc";
import { status } from "@/shared/status";
import { useRpcConnection } from "@/app/hooks/useRpcConnection";
import { useEngineSessionDomain } from "@/app/providers/engineDomains";

type UseTransmissionSessionResult = {
    client: EngineAdapter;
    rpcStatus: ConnectionStatus;
    isReady: boolean;
    reconnect: () => Promise<RpcConnectionOutcome>;
    sessionSettings: TransmissionSessionSettings | null;
    refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
    updateRequestTimeout: (timeout: number) => void;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
    lastConnectionAttempt: RpcConnectionOutcome | null;
};

export function useTransmissionSession(
    client: EngineAdapter
): UseTransmissionSessionResult {
    const sessionDomain = useEngineSessionDomain(client);
    const {
        rpcStatus,
        isReady,
        lastConnectionAttempt,
        reconnect,
        markTransportConnected,
        reportCommandError,
        reportReadError,
    } = useRpcConnection(client);
    const [sessionSettings, setSessionSettings] =
        useState<TransmissionSessionSettings | null>(null);
    const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
    const [isDetectingEngine, setIsDetectingEngine] = useState(false);
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const refreshSessionSettings = useCallback(async () => {
        const session = await sessionDomain.fetchSessionSettings();
        if (isMountedRef.current) {
            setSessionSettings(session);
        }
        return session;
    }, [sessionDomain]);

    const updateRequestTimeout = useCallback(
        (timeout: number) => {
            sessionDomain.updateRequestTimeout(timeout);
        },
        [sessionDomain]
    );

    const runEngineDetection = useCallback(async () => {
        // TODO: Treat `engineInfo` as debug/diagnostics only. UI mode (TinyTorrent vs Transmission UX) must be derived from `uiMode = "Full" | "Rpc"` (loopback + ShellExtensions availability), not from engine detection.
        setIsDetectingEngine(true);
        try {
            const info = await sessionDomain.detectEngine();
            if (isMountedRef.current) {
                setEngineInfo(info);
            }
        } catch {
            if (isMountedRef.current) {
                setEngineInfo(null);
            }
        } finally {
            if (isMountedRef.current) {
                setIsDetectingEngine(false);
            }
        }
    }, [sessionDomain]);

    useEffect(() => {
        if (
            !sessionDomain.canDetectEngine ||
            rpcStatus !== status.connection.connected
        ) {
            return;
        }
        void runEngineDetection();
    }, [rpcStatus, runEngineDetection, sessionDomain.canDetectEngine]);

    useEffect(() => {
        if (rpcStatus !== status.connection.connected) {
            return;
        }
        void refreshSessionSettings().catch(() => {
            // Keep session platform optional for consumers; failures are
            // handled through existing connection/read error channels.
        });
    }, [refreshSessionSettings, rpcStatus]);
    // TODO: Pull session detection/rpcStatus/engineInfo into the planned Session provider so AppContent reads from one source of truth instead of hook chaining.

    return {
        client,
        rpcStatus,
        isReady,
        reconnect,
        sessionSettings,
        refreshSessionSettings,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        updateRequestTimeout,
        engineInfo:
            rpcStatus === status.connection.connected ? engineInfo : null,
        isDetectingEngine:
            rpcStatus === status.connection.connected ? isDetectingEngine : false,
        lastConnectionAttempt,
    };
}
