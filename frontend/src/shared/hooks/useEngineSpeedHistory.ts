import { useEffect, useMemo, useState } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";
import { useUiClock } from "@/shared/hooks/useUiClock";

// UI-clock driven: samples engine history on a stable cadence.
export const useEngineSpeedHistory = (torrentId: string | null | undefined) => {
    const client = useTorrentClient();
    const { tick } = useUiClock();
    // Removed unused 'size' and 'any' type usages
    const empty = useMemo(() => ({ down: [], up: [] }), []);
    const [history, setHistory] = useState<{ down: number[]; up: number[] }>(
        empty
    );

    useEffect(() => {
        if (!torrentId) {
            setHistory({ down: [], up: [] });
            return;
        }
        // On every engine heartbeat, get the latest snapshot (sync, no polling)
        try {
            const data = client.getSpeedHistory?.(torrentId);
            if (data && typeof (data as any)?.then === "function") {
                // Defensive: if adapter returns a Promise, resolve it
                (data as Promise<{ down: number[]; up: number[] }>)
                    .then((result) => {
                        if (
                            result &&
                            Array.isArray(result.down) &&
                            Array.isArray(result.up)
                        ) {
                            setHistory({ down: result.down, up: result.up });
                        } else {
                            setHistory({ down: [], up: [] });
                        }
                    })
                    .catch(() => setHistory({ down: [], up: [] }));
            } else if (
                data &&
                typeof data === "object" &&
                !(typeof (data as any)?.then === "function")
            ) {
                const maybe = data as { down?: unknown; up?: unknown };
                if (Array.isArray(maybe.down) && Array.isArray(maybe.up)) {
                    setHistory({
                        down: maybe.down,
                        up: maybe.up,
                    });
                } else {
                    setHistory({ down: [], up: [] });
                }
            } else {
                setHistory({ down: [], up: [] });
            }
        } catch {
            setHistory({ down: [], up: [] });
        }
    }, [client, torrentId, tick]);

    return history;
};
