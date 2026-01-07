import { HEARTBEAT_INTERVALS } from "@/config/logic";
import { CONFIG } from "@/config/logic";
import type {
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
    NetworkTelemetry,
} from "./entities";
import { processHeartbeat } from "./recoveryAutomation";
import { enforceStateTransition } from "./normalizers";

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

// Extend HeartbeatClient with optional network telemetry fetch support.
type HeartbeatClientWithTelemetry = HeartbeatClient & {
    fetchNetworkTelemetry?(): Promise<NetworkTelemetry | null>;
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

const DETAIL_FETCH_CONCURRENCY = 3;

type DetailFetchResult = {
    detailId: string;
    detail?: TorrentDetailEntity;
    error?: unknown;
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
    private readonly detailCache = new Map<
        string,
        { hash: string; detail: TorrentDetailEntity }
    >();
    // Per-torrent speed history: true O(1) circular buffer (no shift/push, no leaks)
    private readonly speedHistory = new Map<
        string,
        { down: number[]; up: number[]; ptr: number }
    >();
    private client: HeartbeatClientWithTelemetry;

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
                prev.speed?.up !== c.speed?.up ||
                prev.leftUntilDone !== c.leftUntilDone ||
                prev.sizeWhenDone !== c.sizeWhenDone
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
        this.client = client as HeartbeatClientWithTelemetry;
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

    private fetchDetailResponses(
        detailIds: string[]
    ): Promise<DetailFetchResult[]> {
        if (detailIds.length === 0) {
            return Promise.resolve([]);
        }
        const queue = detailIds.slice();
        const results: DetailFetchResult[] = [];
        const worker = async () => {
            while (true) {
                const detailId = queue.shift();
                if (!detailId) {
                    return;
                }
                try {
                    const detail = await this.client.getTorrentDetails(
                        detailId
                    );
                    results.push({ detailId, detail });
                } catch (error) {
                    results.push({ detailId, error });
                }
            }
        };
        const concurrency = Math.min(
            detailIds.length,
            DETAIL_FETCH_CONCURRENCY
        );
        const workers = new Array(concurrency).fill(null).map(() => worker());
        return Promise.all(workers).then(() => results);
    }

    private hasDetailSubscribers() {
        for (const { params } of this.subscribers.values()) {
            if (params.detailId != null) {
                return true;
            }
        }
        return false;
    }

    private getCachedDetail(detailId: string): TorrentDetailEntity | null {
        const entry = this.detailCache.get(detailId);
        if (!entry) {
            return null;
        }
        const currentTorrent = this.lastTorrents?.find(
            (torrent) => torrent.id === detailId
        );
        if (!currentTorrent || currentTorrent.hash !== entry.hash) {
            this.detailCache.delete(detailId);
            return null;
        }
        return entry.detail;
    }

    private pruneDetailCache(torrents: TorrentEntity[]) {
        const existingHashes = new Map<string, string>();
        for (const torrent of torrents) {
            existingHashes.set(torrent.id, torrent.hash);
        }
        for (const [id, entry] of this.detailCache.entries()) {
            const hash = existingHashes.get(id);
            if (!hash || hash !== entry.hash) {
                this.detailCache.delete(id);
            }
        }
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
        const basePayload: any = {
            torrents: this.lastTorrents,
            sessionStats: this.lastSessionStats,
            timestampMs: this.lastPayloadTimestampMs ?? Date.now(),
            detailId,
            detail:
                detailId == null ? undefined : this.getCachedDetail(detailId),
            source: this.lastSource,
        };
        // If we previously stored telemetry on sessionStats, expose it as a
        // top-level `networkTelemetry` field for subscribers that consume it.
        const maybeTelemetry = this.lastSessionStats?.networkTelemetry;
        if (maybeTelemetry) basePayload.networkTelemetry = maybeTelemetry;
        const payload: HeartbeatPayload = basePayload;
        params.onUpdate(payload);
    }

    public pushLivePayload(payload: HeartbeatPayload) {
        const timestampMs = payload.timestampMs ?? Date.now();
        payload.timestampMs = timestampMs;
        this.lastSource = payload.source ?? "websocket";
        const prev = this.lastTorrents;
        this.lastTorrents = payload.torrents;
        this.pruneDetailCache(payload.torrents);
        this.updateEngineState(payload.torrents, prev);
        payload.changedIds = this.computeChangedIds(payload.torrents, prev);
        this.lastSessionStats = payload.sessionStats;
        this.lastPayloadTimestampMs = timestampMs;
        // If incoming payload carries networkTelemetry, preserve it so
        // subscribers that rely on telemetry can receive it during cached
        // emissions.
        if ((payload as any).networkTelemetry) {
            if (this.lastSessionStats) {
                this.lastSessionStats.networkTelemetry = (
                    payload as any
                ).networkTelemetry;
            }
        }
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
                        : this.getCachedDetail(detailId),
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
        const payload: any = {
            torrents: this.lastTorrents,
            sessionStats: this.lastSessionStats,
            timestampMs: this.lastPayloadTimestampMs ?? Date.now(),
            source,
        };
        const telemetry = this.lastSessionStats?.networkTelemetry;
        if (telemetry) payload.networkTelemetry = telemetry;
        this.broadcastToSubscribers(payload);
    }

    public disablePolling() {
        if (!this.pollingEnabled) return;
        this.pollingEnabled = false;
        this.clearTimer();
        this.setTransportSource("websocket");
        console.log(
            `[tiny-torrent][heartbeat] disablePolling (subscribers=${this.subscribers.size})`
        );
        this.rescheduleLoop();
    }

    public enablePolling() {
        if (this.pollingEnabled) return;
        this.pollingEnabled = true;
        this.setTransportSource("polling");
        console.log(
            `[tiny-torrent][heartbeat] enablePolling (subscribers=${this.subscribers.size})`
        );
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
        const shouldRun =
            this.subscribers.size > 0 &&
            (this.pollingEnabled || this.hasDetailSubscribers());
        if (!shouldRun || this.isRunning) {
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
        if (this.subscribers.size === 0) return;
        const snapshot = Array.from(this.subscribers.values());
        const detailIds = Array.from(
            new Set(
                snapshot
                    .map((entry) => entry.params.detailId)
                    .filter((id): id is string => Boolean(id))
            )
        );
        const hasDetailSubscribers = detailIds.length > 0;
        const shouldFetchSummary =
            this.pollingEnabled || !this.hasInitialData();
        if (!shouldFetchSummary && !hasDetailSubscribers) {
            return;
        }

        this.isRunning = true;
        this.clearTimer();
        try {
            let torrents = this.lastTorrents;
            let sessionStats = this.lastSessionStats;
            let currentHash = this.lastTorrentHash;
            let changedIds: string[] = [];

            if (shouldFetchSummary || !torrents || !sessionStats) {
                const [fetchedTorrents, fetchedSessionStats] =
                    await Promise.all([
                        this.client.getTorrents(),
                        this.client.getSessionStats(),
                    ]);
                // Attempt to fetch optional network telemetry from the adapter.
                // This is conservative: if the adapter doesn't support it or
                // the call fails, we silently proceed without telemetry.
                let fetchedTelemetry: NetworkTelemetry | undefined = undefined;
                try {
                    const telemetryClient = this
                        .client as HeartbeatClientWithTelemetry;
                    if (
                        typeof telemetryClient.fetchNetworkTelemetry ===
                        "function"
                    ) {
                        const nt =
                            await telemetryClient.fetchNetworkTelemetry();
                        if (nt) fetchedTelemetry = nt;
                    }
                } catch (err) {
                    // ignore telemetry failures
                }
                const prevTorrents = this.lastTorrents;
                torrents = fetchedTorrents;
                sessionStats = fetchedSessionStats;
                this.updateEngineState(torrents, prevTorrents);
                currentHash = this.computeHash(torrents);
                changedIds = this.computeChangedIds(torrents, prevTorrents);
                this.lastTorrents = torrents;
                this.lastSessionStats = sessionStats;
                // store telemetry snapshot for broadcast
                if (fetchedTelemetry) {
                    // attach to lastSessionStats container if present
                    if (this.lastSessionStats) {
                        this.lastSessionStats.networkTelemetry =
                            fetchedTelemetry;
                    }
                }
                this.lastTorrentHash = currentHash;
                this.pruneDetailCache(torrents);
            }
            if (!torrents || !sessionStats) {
                return;
            }

            const detailResults = new Map<
                string,
                { data?: TorrentDetailEntity; error?: unknown }
            >();

            if (hasDetailSubscribers) {
                const detailResponses = await this.fetchDetailResponses(
                    detailIds
                );

                for (const response of detailResponses) {
                    const { detailId, detail, error } = response;
                    if (error || !detail) {
                        detailResults.set(detailId, { error });
                        continue;
                    }
                    const currentTorrent = torrents.find(
                        (torrent) => torrent.id === detailId
                    );
                    if (
                        !currentTorrent ||
                        currentTorrent.hash !== detail.hash
                    ) {
                        this.detailCache.delete(detailId);
                        detailResults.set(detailId, {
                            error: new Error("Torrent identity mismatch"),
                        });
                        continue;
                    }
                    detailResults.set(detailId, { data: detail });
                    this.detailCache.set(detailId, {
                        hash: detail.hash,
                        detail,
                    });
                }
            }

            const timestampMs = Date.now();
            this.lastPayloadTimestampMs = timestampMs;
            this.lastSource = "polling";

            for (const subEntry of snapshot) {
                const { params } = subEntry;
                const detailId = params.detailId;
                const detailEntry =
                    detailId == null ? undefined : detailResults.get(detailId);
                const detailPayload =
                    detailId == null
                        ? undefined
                        : detailEntry?.data ??
                          this.getCachedDetail(detailId) ??
                          null;

                const payload: HeartbeatPayload = {
                    torrents,
                    sessionStats,
                    // include any available telemetry snapshot for consumers
                    // (backwards-compatible optional field)
                    ...(sessionStats.networkTelemetry
                        ? { networkTelemetry: sessionStats.networkTelemetry }
                        : {}),
                    timestampMs,
                    detailId,
                    detail: detailPayload,
                    changedIds,
                    source: "polling",
                };
                try {
                    const stored = this.subscribers.get(subEntry.id);
                    const lastSeen = stored?.lastSeenHash;
                    const shouldNotify =
                        lastSeen !== currentHash ||
                        Boolean(detailEntry?.data) ||
                        params.mode === "table";
                    if (shouldNotify) {
                        params.onUpdate(payload);
                        if (stored) stored.lastSeenHash = currentHash;
                    }
                } catch {
                    // swallow subscriber errors
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
    // Deduplicated, O(1) ring buffer update for speed history and pruning
    private updateEngineState(
        torrents: TorrentEntity[],
        previous?: TorrentEntity[] | undefined | null
    ) {
        // Enforce canonical state-machine transitions deterministically.
        if (previous && previous.length > 0) {
            const prevMap = new Map<string, TorrentEntity>();
            for (const p of previous) prevMap.set(p.id, p);
            for (const t of torrents) {
                const prev = prevMap.get(t.id);
                if (!prev) continue;
                try {
                    const sanitized = enforceStateTransition(
                        prev.state,
                        t.state
                    );
                    if (sanitized !== t.state) {
                        (t as any).state = sanitized;
                    }
                } catch {
                    // Defensive: if enforcement fails, leave state as-is.
                }
            }
        }
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

        // Invoke conservative automation based strictly on ErrorEnvelope.
        // Provide a safe pause callback if the underlying client exposes pause().
        try {
            const pauseCallback = (ids: string[]) => {
                const maybe = (this.client as any)?.pause;
                if (typeof maybe === "function") {
                    return maybe.call(this.client, ids as string[]);
                }
                return Promise.resolve();
            };
            try {
                processHeartbeat(torrents, previous ?? undefined);
            } catch {
                // Never let automation throw into heartbeat loop
            }
        } catch {
            // swallow
        }
    }

    private notifyError(snapshot: HeartbeatSubscriber[], error: unknown) {
        snapshot.forEach(({ params }) => {
            params.onError?.(error);
        });
    }
}
