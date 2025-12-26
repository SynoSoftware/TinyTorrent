import { useEffect, useMemo, useState } from "react";
import { useTorrentClient } from "@/app/providers/TorrentClientProvider";

export const useEngineSpeedHistory = (
    torrentId: string | null | undefined,
    tick?: number
) => {
    const client = useTorrentClient();
    const size = Number.isFinite((client as any).historySize)
        ? (client as any).historySize
        : undefined;
    const empty = useMemo(() => ({ down: [], up: [] }), []);
    const [history, setHistory] = useState<{ down: number[]; up: number[] }>(
        empty
    );

    useEffect(() => {
        if (!torrentId) {
            setHistory({ down: [], up: [] });
            return;
        }
        let mounted = true;
        const fetch = async () => {
            try {
                const data = await client.getSpeedHistory?.(torrentId);
                if (!mounted) return;
                if (
                    data &&
                    Array.isArray(data.down) &&
                    Array.isArray(data.up)
                ) {
                    setHistory({ down: data.down, up: data.up });
                    return;
                }
            } catch {
                // ignore
            }
            if (mounted) setHistory({ down: [], up: [] });
        };
        void fetch();
        return () => {
            mounted = false;
        };
    }, [client, torrentId, tick]);

    return history;
};
