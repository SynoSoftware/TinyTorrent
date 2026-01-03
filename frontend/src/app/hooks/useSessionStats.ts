import { useCallback, useState, useEffect } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { SessionStats } from "@/services/rpc/entities";
import type { ReportReadErrorFn } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";
import { isRpcCommandError } from "@/services/rpc/errors";

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
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
    const [liveTransportStatus, setLiveTransportStatus] =
        useState<HeartbeatSource>("polling");

    const refreshSessionStatsData = useCallback(async () => {
        try {
            const stats = await torrentClient.getSessionStats();
            if (isMountedRef.current) {
                setSessionStats(stats);
            }
        } catch (error) {
            if (isMountedRef.current && !isRpcCommandError(error)) {
                reportReadError();
            }
        }
    }, [isMountedRef, reportReadError, torrentClient]);

    useEffect(() => {
        if (!sessionReady) return;
        const subscription = torrentClient.subscribeToHeartbeat({
            mode: "table",
            onUpdate: ({ sessionStats: stats, source }) => {
                if (!isMountedRef.current || !stats) return;
                setSessionStats(stats);
                if (source) {
                    setLiveTransportStatus(source);
                }
            },
            onError: () => {
                if (!isMountedRef.current) return;
                reportReadError();
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [sessionReady, torrentClient, isMountedRef, reportReadError]);

    useEffect(() => {
        console.log(
            `[tiny-torrent][heartbeat] liveTransportStatus -> ${liveTransportStatus}`
        );
    }, [liveTransportStatus]);

    return {
        sessionStats,
        refreshSessionStatsData,
        liveTransportStatus,
    };
}
