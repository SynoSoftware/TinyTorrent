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
import STATUS from "@/shared/status";

export type HeartbeatMode = "background" | "table" | "detail";

export type HeartbeatSource = "polling" | "websocket" | "websocket-telemetry";

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
    // Optional bulk fetch to retrieve many details in a single RPC call.
    getTorrentDetailsBulk?(ids: string[]): Promise<TorrentDetailEntity[]>;
};

// Extend HeartbeatClient with optional network telemetry fetch support.
type HeartbeatClientWithTelemetry = HeartbeatClient & {
    fetchNetworkTelemetry?(): Promise<NetworkTelemetry | null>;
    // Optional optimized delta fetch for transmission-daemon: return a
    // structure with updated torrents and optionally removed ids.
    getRecentlyActive?: () => Promise<{
        torrents: TorrentEntity[];
        removed?: number[];
    }>;
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

const RECENT_REMOVED_TTL_MS = 30_000; // ms
const RESYNC_MIN_INTERVAL_MS = 10_000; // avoid repeated resyncs

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
    private lastResyncAt = 0;
    // Drift correction counters: after a number of delta-only cycles,
    // force a full sync to prevent ghost rows when deltas are missed.
    private cycleCount = 0;
    private readonly MAX_DELTA_CYCLES: number;
    // Rate-limit immediate tick triggers to avoid UI mount/unmount storms.
    private lastImmediateTriggerMs = 0;
    private readonly MIN_IMMEDIATE_TRIGGER_MS: number;
    // Guard to prevent multiple immediate triggers from starting concurrent
    // tick tasks before the first one has a chance to record its timestamp.
    private immediateTickPending = false;
    // Visibility multiplier: when the page is hidden, increase polling
    // intervals to reduce CPU/network. Default multiplier chosen conservatively.
    // Short-term cache of recently-removed ids to dedupe repeated server deltas
    // that may re-send the same `removed` ids until a full-sync completes.

    private recentRemoved = new Map<string, number>();
    private visibilityMultiplier = 1;
    private visibilityHandler?: () => void;

    // Per-torrent speed history: true O(1) circular buffer (no shift/push, no leaks)
    private readonly speedHistory = new Map<
        string,
        { down: number[]; up: number[]; ptr: number }
    >();
    private client: HeartbeatClientWithTelemetry;

    private readonly historySize: number =
        (
            CONFIG as unknown as {
                performance?: { history_data_points?: number };
            }
        )?.performance?.history_data_points ?? 60;
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
        // Read MAX_DELTA_CYCLES from CONFIG if present, fall back to 30.
        try {
            const cfg = (
                CONFIG as unknown as {
                    performance?: {
                        max_delta_cycles?: number;
                        min_immediate_tick_ms?: number;
                    };
                }
            )?.performance;
            const v =
                typeof cfg?.max_delta_cycles === "number"
                    ? cfg.max_delta_cycles
                    : undefined;
            this.MAX_DELTA_CYCLES = Number.isFinite(v) && v! > 0 ? v! : 30;
            const mi =
                typeof cfg?.min_immediate_tick_ms === "number"
                    ? cfg.min_immediate_tick_ms
                    : undefined;
            this.MIN_IMMEDIATE_TRIGGER_MS =
                Number.isFinite(mi) && mi! >= 0 ? mi! : 1000;
        } catch {
            this.MAX_DELTA_CYCLES = 30;
            this.MIN_IMMEDIATE_TRIGGER_MS = 1000;
        }

        // Visibility handling: when the document is hidden, increase polling
        // intervals to reduce background churn. Use a conservative multiplier.
        try {
            if (typeof document !== "undefined") {
                const applyVisibility = () => {
                    try {
                        if (
                            (document as Document & { hidden?: boolean }).hidden
                        ) {
                            this.visibilityMultiplier = 15; // hidden -> slower
                        } else {
                            this.visibilityMultiplier = 1; // visible -> normal
                        }
                        this.rescheduleLoop();
                    } catch {}
                };
                // store handler so we can remove it later to avoid leaks
                this.visibilityHandler = applyVisibility;
                applyVisibility();
                document.addEventListener("visibilitychange", applyVisibility);
            }
        } catch {
            // ignore environment without document
        }
    }

    public getSpeedHistory(id: string): { down: number[]; up: number[] } {
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

    // remove any global listeners and perform cleanup
    public dispose() {
        try {
            if (this.visibilityHandler && typeof document !== "undefined") {
                document.removeEventListener(
                    "visibilitychange",
                    this.visibilityHandler
                );
                this.visibilityHandler = undefined;
            }
        } catch {
            // ignore
        }
        try {
            // Ensure any pending timer is cleared to avoid a tick
            // firing after the client/adapter has been destroyed.
            this.clearTimer();
        } catch {
            // ignore
        }
        // Mark not running so any in-progress checks won't treat this
        // instance as active.
        this.isRunning = false;
    }

    private async fetchDetailResponses(
        detailIds: string[]
    ): Promise<DetailFetchResult[]> {
        if (detailIds.length === 0) {
            return [];
        }

        // OPTIMIZATION: Use bulk fetch if available to prevent N+1 request storms
        const clientAny = this.client as HeartbeatClientWithTelemetry & {
            getTorrentDetailsBulk?: unknown;
        };
        if (typeof clientAny.getTorrentDetailsBulk === "function") {
            try {
                const details = await (
                    clientAny.getTorrentDetailsBulk as (
                        ids: string[]
                    ) => Promise<TorrentDetailEntity[]>
                )(detailIds);

                const resultMap = new Map<string, TorrentDetailEntity>();
                for (const d of details || []) {
                    if (d && d.id) resultMap.set(d.id, d);
                }

                return detailIds.map((id) => ({
                    detailId: id,
                    detail: resultMap.get(id),
                    error: resultMap.has(id)
                        ? undefined
                        : new Error("Detail not returned in bulk fetch"),
                }));
            } catch (error) {
                return detailIds.map((id) => ({ detailId: id, error }));
            }
        }

        // Fallback to original queued/parallel fetching strategy
        const queue = detailIds.slice();
        const results: DetailFetchResult[] = [];
        const worker = async () => {
            while (true) {
                const detailId = queue.shift();
                if (!detailId) return;
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
        await Promise.all(workers);
        return results;
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
        const basePayload: Partial<
            HeartbeatPayload & { networkTelemetry?: NetworkTelemetry }
        > = {
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
        const payload: HeartbeatPayload = basePayload as HeartbeatPayload;
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
        const maybeNetworkTelemetry = (
            payload as unknown as { networkTelemetry?: NetworkTelemetry }
        ).networkTelemetry;
        if (maybeNetworkTelemetry) {
            if (this.lastSessionStats) {
                this.lastSessionStats.networkTelemetry = maybeNetworkTelemetry;
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
        if (this.immediateTickPending) return;
        const now = Date.now();
        if (now - this.lastImmediateTriggerMs < this.MIN_IMMEDIATE_TRIGGER_MS) {
            return;
        }
        this.immediateTickPending = true;
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
        let interval: number;
        if (params.mode === "table" && params.pollingIntervalMs !== undefined) {
            interval = Math.max(1000, params.pollingIntervalMs);
        } else {
            interval = MODE_INTERVALS[params.mode];
        }

        interval = interval * this.visibilityMultiplier;

        if (!Number.isFinite(interval)) {
            return 2000;
        }

        // Enforce a sensible floor to prevent extremely fast polling from
        // mis-configured clients or NaN propagation. Use 500ms to avoid
        // sub-500ms polling unless explicitly configured.
        return Math.max(500, interval);
    }

    private async tick() {
        // Record the execution time of a real tick so throttling reflects
        // actual work, not just immediate trigger attempts.
        this.lastImmediateTriggerMs = Date.now();
        // clear the pending flag since the tick has actually started
        this.immediateTickPending = false;

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
                let fetchedTorrents: TorrentEntity[];
                let fetchedSessionStats: SessionStats;
                let fetchedTelemetry: NetworkTelemetry | undefined = undefined;

                // If we already have an initial snapshot and the client
                // exposes `getRecentlyActive`, prefer the lightweight delta
                // fetch to avoid pulling the entire torrent list every tick.
                // Decide whether to use delta or force a full fetch.
                const clientDelta = this
                    .client as HeartbeatClientWithTelemetry & {
                    getRecentlyActive?: unknown;
                };
                const supportsDelta =
                    Array.isArray(torrents) &&
                    torrents.length > 0 &&
                    typeof clientDelta.getRecentlyActive === "function";
                const forceFull = this.cycleCount >= this.MAX_DELTA_CYCLES;

                // --- 1. Fetch Global Stats ---
                const sessionStatsCall = this.client.getSessionStats();

                if (supportsDelta && !forceFull) {
                    try {
                        const telemetryClient = this
                            .client as HeartbeatClientWithTelemetry;

                        const recentActiveCall = (
                            clientDelta.getRecentlyActive as () => Promise<{
                                torrents: TorrentEntity[];
                                removed?: number[];
                            }>
                        )();
                        const telemetryCall =
                            typeof telemetryClient.fetchNetworkTelemetry ===
                            "function"
                                ? telemetryClient.fetchNetworkTelemetry()
                                : Promise.resolve(undefined);

                        const [delta, stats, maybeTelemetry] =
                            await Promise.all([
                                recentActiveCall,
                                sessionStatsCall,
                                telemetryCall,
                            ]);
                        fetchedSessionStats = stats;

                        // --- 2. Structural Merge (Delta) ---
                        const prevTorrents = this.lastTorrents ?? [];
                        const map = new Map<string, TorrentEntity>();
                        for (const t of prevTorrents) map.set(String(t.id), t);
                        let leftoverResyncTriggered = false;
                        let shouldDiag = false;
                        try {
                            if (
                                typeof sessionStorage !== "undefined" &&
                                sessionStorage.getItem(
                                    "tt-debug-removed-diagnostics"
                                ) === "1"
                            ) {
                                shouldDiag = true;
                            }
                        } catch {
                            // ignore
                        }

                        if (delta && Array.isArray(delta.removed)) {
                            const now = Date.now();
                            const removedWillBeNoop = delta.removed.every(
                                (id) => {
                                    const key = String(id);
                                    const lastSeen =
                                        this.recentRemoved.get(key);
                                    if (
                                        lastSeen &&
                                        now - lastSeen < RECENT_REMOVED_TTL_MS
                                    )
                                        return true;
                                    if (map.has(key)) return false;
                                    for (const v of map.values()) {
                                        if (
                                            v.rpcId != null &&
                                            (v.rpcId ===
                                                (typeof id === "number"
                                                    ? id
                                                    : Number(id)) ||
                                                String(v.rpcId) === key)
                                        ) {
                                            return false;
                                        }
                                    }
                                    return true;
                                }
                            );
                            if (shouldDiag) {
                                console.debug(
                                    removedWillBeNoop
                                        ? "[tiny-torrent][heartbeat][removed-quiet]"
                                        : "[tiny-torrent][heartbeat][removed]",
                                    { removed: delta.removed }
                                );
                            }
                            for (const id of delta.removed) {
                                const key = String(id);
                                const lastSeen = this.recentRemoved.get(key);
                                if (
                                    lastSeen &&
                                    now - lastSeen < RECENT_REMOVED_TTL_MS
                                ) {
                                    if (shouldDiag) {
                                        console.debug(
                                            "[tiny-torrent][heartbeat][removed-skipped]",
                                            { id, key, lastSeen }
                                        );
                                    }
                                    continue;
                                }
                                let deleted = map.delete(key);
                                if (!deleted) {
                                    for (const [k, v] of map.entries()) {
                                        if (
                                            (v.rpcId != null &&
                                                v.rpcId ===
                                                    (typeof id === "number"
                                                        ? id
                                                        : Number(id))) ||
                                            String(v.rpcId) === key
                                        ) {
                                            map.delete(k);
                                            deleted = true;
                                        }
                                    }
                                }
                                if (deleted) {
                                    this.recentRemoved.set(key, now);
                                } else {
                                    const wasPresentInPrev = prevTorrents.some(
                                        (t) => {
                                            if (String(t.id) === key)
                                                return true;
                                            if (
                                                t.rpcId != null &&
                                                String(t.rpcId) === key
                                            )
                                                return true;
                                            if (
                                                t.rpcId != null &&
                                                t.rpcId ===
                                                    (typeof id === "number"
                                                        ? id
                                                        : Number(id))
                                            )
                                                return true;
                                            return false;
                                        }
                                    );
                                    if (!wasPresentInPrev) {
                                        this.recentRemoved.set(key, now);
                                        if (shouldDiag) {
                                            console.debug(
                                                "[tiny-torrent][heartbeat][removed-absent]",
                                                { id, key }
                                            );
                                        }
                                    }
                                }
                                if (shouldDiag) {
                                    console.debug(
                                        "[tiny-torrent][heartbeat][removed-deleted]",
                                        { id, key, deleted }
                                    );
                                }
                            }
                            for (const [
                                k,
                                ts,
                            ] of this.recentRemoved.entries()) {
                                if (now - ts > RECENT_REMOVED_TTL_MS)
                                    this.recentRemoved.delete(k);
                            }
                        }

                        if (delta && Array.isArray(delta.torrents)) {
                            for (const d of delta.torrents) {
                                map.set(String(d.id), d as TorrentEntity);
                            }
                        }

                        const deltaSnapshot = Array.from(map.values());
                        fetchedTorrents = deltaSnapshot;

                        if (
                            delta &&
                            Array.isArray(delta.removed) &&
                            delta.removed.length > 0
                        ) {
                            const keySet = new Set<string>(
                                Array.from(map.keys())
                            );
                            const rpcIdSet = new Set<string>();
                            for (const v of map.values()) {
                                if (v.rpcId != null)
                                    rpcIdSet.add(String(v.rpcId));
                            }
                            const leftover = delta.removed.filter((rid) => {
                                const s = String(rid);
                                return keySet.has(s) || rpcIdSet.has(s);
                            });
                            if (leftover.length > 0) {
                                if (shouldDiag) {
                                    console.debug(
                                        "[tiny-torrent][heartbeat][removed-leftover]",
                                        { leftover }
                                    );
                                }
                                const nowResync = Date.now();
                                if (
                                    nowResync - this.lastResyncAt >
                                    RESYNC_MIN_INTERVAL_MS
                                ) {
                                    try {
                                        if (shouldDiag) {
                                            console.debug(
                                                "[tiny-torrent][heartbeat][leftover-resync]",
                                                { leftover }
                                            );
                                        }
                                        const [all, stats] = await Promise.all([
                                            this.client.getTorrents(),
                                            this.client.getSessionStats(),
                                        ]);
                                        fetchedTorrents = all;
                                        fetchedSessionStats = stats;
                                        this.cycleCount = 0;
                                        this.lastResyncAt = nowResync;
                                        leftoverResyncTriggered = true;
                                    } catch (err) {
                                        console.error(
                                            "[tiny-torrent][heartbeat][resync-failed]",
                                            err
                                        );
                                    }
                                } else if (shouldDiag) {
                                    console.debug(
                                        "[tiny-torrent][heartbeat][leftover-resync-skipped]",
                                        {
                                            leftover,
                                            lastResyncAt: this.lastResyncAt,
                                        }
                                    );
                                }
                            }
                        }


                        if (maybeTelemetry) {
                            fetchedTelemetry =
                                maybeTelemetry as NetworkTelemetry;
                        }
                        this.cycleCount += 1;
                    } catch (err) {
                        const [all, stats] = await Promise.all([
                            this.client.getTorrents(),
                            this.client.getSessionStats(),
                        ]);
                        fetchedTorrents = all;
                        fetchedSessionStats = stats;
                        this.cycleCount = 0;
                    }
                } else {
                    const [all, stats] = await Promise.all([
                        this.client.getTorrents(),
                        this.client.getSessionStats(),
                    ]);
                    fetchedTorrents = all;
                    fetchedSessionStats = stats;
                    if (supportsDelta) this.cycleCount = 0;
                }

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
                    // ignore
                }
                const prevTorrents = this.lastTorrents;
                torrents = fetchedTorrents;
                sessionStats = fetchedSessionStats;
                this.updateEngineState(torrents, prevTorrents);
                currentHash = this.computeHash(torrents);
                changedIds = this.computeChangedIds(torrents, prevTorrents);
                this.lastTorrents = torrents;
                this.lastSessionStats = sessionStats;
                if (fetchedTelemetry) {
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
                    // swallow
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

    private updateEngineState(
        torrents: TorrentEntity[],
        previous?: TorrentEntity[] | undefined | null
    ) {
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
                        const mutable = t as TorrentEntity & {
                            state?: typeof sanitized;
                        };
                        mutable.state = sanitized;
                    }
                } catch {
                    // ignore
                }
            }
        }
        const size = this.historySize;
        const currentIds = new Set(torrents.map((t) => t.id));
        for (const key of this.speedHistory.keys()) {
            if (!currentIds.has(key)) this.speedHistory.delete(key);
        }
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

        try {
            const clientPause = this.client as HeartbeatClientWithTelemetry & {
                pause?: (ids: string[]) => Promise<void>;
            };
            try {
                processHeartbeat(torrents, previous ?? undefined);
            } catch {
                // ignore
            }
        } catch {
            // ignore
        }
    }

    private notifyError(snapshot: HeartbeatSubscriber[], error: unknown) {
        snapshot.forEach(({ params }) => {
            params.onError?.(error);
        });
    }
}
