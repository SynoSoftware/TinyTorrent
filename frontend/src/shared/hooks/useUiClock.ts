import { useEffect, useState } from "react";
import { DETAIL_REFRESH_INTERVAL_MS } from "@/config/logic";

type UiClockSubscriber = () => void;

class UiClock {
    private readonly subscribers = new Set<UiClockSubscriber>();
    private timerId?: number;
    private tick = 0;
    private lastTickAt = Date.now();
    private readonly intervalMs = DETAIL_REFRESH_INTERVAL_MS;

    public subscribe(subscriber: UiClockSubscriber) {
        this.subscribers.add(subscriber);
        if (this.subscribers.size === 1) {
            this.start();
        }
        return () => {
            this.subscribers.delete(subscriber);
            if (this.subscribers.size === 0) {
                this.stop();
            }
        };
    }

    public getTick() {
        return this.tick;
    }

    public getLastTickAt() {
        return this.lastTickAt;
    }

    private start() {
        if (this.timerId || typeof window === "undefined") {
            return;
        }
        this.timerId = window.setInterval(() => {
            this.tick += 1;
            this.lastTickAt = Date.now();
            for (const subscriber of this.subscribers) {
                try {
                    subscriber();
                } catch {
                    // Ignore subscriber failures to keep clock running.
                }
            }
        }, this.intervalMs);
    }

    private stop() {
        if (this.timerId && typeof window !== "undefined") {
            window.clearInterval(this.timerId);
        }
        this.timerId = undefined;
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
