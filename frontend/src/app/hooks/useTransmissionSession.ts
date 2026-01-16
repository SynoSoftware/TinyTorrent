import { useCallback, useEffect, useRef, useState } from "react";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import type { EngineInfo } from "@/services/rpc/entities";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ReportCommandErrorFn,
    ReportReadErrorFn,
    ConnectionStatus,
} from "@/shared/types/rpc";
import { STATUS } from "@/shared/status";
import { useRpcConnection } from "./useRpcConnection";

type UseTransmissionSessionResult = {
    client: EngineAdapter;
    rpcStatus: ConnectionStatus;
    isReady: boolean;
    reconnect: () => void;
    sessionSettings: TransmissionSessionSettings | null;
    refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
    markTransportConnected: () => void;
    reportCommandError: ReportCommandErrorFn;
    reportReadError: ReportReadErrorFn;
    updateRequestTimeout: (timeout: number) => void;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
};

export function useTransmissionSession(
    client: EngineAdapter
): UseTransmissionSessionResult {
    const {
        rpcStatus,
        isReady,
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
        if (!client.fetchSessionSettings) {
            throw new Error(
                "Session settings not supported by the torrent client"
            );
        }
        const session = await client.fetchSessionSettings();
        if (isMountedRef.current) {
            setSessionSettings(session);
        }
        return session;
    }, [client]);

    const updateRequestTimeout = useCallback(
        (timeout: number) => {
            client.updateRequestTimeout?.(timeout);
        },
        [client]
    );

    useEffect(() => {
        let active = true;
        if (!client.detectEngine || rpcStatus !== STATUS.connection.CONNECTED) {
            if (active) {
                setEngineInfo(null);
                setIsDetectingEngine(false);
            }
            return;
        }
        // TODO: Treat `engineInfo` as debug/diagnostics only. UI mode (TinyTorrent vs Transmission UX) must be derived from `uiMode = "Full" | "Rpc"` (loopback + ShellExtensions availability), not from engine detection.
        setIsDetectingEngine(true);
        void client
            .detectEngine()
            .then((info) => {
                if (!active) return;
                setEngineInfo(info);
            })
            .catch(() => {
                if (!active) return;
                setEngineInfo(null);
            })
            .finally(() => {
                if (!active) return;
                setIsDetectingEngine(false);
            });
        return () => {
            active = false;
        };
    }, [client, rpcStatus]);
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
        engineInfo,
        isDetectingEngine,
    };
}
