/**
 * Central scheduler authority for non-RPC UI timers.
 * RPC heartbeat polling is owned by `HeartbeatManager`.
 *
 * This service runs < 1 timer (default step 250ms) and keeps track of registered
 * recurring/timeout jobs. When no work remains the loop stops automatically.
 *
 * Current scheduled work:
 * 1. UiClock ticks (timing.heartbeat.detailMs) — constant cadence so dashboards can redraw.
 * 2. Missing-files recovery probes (configured cadence) — iterates only errored torrents, so cost scales with the size of the errored set.
 * 3. Volume-loss polling (same configured recovery cadence) — runs only when connected to a local TinyTorrent daemon (uiMode="Full") and checks each errored torrent sequentially.
 * 4. Recovery modal auto-retry (modal cadence) — only active while the modal is open and recovery is unresolved.
 */

type TimeoutEntry = {
    type: "timeout";
    dueAt: number;
    callback: () => void;
};

type RecurringEntry = {
    type: "recurring";
    intervalMs: number;
    lastRunAt: number;
    callback: () => void;
};

type TaskEntry = TimeoutEntry | RecurringEntry;

export interface RecurringTaskHandle {
    cancel: () => void;
    updateInterval: (intervalMs: number) => void;
}

const SCHEDULER_STEP_MS = 250;

export class Scheduler {
    private readonly tasks = new Map<symbol, TaskEntry>();
    private timerId?: number;
    private readonly timerHost: typeof window | typeof globalThis | null =
        typeof window !== "undefined"
            ? window
            : typeof globalThis !== "undefined"
            ? globalThis
            : null;

    public scheduleTimeout(callback: () => void, delayMs: number) {
        if (delayMs < 0) delayMs = 0;
        const dueAt = Date.now() + delayMs;
        const key = Symbol();
        this.tasks.set(key, { type: "timeout", dueAt, callback });
        this.ensureLoop();
        return () => {
            this.tasks.delete(key);
            this.stopIfIdle();
        };
    }

    public scheduleRecurringTask(
        callback: () => void,
        intervalMs: number
    ): RecurringTaskHandle {
        const safeInterval = Math.max(1, intervalMs);
        const key = Symbol();
        const entry: RecurringEntry = {
            type: "recurring",
            intervalMs: safeInterval,
            lastRunAt: Date.now(),
            callback,
        };
        this.tasks.set(key, entry);
        this.ensureLoop();
        return {
            cancel: () => {
                this.tasks.delete(key);
                this.stopIfIdle();
            },
            updateInterval: (nextIntervalMs: number) => {
                entry.intervalMs = Math.max(1, nextIntervalMs);
            },
        };
    }

    private ensureLoop() {
        if (this.timerId !== undefined || !this.timerHost) return;
        this.timerId = this.timerHost.setInterval(
            () => this.step(),
            SCHEDULER_STEP_MS
        );
    }

    private stopIfIdle() {
        if (this.tasks.size === 0) {
            this.stopLoop();
        }
    }

    private stopLoop() {
        if (this.timerId !== undefined && this.timerHost) {
            this.timerHost.clearInterval(this.timerId);
        }
        this.timerId = undefined;
    }

    private step() {
        if (this.tasks.size === 0) {
            this.stopLoop();
            return;
        }
        const now = Date.now();
        const dueTimeouts: symbol[] = [];
        const dueRecurring: Array<{ key: symbol; entry: RecurringEntry }> = [];

        for (const [key, task] of this.tasks) {
            if (task.type === "timeout") {
                if (now >= task.dueAt) {
                    dueTimeouts.push(key);
                }
            } else if (now - task.lastRunAt >= task.intervalMs) {
                dueRecurring.push({ key, entry: task });
            }
        }

        for (const key of dueTimeouts) {
            const task = this.tasks.get(key);
            if (!task || task.type !== "timeout") continue;
            this.tasks.delete(key);
            this.invoke(task.callback);
        }

        for (const { entry } of dueRecurring) {
            entry.lastRunAt = now;
            this.invoke(entry.callback);
        }

        this.stopIfIdle();
    }

    private invoke(callback: () => void) {
        try {
            callback();
        } catch {
            // Swallow errors to keep the scheduler running.
        }
    }
}

export const scheduler = new Scheduler();
