import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { subscribeUiClock } from "@/shared/hooks/useUiClock";

export type SpeedHistorySnapshot = {
    down: number[];
    up: number[];
};

const EMPTY_SPEED_HISTORY: SpeedHistorySnapshot = {
    down: [],
    up: [],
};

const areArraysEqual = (a: number[], b: number[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
    }
    return true;
};

const areSnapshotsEqual = (
    current: SpeedHistorySnapshot,
    next: SpeedHistorySnapshot,
) => areArraysEqual(current.down, next.down) && areArraysEqual(current.up, next.up);

export class SpeedHistoryStore {
    private readonly client: EngineAdapter;
    private readonly watchCounts = new Map<string, number>();
    private readonly snapshots = new Map<string, SpeedHistorySnapshot>();
    private readonly listeners = new Set<() => void>();
    private unsubscribeClock?: () => void;
    private refreshToken = 0;

    constructor(client: EngineAdapter) {
        this.client = client;
    }

    public subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public watch(id: string) {
        if (!id) return () => {};
        this.watchCounts.set(id, (this.watchCounts.get(id) ?? 0) + 1);
        this.ensureClock();
        return () => {
            const current = this.watchCounts.get(id);
            if (!current) return;
            if (current <= 1) {
                this.watchCounts.delete(id);
                this.snapshots.delete(id);
            } else {
                this.watchCounts.set(id, current - 1);
            }
            this.stopClockIfIdle();
        };
    }

    public get(id: string): SpeedHistorySnapshot {
        return this.snapshots.get(id) ?? EMPTY_SPEED_HISTORY;
    }

    private ensureClock() {
        if (this.unsubscribeClock || this.watchCounts.size === 0) return;
        const tick = () => {
            void this.refresh();
        };
        this.unsubscribeClock = subscribeUiClock(tick);
        tick();
    }

    private stopClockIfIdle() {
        if (this.watchCounts.size > 0) return;
        if (this.unsubscribeClock) {
            this.unsubscribeClock();
            this.unsubscribeClock = undefined;
        }
        this.refreshToken += 1;
    }

    private emit() {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch {
                // Keep shared telemetry fan-out resilient to subscriber errors.
            }
        }
    }

    private async refresh() {
        const fetchSpeedHistory = this.client.getSpeedHistory;
        if (typeof fetchSpeedHistory !== "function") return;

        const watchedIds = Array.from(this.watchCounts.keys());
        if (!watchedIds.length) return;

        const token = this.refreshToken + 1;
        this.refreshToken = token;

        const results = await Promise.all(
            watchedIds.map(async (id) => {
                try {
                    const data = await fetchSpeedHistory.call(this.client, id);
                    if (!data || !Array.isArray(data.down) || !Array.isArray(data.up)) {
                        return { id, snapshot: EMPTY_SPEED_HISTORY };
                    }
                    return { id, snapshot: data as SpeedHistorySnapshot };
                } catch {
                    return { id, snapshot: EMPTY_SPEED_HISTORY };
                }
            }),
        );

        if (this.refreshToken !== token) return;

        let changed = false;
        for (const { id, snapshot } of results) {
            const previous = this.snapshots.get(id);
            if (!previous || !areSnapshotsEqual(previous, snapshot)) {
                this.snapshots.set(id, snapshot);
                changed = true;
            }
        }

        for (const id of Array.from(this.snapshots.keys())) {
            if (!this.watchCounts.has(id)) {
                this.snapshots.delete(id);
                changed = true;
            }
        }

        if (changed) {
            this.emit();
        }
    }
}

export const createSpeedHistoryStore = (client: EngineAdapter) =>
    new SpeedHistoryStore(client);
