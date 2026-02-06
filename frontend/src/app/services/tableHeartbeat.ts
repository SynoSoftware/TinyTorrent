import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { HeartbeatPayload } from "@/services/rpc/heartbeat";

type HeartbeatListener = (payload: HeartbeatPayload) => void;
type HeartbeatErrorListener = () => void;

interface TableHeartbeatSubscriber {
    pollingIntervalMs: number;
    onUpdate: HeartbeatListener;
    onError: HeartbeatErrorListener;
}

interface TableHeartbeatRecord {
    pollingIntervalMs: number;
    subscribers: Set<TableHeartbeatSubscriber>;
    subscription: ReturnType<EngineAdapter["subscribeToHeartbeat"]> | null;
}

const tableHeartbeatMap = new WeakMap<EngineAdapter, TableHeartbeatRecord>();
const DEFAULT_INTERVAL = 1000;

const normalizeInterval = (pollingIntervalMs?: number) =>
    pollingIntervalMs !== undefined
        ? Math.max(DEFAULT_INTERVAL, pollingIntervalMs)
        : DEFAULT_INTERVAL;

const getTargetInterval = (record: TableHeartbeatRecord) => {
    let interval: number | null = null;
    record.subscribers.forEach((subscriber) => {
        if (
            interval === null ||
            subscriber.pollingIntervalMs < interval
        ) {
            interval = subscriber.pollingIntervalMs;
        }
    });
    return interval ?? DEFAULT_INTERVAL;
};

const ensureSubscription = (
    client: EngineAdapter,
    record: TableHeartbeatRecord,
) => {
    const nextInterval = getTargetInterval(record);
    if (
        record.subscription &&
        record.pollingIntervalMs === nextInterval
    ) {
        return;
    }

    record.subscription?.unsubscribe();
    record.pollingIntervalMs = nextInterval;
    record.subscription = client.subscribeToHeartbeat({
        mode: "table",
        pollingIntervalMs: record.pollingIntervalMs,
        onUpdate: (payload) => {
            record.subscribers.forEach((subscriber) =>
                subscriber.onUpdate(payload),
            );
        },
        onError: () => {
            record.subscribers.forEach((subscriber) => subscriber.onError());
        },
    });
};

export function subscribeToTableHeartbeat(params: {
    client: EngineAdapter;
    pollingIntervalMs?: number;
    onUpdate: HeartbeatListener;
    onError: HeartbeatErrorListener;
}) {
    const { client, pollingIntervalMs, onUpdate, onError } = params;
    const desiredInterval = normalizeInterval(pollingIntervalMs);
    let record = tableHeartbeatMap.get(client);

    if (!record) {
        record = {
            pollingIntervalMs: desiredInterval,
            subscribers: new Set(),
            subscription: null,
        };
        tableHeartbeatMap.set(client, record);
    }

    const subscriber: TableHeartbeatSubscriber = {
        pollingIntervalMs: desiredInterval,
        onUpdate,
        onError,
    };
    record.subscribers.add(subscriber);
    ensureSubscription(client, record);

    return {
        unsubscribe: () => {
            const current = tableHeartbeatMap.get(client);
            if (!current) return;
            current.subscribers.delete(subscriber);
            if (current.subscribers.size === 0) {
                current.subscription?.unsubscribe();
                tableHeartbeatMap.delete(client);
                return;
            }
            ensureSubscription(client, current);
        },
    };
}
