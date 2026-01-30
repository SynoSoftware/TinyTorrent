import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type {
    EngineAdapter,
    EngineCapabilities,
} from "@/services/rpc/engine-adapter";
import { DEFAULT_ENGINE_CAPABILITIES } from "@/services/rpc/engine-adapter";
import type { ConnectionStatus } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import type { SessionStats, EngineInfo } from "@/services/rpc/entities";
import { STATUS } from "@/shared/status";
import { deriveUiCapabilities } from "@/app/utils/uiMode";
import type { UiCapabilities } from "@/app/utils/uiMode";
import { normalizeHost } from "@/app/utils/hosts";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { useShellAgent } from "@/app/hooks/useShellAgent";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useSessionStats } from "@/app/hooks/useSessionStats";
import { useTransmissionSession } from "@/app/hooks/useTransmissionSession";
import type { TransmissionSessionSettings } from "@/services/rpc/types";
import { resetMissingFilesStore } from "@/services/recovery/missingFilesStore";

export interface SessionContextValue {
    torrentClient: EngineAdapter;
    rpcStatus: ConnectionStatus;
    reconnect: () => void;
    refreshSessionSettings: () => Promise<TransmissionSessionSettings>;
    markTransportConnected: () => void;
    reportCommandError: (error: unknown) => void;
    reportReadError: () => void;
    updateRequestTimeout: (timeout: number) => void;
    engineInfo: EngineInfo | null;
    isDetectingEngine: boolean;
    sessionStats: SessionStats | null;
    liveTransportStatus: HeartbeatSource;
    refreshSessionStatsData: () => Promise<void>;
    uiCapabilities: UiCapabilities;
    engineCapabilities: EngineCapabilities;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
    children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
    const torrentClient = useTorrentClient();
    const {
        rpcStatus,
        reconnect,
        refreshSessionSettings,
        markTransportConnected,
        reportCommandError,
        reportReadError,
        updateRequestTimeout,
        engineInfo,
        isDetectingEngine,
    } = useTransmissionSession(torrentClient);

    const isMountedRef = useRef(false);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const previousClientRef = useRef<EngineAdapter | null>(null);
    useEffect(() => {
        if (previousClientRef.current !== torrentClient) {
            resetMissingFilesStore();
            previousClientRef.current = torrentClient;
        }
    }, [torrentClient]);

    const { sessionStats, liveTransportStatus, refreshSessionStatsData } =
        useSessionStats({
            torrentClient,
            reportReadError,
            isMountedRef,
            sessionReady: rpcStatus === STATUS.connection.CONNECTED,
        });

    const { activeProfile } = useConnectionConfig();
    const { shellAgent } = useShellAgent();
    const normalizedHost = useMemo(
        () => normalizeHost(activeProfile.host || ""),
        [activeProfile.host],
    );
    const uiCapabilities = useMemo(
        () => deriveUiCapabilities(normalizedHost, shellAgent.isAvailable),
        [normalizedHost, shellAgent.isAvailable],
    );

    const engineCapabilities = useMemo(
        () => torrentClient.getCapabilities?.() ?? DEFAULT_ENGINE_CAPABILITIES,
        [torrentClient],
    );

    const sessionValue = useMemo(
        () => ({
            torrentClient,
            rpcStatus,
            reconnect,
            refreshSessionSettings,
            markTransportConnected,
            reportCommandError,
            reportReadError,
            updateRequestTimeout,
            engineInfo,
            isDetectingEngine,
            sessionStats,
            liveTransportStatus,
            refreshSessionStatsData,
            uiCapabilities,
            engineCapabilities,
        }),
        [
            torrentClient,
            rpcStatus,
            reconnect,
            refreshSessionSettings,
            markTransportConnected,
            reportCommandError,
            reportReadError,
            updateRequestTimeout,
            engineInfo,
            isDetectingEngine,
            sessionStats,
            liveTransportStatus,
            refreshSessionStatsData,
            uiCapabilities,
            engineCapabilities,
        ],
    );

    return (
        <SessionContext.Provider value={sessionValue}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error("useSession must be used within SessionProvider");
    }
    return context;
}
