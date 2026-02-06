import { useEffect, useMemo, useState } from "react";
import type { SpeedHistorySnapshot } from "@/shared/hooks/speedHistoryStore";
import { useEngineSpeedHistoryDomain } from "@/app/providers/engineDomains";

export const useEngineSpeedHistory = (torrentId: string | null | undefined) => {
    const speedHistoryDomain = useEngineSpeedHistoryDomain();
    const empty = useMemo<SpeedHistorySnapshot>(() => ({ down: [], up: [] }), []);
    const [history, setHistory] = useState<SpeedHistorySnapshot>(empty);

    useEffect(() => {
        if (!torrentId) {
            setHistory(empty);
            return;
        }
        const id = String(torrentId);
        const unwatch = speedHistoryDomain.watch(id);
        const applySnapshot = () => {
            setHistory(speedHistoryDomain.get(id));
        };
        applySnapshot();
        const unsubscribe = speedHistoryDomain.subscribe(applySnapshot);
        return () => {
            unsubscribe();
            unwatch();
        };
    }, [empty, speedHistoryDomain, torrentId]);

    return history;
};
