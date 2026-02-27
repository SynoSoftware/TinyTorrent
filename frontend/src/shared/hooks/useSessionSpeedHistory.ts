import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode, } from "react";

import { registry } from "@/config/logic";
import type { SessionStats } from "@/services/rpc/entities";
import { subscribeUiClock } from "@/shared/hooks/useUiClock";
const { performance } = registry;

const HISTORY_POINTS = performance.historyDataPoints;

const createHistoryBuffer = () =>
    new Array(HISTORY_POINTS).fill(0);

type SessionHistorySnapshot = {
    down: number[];
    up: number[];
};

class SessionSpeedHistoryStore {
    private subscribers = new Set<() => void>();
    private stats: SessionStats | null = null;
    private history: SessionHistorySnapshot = {
        down: createHistoryBuffer(),
        up: createHistoryBuffer(),
    };
    private feedOwners = 0;
    private unsubscribeClock?: () => void;

    public setStats(next: SessionStats | null) {
        this.stats = next;
    }

    public getSnapshot() {
        return this.history;
    }

    public subscribe(listener: () => void) {
        this.subscribers.add(listener);
        return () => {
            this.subscribers.delete(listener);
        };
    }

    public attachFeedOwner() {
        this.feedOwners += 1;
        this.ensureClock();
        return () => {
            this.feedOwners = Math.max(0, this.feedOwners - 1);
            if (this.feedOwners === 0) {
                this.unsubscribeClock?.();
                this.unsubscribeClock = undefined;
            }
        };
    }

    private emit() {
        this.subscribers.forEach((listener) => {
            try {
                listener();
            } catch {
                // Keep telemetry stream resilient to consumer errors.
            }
        });
    }

    private advance() {
        const nextDown = this.history.down.slice(1);
        const nextUp = this.history.up.slice(1);
        const down = this.stats?.downloadSpeed ?? 0;
        const up = this.stats?.uploadSpeed ?? 0;
        nextDown.push(down);
        nextUp.push(up);
        this.history = { down: nextDown, up: nextUp };
        this.emit();
    }

    private ensureClock() {
        if (this.unsubscribeClock) return;
        this.unsubscribeClock = subscribeUiClock(() => {
            this.advance();
        });
    }
}

export const createSessionSpeedHistoryStore = () =>
    new SessionSpeedHistoryStore();

const SessionSpeedHistoryContext =
    createContext<SessionSpeedHistoryStore | null>(null);

export function SessionSpeedHistoryProvider({
    store,
    children,
}: {
    store: SessionSpeedHistoryStore;
    children: ReactNode;
}) {
    const value = useMemo(() => store, [store]);
    return createElement(
        SessionSpeedHistoryContext.Provider,
        { value },
        children,
    );
}

const useSessionSpeedHistoryStore = () => {
    const context = useContext(SessionSpeedHistoryContext);
    if (!context) {
        throw new Error(
            "useSessionSpeedHistoryStore must be used within SessionSpeedHistoryProvider",
        );
    }
    return context;
};

export const useSessionSpeedHistoryFeed = (sessionStats: SessionStats | null) => {
    const sessionSpeedHistoryStore = useSessionSpeedHistoryStore();
    useEffect(() => {
        sessionSpeedHistoryStore.setStats(sessionStats);
    }, [sessionSpeedHistoryStore, sessionStats]);

    useEffect(
        () => sessionSpeedHistoryStore.attachFeedOwner(),
        [sessionSpeedHistoryStore],
    );
};

export const useSessionSpeedHistory = () => {
    const sessionSpeedHistoryStore = useSessionSpeedHistoryStore();
    const [history, setHistory] = useState(() =>
        sessionSpeedHistoryStore.getSnapshot()
    );

    useEffect(() => {
        return sessionSpeedHistoryStore.subscribe(() => {
            setHistory(sessionSpeedHistoryStore.getSnapshot());
        });
    }, [sessionSpeedHistoryStore]);

    return history;
};

