import {
    createContext,
    createElement,
    useContext,
    type ReactNode,
} from "react";
import type { SpeedHistorySnapshot, SpeedHistoryStore } from "@/shared/hooks/speedHistoryStore";

export interface SpeedHistoryDomain {
    watch: (id: string) => () => void;
    subscribe: (listener: () => void) => () => void;
    get: (id: string) => SpeedHistorySnapshot;
}

const SpeedHistoryDomainContext = createContext<SpeedHistoryDomain | null>(null);

export function SpeedHistoryDomainProvider({
    store,
    children,
}: {
    store: SpeedHistoryStore;
    children: ReactNode;
}) {
    const value: SpeedHistoryDomain = {
        watch: (id) => store.watch(id),
        subscribe: (listener) => store.subscribe(listener),
        get: (id) => store.get(id),
    };

    return createElement(
        SpeedHistoryDomainContext.Provider,
        { value },
        children,
    );
}

export function useSpeedHistoryDomain(): SpeedHistoryDomain {
    const context = useContext(SpeedHistoryDomainContext);
    if (!context) {
        throw new Error(
            "useSpeedHistoryDomain must be used within SpeedHistoryDomainProvider",
        );
    }
    return context;
}
