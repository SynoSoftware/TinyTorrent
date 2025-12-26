import { useEffect, useRef, useState } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import type { HeartbeatMode, HeartbeatPayload } from "@/services/rpc/heartbeat";

// Pure subscription hook to the engine heartbeat.
// This hook MUST NOT create its own timers — it only increments `tick`
// when the engine (via EngineAdapter) invokes the subscriber callback.
export const useEngineHeartbeat = (params?: {
    mode?: HeartbeatMode;
    detailId?: string | null;
    pollingIntervalMs?: number;
}) => {
    const client = useTorrentClient();
    const [tick, setTick] = useState(0);
    const lastPayload = useRef<HeartbeatPayload | null>(null);

    useEffect(() => {
        const subscription = client.subscribeToHeartbeat({
            mode: params?.mode ?? "table",
            detailId: params?.detailId,
            pollingIntervalMs: params?.pollingIntervalMs,
            onUpdate: (payload) => {
                lastPayload.current = payload;
                setTick((t) => t + 1);
            },
            onError: () => {
                // Ignore — consumers may surface errors via other mechanisms.
            },
        });
        return () => subscription.unsubscribe();
        // Intentionally omit client referential stability assumptions here;
        // client object identity is stable while inside ClientProvider lifecycle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params?.mode, params?.detailId, params?.pollingIntervalMs]);

    return { tick, lastPayload: lastPayload.current } as const;
};
