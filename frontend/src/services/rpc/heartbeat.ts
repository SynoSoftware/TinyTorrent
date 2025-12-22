import { HEARTBEAT_INTERVALS } from "../../config/logic";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "./entities";

export type HeartbeatMode = "background" | "table" | "detail";

export type HeartbeatSource = "polling" | "websocket";

export interface HeartbeatPayload {
    torrents: TorrentEntity[];
    sessionStats: SessionStats;
    detailId?: string | null;
    detail?: TorrentDetailEntity | null;
    source?: HeartbeatSource;
}

export interface HeartbeatSubscriberParams {
    mode: HeartbeatMode;
    detailId?: string | null;
    pollingIntervalMs?: number;
    onUpdate: (payload: HeartbeatPayload) => void;
    onError?: (error: unknown) => void;
}

export interface HeartbeatSubscription {
    unsubscribe(): void;
}

type HeartbeatClient = {
    getTorrents(): Promise<TorrentEntity[]>;
    getSessionStats(): Promise<SessionStats>;
    getTorrentDetails(id: string): Promise<TorrentDetailEntity>;
};

type HeartbeatSubscriber = {
    id: symbol;
    params: HeartbeatSubscriberParams;
};

const MODE_INTERVALS: Record<HeartbeatMode, number> = {
    background: HEARTBEAT_INTERVALS.background,
    table: HEARTBEAT_INTERVALS.table,
    detail: HEARTBEAT_INTERVALS.detail,
};

export class HeartbeatManager {
    private readonly subscribers = new Map<symbol, HeartbeatSubscriber>();
    private timerId?: number;
    private isRunning = false;
    private pollingEnabled = true;
    private lastTorrents?: TorrentEntity[];
    private lastSessionStats?: SessionStats;
    private lastSource?: HeartbeatSource;
    private readonly detailCache = new Map<string, TorrentDetailEntity>();
    private client: HeartbeatClient;

    constructor(client: HeartbeatClient) {
        this.client = client;
    }

    public subscribe(params: HeartbeatSubscriberParams): HeartbeatSubscription {
        const id = Symbol("heartbeat-subscription");
        this.subscribers.set(id, { id, params });
        this.emitCachedData(params);
        this.rescheduleLoop();
        if (!this.hasInitialData()) {
            void this.triggerImmediateTick();
        }
        return {
            unsubscribe: () => this.unsubscribe(id),
        };
    }

    private unsubscribe(id: symbol) {
        this.subscribers.delete(id);
        if (this.subscribers.size === 0) {
            this.clearTimer();
            return;
        }
        this.rescheduleLoop();
    }

    private hasInitialData() {
        return Boolean(this.lastTorrents && this.lastSessionStats);
    }

    private emitCachedData(params: HeartbeatSubscriberParams) {
        if (!this.lastTorrents || !this.lastSessionStats) return;
        const detailId = params.detailId;
        const payload: HeartbeatPayload = {
            torrents: this.lastTorrents,
            sessionStats: this.lastSessionStats,
            detailId,
            detail:
                detailId == null
                    ? undefined
                    : this.detailCache.get(detailId) ?? null,
            source: this.lastSource,
        };
        params.onUpdate(payload);
    }

    public pushLivePayload(payload: HeartbeatPayload) {
        this.lastSource = payload.source ?? "websocket";
        this.lastTorrents = payload.torrents;
        this.lastSessionStats = payload.sessionStats;
        this.broadcastToSubscribers(payload);
    }

    private broadcastToSubscribers(payload: HeartbeatPayload) {
        for (const { params } of this.subscribers.values()) {
            const detailId = params.detailId;
            const combined: HeartbeatPayload = {
                ...payload,
                detailId,
                detail:
                    detailId == null
                        ? undefined
                        : this.detailCache.get(detailId) ?? null,
                source: payload.source ?? this.lastSource,
            };
            try {
                params.onUpdate(combined);
            } catch {
                // swallow subscriber errors
            }
        }
    }

