import { useEffect, useState } from "react";

import { CONFIG } from "@/config/logic";
import type { SessionStats } from "@/services/rpc/entities";
import { subscribeUiClock } from "@/shared/hooks/useUiClock";

const HISTORY_POINTS = CONFIG.performance.history_data_points;

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

const sessionSpeedHistoryStore = new SessionSpeedHistoryStore();

export const useSessionSpeedHistoryFeed = (sessionStats: SessionStats | null) => {
    useEffect(() => {
        sessionSpeedHistoryStore.setStats(sessionStats);
    }, [sessionStats]);

    useEffect(() => {
        return sessionSpeedHistoryStore.attachFeedOwner();
    }, []);
};

export const useSessionSpeedHistory = () => {
    const [history, setHistory] = useState(() =>
        sessionSpeedHistoryStore.getSnapshot()
    );

    useEffect(() => {
        return sessionSpeedHistoryStore.subscribe(() => {
            setHistory(sessionSpeedHistoryStore.getSnapshot());
        });
    }, []);

    return history;
};
