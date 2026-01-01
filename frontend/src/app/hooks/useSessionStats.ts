import { useCallback, useState, useEffect } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { SessionStats } from "@/services/rpc/entities";
import type { RpcStatus } from "@/shared/types/rpc";
import type { HeartbeatSource } from "@/services/rpc/heartbeat";

interface UseSessionStatsParams {
    torrentClient: EngineAdapter;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
    sessionReady: boolean;
}

export function useSessionStats({
    torrentClient,
    reportRpcStatus,
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
        } catch {
            if (isMountedRef.current) {
                reportRpcStatus("error");
            }
        }
    }, [isMountedRef, reportRpcStatus, torrentClient]);

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
                reportRpcStatus("connected");
            },
            onError: () => {
                if (!isMountedRef.current) return;
                reportRpcStatus("error");
            },
        });
        return () => {
            subscription.unsubscribe();
        };
    }, [sessionReady, torrentClient, isMountedRef, reportRpcStatus]);

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