    private setTransportSource(source: HeartbeatSource) {
        if (this.lastSource === source) return;
        this.lastSource = source;
        if (!this.lastTorrents || !this.lastSessionStats) return;
        this.broadcastToSubscribers({
            torrents: this.lastTorrents,
            sessionStats: this.lastSessionStats,
            source,
        });
    }

    public disablePolling() {
        if (!this.pollingEnabled) return;
        this.pollingEnabled = false;
        this.clearTimer();
        this.setTransportSource("websocket");
    }

    public enablePolling() {
        if (this.pollingEnabled) return;
        this.pollingEnabled = true;
        this.setTransportSource("polling");
        if (this.subscribers.size > 0) {
            this.rescheduleLoop();
        }
    }

    private triggerImmediateTick() {
        if (this.isRunning) return;
        void this.tick();
    }

    private rescheduleLoop() {
        if (this.timerId) {
            window.clearTimeout(this.timerId);
            this.timerId = undefined;
        }
        if (
            this.subscribers.size === 0 ||
            this.isRunning ||
            !this.pollingEnabled
        ) {
            return;
        }
        const interval = this.getCurrentInterval();
        this.timerId = window.setTimeout(() => {
            void this.tick();
        }, interval);
    }

    private clearTimer() {
        if (this.timerId) {
            window.clearTimeout(this.timerId);
            this.timerId = undefined;
        }
    }

    private getCurrentInterval() {
        let interval = Infinity;
        for (const { params } of this.subscribers.values()) {
            const candidate = this.getIntervalForParams(params);
            if (candidate < interval) {
                interval = candidate;
            }
        }
        return Number.isFinite(interval) ? interval : MODE_INTERVALS.table;
    }

    private getIntervalForParams(params: HeartbeatSubscriberParams) {
        if (params.mode === "table" && params.pollingIntervalMs !== undefined) {
            return Math.max(1000, params.pollingIntervalMs);
        }
        return MODE_INTERVALS[params.mode];
    }

    private async tick() {
        if (!this.pollingEnabled || this.subscribers.size === 0) return;
        this.isRunning = true;
        this.clearTimer();
        const snapshot = Array.from(this.subscribers.values());
        try {
            const [torrents, sessionStats] = await Promise.all([
                this.client.getTorrents(),
                this.client.getSessionStats(),
            ]);
            this.lastTorrents = torrents;
            this.lastSessionStats = sessionStats;
            const detailIds = Array.from(
                new Set(
                    snapshot
                        .map((entry) => entry.params.detailId)
                        .filter((id): id is string => Boolean(id))
                )
            );
            const detailResults = new Map<
                string,
                { data?: TorrentDetailEntity; error?: unknown }
            >();
            for (const detailId of detailIds) {
                try {
                    const detail = await this.client.getTorrentDetails(detailId);
                    detailResults.set(detailId, { data: detail });
                    this.detailCache.set(detailId, detail);
                } catch (error) {
                    detailResults.set(detailId, { error });
                }
            }
            for (const { params } of snapshot) {
                const detailId = params.detailId;
                const detailEntry =
                    detailId == null ? undefined : detailResults.get(detailId);
                const detailPayload =
                    detailId == null
                        ? undefined
                        : detailEntry?.data ??
                          this.detailCache.get(detailId) ??
                          null;
                const payload: HeartbeatPayload = {
                    torrents,
                    sessionStats,
                    detailId,
                    detail: detailPayload,
                    source: "polling",
                };
                this.lastSource = "polling";
                try {
                    params.onUpdate(payload);
                } catch {
                    // swallow subscriber errors to keep heartbeat alive
                }
                if (detailEntry?.error) {
                    params.onError?.(detailEntry.error);
                }
            }
        } catch (error) {
            this.notifyError(snapshot, error);
        } finally {
            this.isRunning = false;
            if (this.subscribers.size > 0) {
                this.rescheduleLoop();
            }
        }
    }

    private notifyError(snapshot: HeartbeatSubscriber[], error: unknown) {
        snapshot.forEach(({ params }) => {
            params.onError?.(error);
        });
    }
}
