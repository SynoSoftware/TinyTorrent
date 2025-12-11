import { useCallback, useState, useEffect } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import type { SessionStats } from "../../services/rpc/entities";
import type { RpcStatus } from "../../shared/types/rpc";

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
            onUpdate: ({ sessionStats: stats }) => {
                if (!isMountedRef.current || !stats) return;
                setSessionStats(stats);
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

    return {
        sessionStats,
        refreshSessionStatsData,
    };
}
