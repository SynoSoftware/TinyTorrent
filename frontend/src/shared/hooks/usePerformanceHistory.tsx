import {
    createContext,
    useContext,
    useState,
    useMemo,
    useCallback,
    type ReactNode,
} from "react";
import { CONFIG } from "@/config/logic";

type PerformanceHistoryContextValue = {
    downHistory: number[];
    upHistory: number[];
    pushSpeeds: (downloadSpeed: number, uploadSpeed: number) => void;
};

const PerformanceHistoryContext = createContext<
    PerformanceHistoryContextValue | undefined
>(undefined);

export function PerformanceHistoryProvider({
    children,
}: {
    children: ReactNode;
}) {
    const points = CONFIG.performance.history_data_points;
    const [downHistory, setDownHistory] = useState(() =>
        new Array(points).fill(0)
    );
    const [upHistory, setUpHistory] = useState(() => new Array(points).fill(0));

    const pushSpeeds = useCallback(
        (downloadSpeed: number, uploadSpeed: number) => {
            setDownHistory((prev) => [...prev.slice(1), downloadSpeed]);
            setUpHistory((prev) => [...prev.slice(1), uploadSpeed]);
        },
        []
    );

    const value = useMemo(
        () => ({ downHistory, upHistory, pushSpeeds }),
        [downHistory, upHistory, pushSpeeds]
    );

    return (
        <PerformanceHistoryContext.Provider value={value}>
            {children}
        </PerformanceHistoryContext.Provider>
    );
}

export function usePerformanceHistory() {
    const context = useContext(PerformanceHistoryContext);
    if (!context) {
        throw new Error(
            "usePerformanceHistory must be used within a PerformanceHistoryProvider"
        );
    }
    return context;
}
