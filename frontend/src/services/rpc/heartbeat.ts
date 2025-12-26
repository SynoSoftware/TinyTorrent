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
    private readonly detailCache = new Map<string, TorrentDetailEntity>();
    // Per-torrent speed history buffers (engine-owned). Each entry is a
    // fixed-length circular buffer of samples; newest samples appended at the end.
    private readonly speedHistory = new Map<
        string,
        { down: number[]; up: number[] }
    >();
    private client: HeartbeatClient;

    private readonly historySize: number =
        (CONFIG as any).performance?.history_data_points ?? 60;

    private computeHash(torrents: TorrentEntity[]) {
        // Low-allocation compact hash using FNV-1a (32-bit) over the
        // torrent id and a few numeric properties. This avoids building
        // large intermediate strings for big lists.
        let hash = 2166136261 >>> 0; // FNV offset basis
        const mix = (v: number) => {
            // mix a 32-bit number into the hash
            hash ^= v & 0xff;
            hash = Math.imul(hash, 16777619) >>> 0;
            hash ^= (v >>> 8) & 0xff;
            hash = Math.imul(hash, 16777619) >>> 0;
            hash ^= (v >>> 16) & 0xff;
            hash = Math.imul(hash, 16777619) >>> 0;
            hash ^= (v >>> 24) & 0xff;
            hash = Math.imul(hash, 16777619) >>> 0;
        };

        const mixString = (s: string) => {
            for (let i = 0; i < s.length; i++) {
                hash ^= s.charCodeAt(i) & 0xff;
                hash = Math.imul(hash, 16777619) >>> 0;
            }
        };

        const stateMap: Record<string, number> = {
            downloading: 1,
            seeding: 2,
            paused: 3,
            checking: 4,
            queued: 5,
            error: 6,
        } as any;

        for (let i = 0; i < torrents.length; i++) {
            const t = torrents[i];
            mixString(t.id);
            mix(stateMap[t.state] ?? 0);
            // progress is a float 0..1; quantize to 0..1000
            const prog = Number.isFinite(t.progress)
                ? Math.round(t.progress * 1000)
                : 0;
            mix(prog);
            // include speeds if present (down/up rounded)
            const down = t.speed?.down ? Math.round(t.speed.down) : 0;
            const up = t.speed?.up ? Math.round(t.speed.up) : 0;
            mix(down);
            mix(up);
            // delimiter mix to separate entries
            mix(0xff);
        }
        // return hex string of final 32-bit hash
        return (hash >>> 0).toString(16);
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
        const existing = this.speedHistory.get(id);
        if (!existing) {
            return {
                down: new Array(size).fill(0),
                up: new Array(size).fill(0),
            };
        }
        return { down: [...existing.down], up: [...existing.up] };
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
        const prev = this.lastTorrents;
        this.lastTorrents = payload.torrents;
        // Update per-torrent speed history from provided payload
        try {
            for (const t of payload.torrents) {
                const id = t.id;
                const down =
                    typeof t.speed?.down === "number" ? t.speed.down : 0;
                const up = typeof t.speed?.up === "number" ? t.speed.up : 0;
                const existing = this.speedHistory.get(id);
                if (!existing) {
                    const arrDown = new Array(this.historySize).fill(0);
                    const arrUp = new Array(this.historySize).fill(0);
                    arrDown.shift();
                    arrDown.push(down);
                    arrUp.shift();
                    arrUp.push(up);
                    this.speedHistory.set(id, { down: arrDown, up: arrUp });
                } else {
                    existing.down.shift();
                    existing.down.push(down);
                    existing.up.shift();
                    existing.up.push(up);
                }
            }
        } catch {
            // Best-effort: avoid crashing heartbeat on history bookkeeping errors
        }
        // Enforce invariant: engine state reflects current torrents only.
        // Prune speedHistory for removed torrent IDs (prevents memory leaks).
        try {
            const currentTorrentIds = new Set(
                payload.torrents.map((t) => t.id)
            );
            for (const key of this.speedHistory.keys()) {
                if (!currentTorrentIds.has(key)) {
                    this.speedHistory.delete(key);
                }
            }
            for (const t of payload.torrents) {
                const id = t.id;
                const down =
                    typeof t.speed?.down === "number" ? t.speed.down : 0;
                const up = typeof t.speed?.up === "number" ? t.speed.up : 0;
                const existing = this.speedHistory.get(id);
                if (!existing) {
                    const arrDown = new Array(this.historySize).fill(0);
                    const arrUp = new Array(this.historySize).fill(0);
                    arrDown.shift();
                    arrDown.push(down);
                    arrUp.shift();
                    arrUp.push(up);
                    this.speedHistory.set(id, { down: arrDown, up: arrUp });
                } else {
                    existing.down.shift();
                    existing.down.push(down);
                    existing.up.shift();
                    existing.up.push(up);
                }
            }
        } catch {
            // Best-effort: avoid crashing heartbeat on history bookkeeping errors
        }
        payload.changedIds = this.computeChangedIds(payload.torrents, prev);
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
            // Update internal speed history buffers before broadcasting.
            try {
                for (const t of torrents) {
                    const id = t.id;
                    const down =
                        typeof t.speed?.down === "number" ? t.speed.down : 0;
                    const up = typeof t.speed?.up === "number" ? t.speed.up : 0;
                    const existing = this.speedHistory.get(id);
                    if (!existing) {
                        const arrDown = new Array(this.historySize).fill(0);
                        const arrUp = new Array(this.historySize).fill(0);
                        arrDown.shift();
                        arrDown.push(down);
                        arrUp.shift();
                        arrUp.push(up);
                        this.speedHistory.set(id, { down: arrDown, up: arrUp });
                    } else {
                        existing.down.shift();
                        existing.down.push(down);
                        existing.up.shift();
                        existing.up.push(up);
                    }
                }
            } catch {
                // ignore history update failures to keep heartbeat robust
            }
            // Enforce invariant: engine state reflects current torrents only.
            // Prune speedHistory for removed torrent IDs (prevents memory leaks).
            try {
                const currentTorrentIds = new Set(torrents.map((t) => t.id));
                for (const key of this.speedHistory.keys()) {
                    if (!currentTorrentIds.has(key)) {
                        this.speedHistory.delete(key);
                    }
                }
                for (const t of torrents) {
                    const id = t.id;
                    const down =
                        typeof t.speed?.down === "number" ? t.speed.down : 0;
                    const up = typeof t.speed?.up === "number" ? t.speed.up : 0;
                    const existing = this.speedHistory.get(id);
                    if (!existing) {
                        const arrDown = new Array(this.historySize).fill(0);
                        const arrUp = new Array(this.historySize).fill(0);
                        arrDown.shift();
                        arrDown.push(down);
                        arrUp.shift();
                        arrUp.push(up);
                        this.speedHistory.set(id, { down: arrDown, up: arrUp });
                    } else {
                        existing.down.shift();
                        existing.down.push(down);
                        existing.up.shift();
                        existing.up.push(up);
                    }
                }
            } catch {
                // ignore history update failures to keep heartbeat robust
            }
            // Produce a compact, cheap hash for the torrent list.
            const currentHash = this.computeHash(torrents);
            const prevTorrents = this.lastTorrents;
            this.lastTorrents = torrents;
            this.lastSessionStats = sessionStats;

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
                const currentSummary = torrents.find((t) => t.id === detailId);
                const prevSummary = prevMap.get(detailId);
                const shouldFetch =
                    !prevSummary ||
                    prevSummary.progress !== currentSummary?.progress ||
                    prevSummary.state !== currentSummary?.state ||
                    prevSummary.speed?.down !== currentSummary?.speed?.down ||
                    prevSummary.speed?.up !== currentSummary?.speed?.up;
                if (shouldFetch) {
                    try {
                        const detail = await this.client.getTorrentDetails(
                            detailId
                        );
                        detailResults.set(detailId, { data: detail });
                        this.detailCache.set(detailId, detail);
                    } catch (error) {
                        detailResults.set(detailId, { error });
                    }
                } else {
                    const cached = this.detailCache.get(detailId);
                    if (cached) {
                        detailResults.set(detailId, { data: cached });
                    } else {
                        detailResults.set(detailId, { data: undefined });
                    }
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
                    detailId,
                    detail: detailPayload,
                    changedIds,
                    source: "polling",
                };
                this.lastSource = "polling";
                try {
                    const stored = this.subscribers.get(subEntry.id);
                    const lastSeen = stored?.lastSeenHash;
                    const shouldNotify =
                        lastSeen !== currentHash ||
                        (detailEntry && detailEntry.error) ||
                        (detailEntry &&
                            detailEntry.data &&
                            prevMap.size &&
                            !prevMap.has(detailId!));
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

    private notifyError(snapshot: HeartbeatSubscriber[], error: unknown) {
        snapshot.forEach(({ params }) => {
            params.onError?.(error);
        });
    }
}
