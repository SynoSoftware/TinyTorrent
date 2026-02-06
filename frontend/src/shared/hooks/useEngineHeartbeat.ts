import { useEffect, useRef, useState } from "react";
import type { HeartbeatMode, HeartbeatPayload } from "@/services/rpc/heartbeat";
import { useEngineHeartbeatDomain } from "@/app/providers/engineDomains";

// Pure subscription hook to the engine heartbeat.
// This hook MUST NOT create its own timers — it only increments `tick`
// when the engine (via EngineAdapter) invokes the subscriber callback.
export const useEngineHeartbeat = (params?: {
    mode?: HeartbeatMode;
    detailId?: string | null;
    pollingIntervalMs?: number;
}) => {
    const heartbeatDomain = useEngineHeartbeatDomain();
    const [tick, setTick] = useState(0);
    const lastPayload = useRef<HeartbeatPayload | null>(null);

    useEffect(() => {
        const mode = params?.mode ?? "table";
        const handleUpdate = (payload: HeartbeatPayload) => {
            lastPayload.current = payload;
            setTick((t) => t + 1);
        };
        const handleError = () => {
            // Ignore — consumers may surface errors via other mechanisms.
        };

        if (mode === "table") {
            const subscription = heartbeatDomain.subscribeTable({
                pollingIntervalMs: params?.pollingIntervalMs,
                onUpdate: handleUpdate,
                onError: handleError,
            });
            return () => subscription.unsubscribe();
        }

        const subscription = heartbeatDomain.subscribeNonTable({
            mode,
            detailId: params?.detailId,
            pollingIntervalMs: params?.pollingIntervalMs,
            onUpdate: handleUpdate,
            onError: handleError,
        });
        return () => subscription.unsubscribe();
    }, [
        heartbeatDomain,
        params?.detailId,
        params?.mode,
        params?.pollingIntervalMs,
    ]);

    return { tick, lastPayload: lastPayload.current } as const;
};
