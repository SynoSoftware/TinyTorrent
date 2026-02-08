import { useCallback, useState, useEffect } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { SessionStats } from "@/services/rpc/entities";
import type { ReportReadErrorFn } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import { isRpcCommandError } from "@/services/rpc/errors";
import {
    useEngineHeartbeatDomain,
    useEngineSessionDomain,
} from "@/app/providers/engineDomains";

interface UseSessionStatsParams {
    torrentClient: EngineAdapter;
    reportReadError: ReportReadErrorFn;
    isMountedRef: MutableRefObject<boolean>;
    sessionReady: boolean;
}

export function useSessionStats({
    torrentClient,
    reportReadError,
    isMountedRef,
    sessionReady,
}: UseSessionStatsParams) {
    const heartbeatDomain = useEngineHeartbeatDomain(torrentClient);
    const sessionDomain = useEngineSessionDomain(torrentClient);
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
    const [liveTransportStatus, setLiveTransportStatus] =
        useState<HeartbeatSource>("polling");
    // TODO: With “RPC extensions: NONE”, HeartbeatSource must collapse to polling-only. Update this hook to:
    // TODO: - remove websocket-related source variants from the type
    // TODO: - avoid logging transport status transitions as an app concern
    // TODO: - rely on the planned Session+UiMode provider as the single source of truth for “connected vs offline” and refresh scheduling

    const refreshSessionStatsData = useCallback(async () => {
        try {
            const stats = await sessionDomain.getSessionStats();
            if (isMountedRef.current) {
                setSessionStats(stats);
            }
        } catch (error) {
            if (isMountedRef.current && !isRpcCommandError(error)) {
                reportReadError();
            }
        }
    }, [isMountedRef, reportReadError, sessionDomain]);

    useEffect(() => {
        if (!sessionReady) return;
        const subscription = heartbeatDomain.subscribeTable({
            onUpdate: ({ sessionStats: stats, source }) => {
                if (!isMountedRef.current || !stats) return;
                setSessionStats(stats);
                if (source) {
                    setLiveTransportStatus(source);
                }
            },
            onError: (_event) => {
                if (!isMountedRef.current) return;
                reportReadError();
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [heartbeatDomain, isMountedRef, reportReadError, sessionReady]);

    return {
        sessionStats,
        refreshSessionStatsData,
        liveTransportStatus,
    };
}
