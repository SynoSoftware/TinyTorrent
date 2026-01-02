import { useEffect, useRef, useState } from "react";

import { CONFIG } from "@/config/logic";
import type { SessionStats } from "@/services/rpc/entities";
import { useUiClock } from "@/shared/hooks/useUiClock";

const HISTORY_POINTS = CONFIG.performance.history_data_points;

const createHistoryBuffer = () =>
    new Array(HISTORY_POINTS).fill(0);

export const useSessionSpeedHistory = (sessionStats: SessionStats | null) => {
    const { tick } = useUiClock();
    const statsRef = useRef<SessionStats | null>(sessionStats);
    const [history, setHistory] = useState(() => ({
        down: createHistoryBuffer(),
        up: createHistoryBuffer(),
    }));

    useEffect(() => {
        statsRef.current = sessionStats;
    }, [sessionStats]);

    useEffect(() => {
        setHistory((prev) => {
            const nextDown = prev.down.slice(1);
            const nextUp = prev.up.slice(1);
            const down = statsRef.current?.downloadSpeed ?? 0;
            const up = statsRef.current?.uploadSpeed ?? 0;
            nextDown.push(down);
            nextUp.push(up);
            return {
                down: nextDown,
                up: nextUp,
            };
        });
    }, [tick]);

    return history;
};
