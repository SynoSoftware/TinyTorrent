import { useEffect, useState } from "react";
import { registry } from "@/config/logic";
import { scheduler, type RecurringTaskHandle } from "@/app/services/scheduler";
const { timing } = registry;

type UiClockSubscriber = () => void;

class UiClock {
    private readonly subscribers = new Set<UiClockSubscriber>();
    private readonly intervalMs = timing.heartbeat.detailMs;
    private tick = 0;
    private lastTickAt = Date.now();
    private task?: RecurringTaskHandle;

    public subscribe(subscriber: UiClockSubscriber) {
        this.subscribers.add(subscriber);
        if (this.subscribers.size === 1) {
            this.task = scheduler.scheduleRecurringTask(
                () => this.notifySubscribers(),
                this.intervalMs
            );
        }
        return () => {
            this.subscribers.delete(subscriber);
            if (this.subscribers.size === 0) {
                this.task?.cancel();
                this.task = undefined;
            }
        };
    }

    public getTick() {
        return this.tick;
    }

    public getLastTickAt() {
        return this.lastTickAt;
    }

    private notifySubscribers() {
        this.tick += 1;
        this.lastTickAt = Date.now();
        for (const subscriber of this.subscribers) {
            try {
                subscriber();
            } catch {
                // Ignore subscriber failures to keep the clock running.
            }
        }
    }
}

const uiClock = new UiClock();

export const subscribeUiClock = (subscriber: UiClockSubscriber) =>
    uiClock.subscribe(subscriber);

export const useUiClock = () => {
    const [tick, setTick] = useState(() => uiClock.getTick());

    useEffect(() => {
        return subscribeUiClock(() => {
            setTick(uiClock.getTick());
        });
    }, []);

    return { tick, lastTickAt: uiClock.getLastTickAt() } as const;
};

