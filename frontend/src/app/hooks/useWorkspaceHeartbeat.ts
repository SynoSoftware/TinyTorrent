import { useCallback, useEffect, useRef } from "react";

interface UseWorkspaceHeartbeatParams {
    sessionReady: boolean;
    pollingIntervalMs: number;
    refreshTorrents: () => Promise<void>;
    refreshSessionStatsData: () => Promise<void>;
    refreshDetailData: () => Promise<void>;
    detailId?: string;
}

export function useWorkspaceHeartbeat({
    sessionReady,
    pollingIntervalMs,
    refreshTorrents,
    refreshSessionStatsData,
    refreshDetailData,
    detailId,
}: UseWorkspaceHeartbeatParams) {
    const detailIdRef = useRef<string | undefined>(detailId);

    useEffect(() => {
        detailIdRef.current = detailId;
    }, [detailId]);

    const runHeartbeat = useCallback(async () => {
        if (!sessionReady) return;
        try {
            const tasks = [refreshTorrents(), refreshSessionStatsData()];
            if (detailIdRef.current) {
                tasks.push(refreshDetailData());
            }
            await Promise.all(tasks);
        } catch {
            // errors handled upstream
        }
    }, [
        sessionReady,
        refreshTorrents,
        refreshSessionStatsData,
        refreshDetailData,
    ]);

    useEffect(() => {
        if (!sessionReady) return;
        void runHeartbeat();
        const intervalMs = Math.max(1000, pollingIntervalMs);
        const intervalId = window.setInterval(() => {
            void runHeartbeat();
        }, intervalMs);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [pollingIntervalMs, runHeartbeat, sessionReady, detailId]);

    const runHealthCheck = useCallback(async () => {
        try {
            await refreshTorrents();
        } catch {
            // swallow failures to keep retrying
        }
    }, [refreshTorrents]);

    useEffect(() => {
        if (sessionReady) return;
        void runHealthCheck();
        const intervalMs = Math.max(1000, pollingIntervalMs);
        const intervalId = window.setInterval(() => {
            void runHealthCheck();
        }, intervalMs);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [sessionReady, pollingIntervalMs, runHealthCheck]);

    return {
        runHeartbeat,
    };
}
