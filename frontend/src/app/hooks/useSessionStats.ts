import { useCallback, useState } from "react";
import type { MutableRefObject } from "react";

import type { EngineAdapter } from "../../services/rpc/engine-adapter";
import type { SessionStats } from "../../services/rpc/entities";
import type { RpcStatus } from "../../shared/types/rpc";

interface UseSessionStatsParams {
    torrentClient: EngineAdapter;
    reportRpcStatus: (status: RpcStatus) => void;
    isMountedRef: MutableRefObject<boolean>;
}

export function useSessionStats({
    torrentClient,
    reportRpcStatus,
    isMountedRef,
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

    return {
        sessionStats,
        refreshSessionStatsData,
    };
}
