import { useCallback, useEffect } from "react";

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
  const runHeartbeat = useCallback(async () => {
    if (!sessionReady) return;
    try {
      const tasks = [refreshTorrents(), refreshSessionStatsData()];
      if (detailId) {
        tasks.push(refreshDetailData());
      }
      await Promise.all(tasks);
    } catch {
      // errors handled upstream
    }
  }, [sessionReady, refreshTorrents, refreshSessionStatsData, refreshDetailData, detailId]);

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
  }, [pollingIntervalMs, runHeartbeat, sessionReady]);

  return {
    runHeartbeat,
  };
}
