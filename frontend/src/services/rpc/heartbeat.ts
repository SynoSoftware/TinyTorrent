import { HEARTBEAT_INTERVALS } from "@/config/logic";
import { CONFIG } from "@/config/logic";
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
    timestampMs: number;
    detailId?: string | null;
    detail?: TorrentDetailEntity | null;
    // Optional array of torrent ids that changed since previous heartbeat
    changedIds?: string[];
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
    lastSeenHash?: string;
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
    private lastTorrentHash: string = "";
    private lastTorrents?: TorrentEntity[];
    private lastSessionStats?: SessionStats;
    private lastSource?: HeartbeatSource;
    private lastPayloadTimestampMs?: number;
    private readonly detailCache = new Map<string, TorrentDetailEntity>();
    // Per-torrent speed history: true O(1) circular buffer (no shift/push, no leaks)
    private readonly speedHistory = new Map<
        string,
        { down: number[]; up: number[]; ptr: number }
    >();
    private client: HeartbeatClient;

    private readonly historySize: number =
        (CONFIG as any).performance?.history_data_points ?? 60;

    private computeHash(torrents: TorrentEntity[]) {
        // Stringify is the absolute authority on data changes.
        // This removes the "Cleverness Trap" of manual property picking.
        return JSON.stringify(torrents);
    }

    private computeChangedIds(
        current: TorrentEntity[],
        previous?: TorrentEntity[]
    ) {
        if (!previous || previous.length === 0) return current.map((t) => t.id);
        const prevMap = new Map<string, TorrentEntity>();
        for (const p of previous) prevMap.set(p.id, p);
        const changed: string[] = [];
        const seen = new Set<string>();
        for (const c of current) {
            seen.add(c.id);
            const prev = prevMap.get(c.id);
            if (!prev) {
                changed.push(c.id);
                continue;
            }
            if (
                prev.state !== c.state ||
                prev.progress !== c.progress ||
                prev.speed?.down !== c.speed?.down ||
                prev.speed?.up !== c.speed?.up
            ) {
                changed.push(c.id);
            }
        }
        // include removed ids
        for (const p of previous) {
            if (!seen.has(p.id)) changed.push(p.id);
        }
        return changed;
    }

    constructor(client: HeartbeatClient) {
        this.client = client;
    }

    public getSpeedHistory(id: string) {
        const size = this.historySize;
        const entry = this.speedHistory.get(id);
        if (!entry) {
            return {
                down: new Array(size).fill(0),
                up: new Array(size).fill(0),
            };
        }
        // Return snapshot in correct order (oldest to newest)
        const { down, up, ptr } = entry;
        // If buffer not yet filled, show only valid samples (for new torrents)
        if (down.length < size || up.length < size) {
            return {
                down: down.slice(0, ptr),
                up: up.slice(0, ptr),
            };
        }
        // Standard: rotate so oldest is first
        return {
            down: down.slice(ptr).concat(down.slice(0, ptr)),
            up: up.slice(ptr).concat(up.slice(0, ptr)),
        };
    }

    public subscribe(params: HeartbeatSubscriberParams): HeartbeatSubscription {
        const id = Symbol("heartbeat-subscription");
        this.subscribers.set(id, { id, params });
        // Emit cached data immediately if available and mark subscriber's last seen hash
        this.emitCachedData(params);
        // If we have cached torrents, set the subscriber's lastSeenHash so that
        // they will still receive the next tick only if data changed.
        const entry = this.subscribers.get(id);
        if (entry && this.lastTorrents) {
            entry.lastSeenHash = this.computeHash(this.lastTorrents);
        }
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
            timestampMs: this.lastPayloadTimestampMs ?? Date.now(),
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
        const timestampMs = payload.timestampMs ?? Date.now();
        payload.timestampMs = timestampMs;
        this.lastSource = payload.source ?? "websocket";
        const prev = this.lastTorrents;
        this.lastTorrents = payload.torrents;
        this.updateEngineState(payload.torrents);
        payload.changedIds = this.computeChangedIds(payload.torrents, prev);
        this.lastSessionStats = payload.sessionStats;
        this.lastPayloadTimestampMs = timestampMs;
        this.broadcastToSubscribers(payload);
    }

    private broadcastToSubscribers(payload: HeartbeatPayload) {
        const timestampMs =
            payload.timestampMs ?? this.lastPayloadTimestampMs ?? Date.now();
        for (const { params } of this.subscribers.values()) {
            const detailId = params.detailId;
            const combined: HeartbeatPayload = {
                ...payload,
                timestampMs,
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
            timestampMs: this.lastPayloadTimestampMs ?? Date.now(),
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
            // Update internal speed history buffers before broadcasting.
            this.updateEngineState(torrents);
            // Produce a compact, cheap hash for the torrent list.
            const currentHash = this.computeHash(torrents);
            const prevTorrents = this.lastTorrents;
            this.lastTorrents = torrents;
            this.lastSessionStats = sessionStats;
            const timestampMs = Date.now();
            this.lastPayloadTimestampMs = timestampMs;

            // compute changed ids between prev and current snapshot
            const changedIds = this.computeChangedIds(torrents, prevTorrents);

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

            // Build previous summary map for change detection
            const prevMap = new Map<string, TorrentEntity>();
            if (prevTorrents) {
                for (const t of prevTorrents) prevMap.set(t.id, t);
            }

            for (const detailId of detailIds) {
                // Always fetch details for active subscribers (diagnostics are volatile)
                try {
                    const detail = await this.client.getTorrentDetails(
                        detailId
                    );
                    detailResults.set(detailId, { data: detail });
                    this.detailCache.set(detailId, detail);
                } catch (error) {
                    detailResults.set(detailId, { error });
                }
            }

            // Broadcast to each subscriber only when their personal lastSeenHash
            // differs from the current hash, or when their requested detail changed.
            for (const subEntry of snapshot) {
                const { params } = subEntry;
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
                    timestampMs,
                    detailId,
                    detail: detailPayload,
                    changedIds,
                    source: "polling",
                };
                this.lastSource = "polling";
                try {
                    const stored = this.subscribers.get(subEntry.id);
                    const lastSeen = stored?.lastSeenHash;
                    // Always notify table-mode subscribers on each tick so
                    // visualizations (network graphs, sparklines) receive the
                    // heartbeat even when data values are zero.
                    const shouldNotify =
                        lastSeen !== currentHash ||
                        Boolean(detailEntry?.data) ||
                        params.mode === "table";
                    if (shouldNotify) {
                        params.onUpdate(payload);
                        if (stored) stored.lastSeenHash = currentHash;
                    }
                } catch {
                    // swallow subscriber errors to keep heartbeat alive
                }
                if (detailEntry?.error) {
                    params.onError?.(detailEntry.error);
                }
            }
            this.lastTorrentHash = currentHash;
        } catch (error) {
            this.notifyError(snapshot, error);
        } finally {
            this.isRunning = false;
            if (this.subscribers.size > 0) {
                this.rescheduleLoop();
            }
        }
    }
    // Deduplicated, O(1) ring buffer update for speed history and pruning
    private updateEngineState(torrents: TorrentEntity[]) {
        const size = this.historySize;
        const currentIds = new Set(torrents.map((t) => t.id));
        // Prune history for removed torrents (guaranteed leak-free)
        for (const key of this.speedHistory.keys()) {
            if (!currentIds.has(key)) this.speedHistory.delete(key);
        }
        // O(1) circular buffer update for each torrent
        for (const t of torrents) {
            const id = t.id;
            const down = typeof t.speed?.down === "number" ? t.speed.down : 0;
            const up = typeof t.speed?.up === "number" ? t.speed.up : 0;
            let entry = this.speedHistory.get(id);
            if (!entry) {
                entry = {
                    down: new Array(size).fill(0),
                    up: new Array(size).fill(0),
                    ptr: 0,
                };
                this.speedHistory.set(id, entry);
            }
            entry.down[entry.ptr] = down;
            entry.up[entry.ptr] = up;
            entry.ptr = (entry.ptr + 1) % size;
        }
    }

    private notifyError(snapshot: HeartbeatSubscriber[], error: unknown) {
        snapshot.forEach(({ params }) => {
            params.onError?.(error);
        });
    }
}
