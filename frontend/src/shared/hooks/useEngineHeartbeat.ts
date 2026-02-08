import { useEffect, useRef, useState } from "react";
import type {
    HeartbeatErrorEvent,
    HeartbeatMode,
    HeartbeatPayload,
} from "@/services/rpc/heartbeat";
import { useEngineHeartbeatDomain } from "@/app/providers/engineDomains";

// Pure subscription hook to the engine heartbeat.
// This hook MUST NOT create its own timers — it only increments `tick`
// when the engine (via EngineAdapter) invokes the subscriber callback.
export const useEngineHeartbeat = (params?: {
    mode?: HeartbeatMode;
    detailId?: string | null;
    pollingIntervalMs?: number;
    onError?: (event: HeartbeatErrorEvent) => void;
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
        const handleError = (event: HeartbeatErrorEvent) => {
            // Intentionally explicit: callers may provide onError if they want to
            // surface heartbeat errors; this hook defaults to a local no-op.
            params?.onError?.(event);
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
        params?.onError,
        params?.pollingIntervalMs,
    ]);

    return { tick, lastPayload: lastPayload.current } as const;
};
