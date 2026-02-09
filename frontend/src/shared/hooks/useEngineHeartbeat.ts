import { useEffect, useState } from "react";
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
    const [lastPayload, setLastPayload] =
        useState<HeartbeatPayload | null>(null);
    const mode = params?.mode ?? "table";
    const detailId = params?.detailId ?? null;
    const pollingIntervalMs = params?.pollingIntervalMs;
    const onError = params?.onError;

    useEffect(() => {
        const handleUpdate = (payload: HeartbeatPayload) => {
            setLastPayload(payload);
            setTick((t) => t + 1);
        };
        const handleError = (event: HeartbeatErrorEvent) => {
            // Intentionally explicit: callers may provide onError if they want to
            // surface heartbeat errors; this hook defaults to a local no-op.
            onError?.(event);
        };

        if (mode === "table") {
            const subscription = heartbeatDomain.subscribeTable({
                pollingIntervalMs,
                onUpdate: handleUpdate,
                onError: handleError,
            });
            return () => subscription.unsubscribe();
        }

        const subscription = heartbeatDomain.subscribeNonTable({
            mode,
            detailId,
            pollingIntervalMs,
            onUpdate: handleUpdate,
            onError: handleError,
        });
        return () => subscription.unsubscribe();
    }, [
        heartbeatDomain,
        detailId,
        mode,
        onError,
        pollingIntervalMs,
    ]);

    return { tick, lastPayload } as const;
};
