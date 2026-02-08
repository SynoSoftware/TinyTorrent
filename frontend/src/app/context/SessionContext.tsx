import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    type ReactNode,
} from "react";
import type {
    EngineAdapter,
    EngineCapabilities,
} from "@/services/rpc/engine-adapter";
import { DEFAULT_ENGINE_CAPABILITIES } from "@/services/rpc/engine-adapter";
import type { ConnectionStatus, RpcConnectionOutcome } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { SessionStats, EngineInfo } from "@/services/rpc/entities";
import { STATUS } from "@/shared/status";
import { deriveUiCapabilities } from "@/app/utils/uiMode";
import type { UiCapabilities } from "@/app/utils/uiMode";
import { normalizeHost } from "@/app/utils/hosts";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import Runtime from "@/app/runtime";
import { shellAgent } from "@/app/agents/shell-agent";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSessionStats } from "@/app/hooks/useSessionStats";
import { useTransmissionSession } from "@/app/hooks/useTransmissionSession";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import { useSessionSpeedHistoryFeed } from "@/shared/hooks/useSessionSpeedHistory";

export interface SessionContextValue {
    torrentClient: EngineAdapter;
    rpcStatus: ConnectionStatus;
    reconnect: () => Promise<RpcConnectionOutcome>;
    lastConnectionAttempt: RpcConnectionOutcome | null;
    refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
    markTransportConnected: () => void;
    reportCommandError: (error: unknown) => void;
    reportReadError: () => void;
    updateRequestTimeout: (timeout: number) => void;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
    uiCapabilities: UiCapabilities;
    engineCapabilities: EngineCapabilities;
}

export interface SessionTelemetryContextValue {
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    refreshSessionStatsData: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const SessionTelemetryContext = createContext<SessionTelemetryContextValue | null>(
    null,
);

interface SessionProviderProps {
    children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
    const torrentClient = useTorrentClient();
    const {
        rpcStatus,
        reconnect,
        lastConnectionAttempt,
        refreshSessionSettings,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        updateRequestTimeout,
        engineInfo,
        isDetectingEngine,
    } = useTransmissionSession(torrentClient);

    const { activeProfile } = useConnectionConfig();
    const normalizedHost = useMemo(
        () => normalizeHost(activeProfile.host || ""),
        [activeProfile.host],
    );
    const uiCapabilities = useMemo(
        () => deriveUiCapabilities(normalizedHost, Runtime.isNativeHost),
        [normalizedHost],
    );
    useEffect(() => {
        shellAgent.setUiMode(uiCapabilities.uiMode);
    }, [uiCapabilities.uiMode]);
    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const root = document.documentElement;
        if (uiCapabilities.shellAgentAvailable) {
            root.dataset.nativeHost = "true";
            return;
        }
        delete root.dataset.nativeHost;
    }, [uiCapabilities.shellAgentAvailable]);

    const engineCapabilities = useMemo(
        () => torrentClient.getCapabilities?.() ?? DEFAULT_ENGINE_CAPABILITIES,
        [torrentClient],
    );

    const sessionValue = useMemo(
        () => ({
            torrentClient,
            rpcStatus,
            reconnect,
            lastConnectionAttempt,
            refreshSessionSettings,
            markTransportConnected,
            reportCommandError,
            reportReadError,
            updateRequestTimeout,
            engineInfo,
            isDetectingEngine,
            uiCapabilities,
            engineCapabilities,
        }),
        [
            torrentClient,
            rpcStatus,
            reconnect,
            lastConnectionAttempt,
            refreshSessionSettings,
            markTransportConnected,
            reportCommandError,
            reportReadError,
            updateRequestTimeout,
            engineInfo,
            isDetectingEngine,
            uiCapabilities,
            engineCapabilities,
        ],
    );

    return (
        <SessionContext.Provider value={sessionValue}>
            <SessionTelemetryProvider>{children}</SessionTelemetryProvider>
        </SessionContext.Provider>
    );
}

function SessionTelemetryProvider({ children }: SessionProviderProps) {
    const { torrentClient, reportReadError, rpcStatus } = useSession();
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const { sessionStats, liveTransportStatus, refreshSessionStatsData } =
        useSessionStats({
            torrentClient,
            reportReadError,
            isMountedRef,
            sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        });
    useSessionSpeedHistoryFeed(sessionStats);

    const telemetryValue = useMemo(
        () => ({
            sessionStats,
            liveTransportStatus,
            refreshSessionStatsData,
        }),
        [sessionStats, liveTransportStatus, refreshSessionStatsData],
    );

    return (
        <SessionTelemetryContext.Provider value={telemetryValue}>
            {children}
        </SessionTelemetryContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error("useSession must be used within SessionProvider");
    }
    return context;
}

export function useSessionTelemetry() {
    const context = useContext(SessionTelemetryContext);
    if (!context) {
        throw new Error(
            "useSessionTelemetry must be used within SessionProvider",
        );
    }
    return context;
}

export function useUiModeCapabilities(): UiCapabilities {
    const { uiCapabilities } = useSession();
    return uiCapabilities;
}
