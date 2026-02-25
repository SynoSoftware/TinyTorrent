/**
 *
 * Do not delete this comment!
 *
 * “Transport reconnect timers are exempt from heartbeat centralization”
 *
 * Do not delete this comment!
 *
 * */
import type {
    TransmissionSessionSettings,
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionFreeSpace,
    TransmissionSessionStats,
    TransmissionBandwidthGroupOptions,
    TransmissionTorrentRenameResult,
} from "@/services/rpc/types";
import { z } from "zod";
import {
    parseRpcResponse,
    zTransmissionTorrentArray,
    zTransmissionTorrentDetailArray,
    zTransmissionTorrentDetailSingle,
    zSessionStats,
    zTransmissionSessionSettings,
    zTransmissionFreeSpace,
    zTransmissionTorrentRenameResult,
    zRpcSuccess,
    zTransmissionAddTorrentResponse,
    zTransmissionRecentlyActiveResponse,
} from "@/services/rpc/schemas";
import { READ_RPC_CACHE_TTL_MS } from "@/config/logic";
import type {
    EngineAdapter,
    EngineRuntimeCapabilities,
    TorrentDetailsRequestOptions,
} from "@/services/rpc/engine-adapter";
import { HeartbeatManager } from "@/services/rpc/heartbeat";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "@/services/rpc/heartbeat";
import type {
    TorrentEntity,
    TorrentDetailEntity,
    AddTorrentPayload,
    AddTorrentResult,
    SessionStats,
    EngineInfo,
    ServerClass,
} from "@/services/rpc/entities";
import { normalizeTorrent, normalizeTorrentDetail } from "@/services/rpc/normalizers";
import { RpcCommandError } from "@/services/rpc/errors";
import { TransmissionRpcTransport } from "@/services/transport";
import type { NetworkTelemetry } from "@/services/rpc/entities";
import { infraLogger } from "@/shared/utils/infraLogger";
import { isAbortError } from "@/shared/utils/errors";

type RpcRequest<M extends string> = {
    method: M;
    arguments?: Record<string, unknown>;
    tag?: number;
};

type HandshakeState = "idle" | "handshaking" | "ready" | "invalid";

type RpcSendOptions = {
    bypassHandshake?: boolean;
    _retry409?: boolean;
};

const READ_ONLY_RPC_METHODS = new Set([
    "torrent-get",
    "session-get",
    "session-stats",
    "tt-get-capabilities",
    "free-space",
]);
const READ_ONLY_RPC_RESPONSE_TTL_MS = READ_RPC_CACHE_TTL_MS;

const WARNING_THROTTLE_MS = 1000;
const recentWarningTs = new Map<string, number>();

const SUMMARY_FIELDS: Array<keyof TransmissionTorrent> = [
    "id",
    "hashString",
    "name",
    "totalSize",
    "percentDone",
    "recheckProgress",
    "status",
    "rateDownload",
    "rateUpload",
    "peersConnected",
    "peersSendingToUs",
    "peersGettingFromUs",
    "eta",
    "addedDate",
    "queuePosition",
    "uploadRatio",
    "uploadedEver",
    "downloadedEver",
    "haveValid",
    "haveUnchecked",
    "doneDate",
    "secondsDownloading",
    "secondsSeeding",
    "leftUntilDone",
    "sizeWhenDone",
    "error",
    "errorString",
    "sequentialDownload",
    "superSeeding",
    "isFinished",
    "downloadDir",
];

const DETAIL_BASE_FIELDS = [
    ...SUMMARY_FIELDS,
    "files",
    "fileStats",
    "trackers",
    "peers",
    "pieceCount",
    "pieceSize",
];

const DETAIL_TRACKER_FIELDS = [
    "trackerStats",
];

const DETAIL_PIECE_FIELDS = [
    "pieces",
    "availability",
];

const buildDetailFields = (
    options?: TorrentDetailsRequestOptions
): string[] => {
    const profile = options?.profile ?? "standard";
    const includeTrackerStats = options?.includeTrackerStats ?? true;
    const fields = [...DETAIL_BASE_FIELDS];
    if (includeTrackerStats) {
        fields.push(...DETAIL_TRACKER_FIELDS);
    }
    if (profile === "pieces") {
        fields.push(...DETAIL_PIECE_FIELDS);
    }
    return fields;
};

export class TransmissionAdapter implements EngineAdapter {
    private endpoint: string;
    private sessionId?: string;
    private username: string;
    private password: string;
    private requestTimeout?: number;
    private sessionSettingsCache?: TransmissionSessionSettings;
    private engineInfoCache?: EngineInfo;
    private idMap = new Map<string, number>();
    private readonly heartbeat = new HeartbeatManager(this);
    // Active in-flight request controllers (for abort on destroy)
    private readonly activeControllers = new Set<AbortController>(); // Rapid-call detector: tracks recent method call counts to detect
    // potential race conditions or buggy caller code.
    private readonly recentMethodCalls = new Map<
        string,
        { count: number; firstTs: number }
    >();
    private readonly METHOD_CALL_WINDOW_MS = 2000;
    private readonly METHOD_CALL_WARNING_THRESHOLD = 100;
    private transport: TransmissionRpcTransport;
    private serverClass: ServerClass = "transmission";
    private handshakeState: HandshakeState = "invalid";
    private handshakePromise?: Promise<TransmissionSessionSettings>;
    private handshakeResult?: TransmissionSessionSettings;
    // (sessionIdRefreshPromise removed — Transport owns session-id probing)
    // Cache for potentially expensive network telemetry lookups (free-space).
    // Prevents invoking disk/FS checks on every telemetry refresh.

    private networkTelemetryCache?: {
        value: NetworkTelemetry | null;
        ts: number;
        inflight?: Promise<NetworkTelemetry | null>;
    };
    // Dedicated inflight lock to avoid races when two callers start telemetry
    // resolution concurrently before the cache object is installed.
    private _networkTelemetryInflight?: Promise<NetworkTelemetry | null>;
    private readonly NETWORK_TELEMETRY_TTL_MS = 60_000;

    private handleUnauthorizedResponse() {
        this.invalidateSession("unauthorized");
    }
    private transitionHandshakeState(next: HandshakeState, reason: string) {
        const prev = this.handshakeState;
        if (prev === next) return;
        if (prev === "invalid" && next === "handshaking") {
            infraLogger.debug({
                scope: "rpc",
                event: "handshake_state_transition",
                message: "Session state transitioned from invalid to handshaking",
                details: { from: prev, to: next, reason },
            });
        } else if (prev === "handshaking" && next === "ready") {
            infraLogger.debug({
                scope: "rpc",
                event: "handshake_state_transition",
                message: "Session state transitioned from handshaking to ready",
                details: { from: prev, to: next, reason },
            });
        } else if (prev === "ready" && next === "invalid") {
            infraLogger.debug({
                scope: "rpc",
                event: "handshake_state_transition",
                message: "Session state transitioned from ready to invalid",
                details: { from: prev, to: next, reason },
            });
        }
        this.handshakeState = next;
    }

    private acceptSessionId(token: string) {
        this.sessionId = token;
        if (
            this.handshakeState === "invalid" ||
            this.handshakeState === "idle"
        ) {
            this.handshakeState = "ready";
        }
    }

    private invalidateSession(reason: string) {
        this.sessionId = undefined;
        this.handshakeResult = undefined;
        this.transitionHandshakeState("invalid", reason);
    }

    constructor(options: {
        endpoint: string;
        username?: string;
        password?: string;
        requestTimeout?: number;
    }) {
        this.endpoint = options.endpoint;
        this.username = options.username ?? "";
        this.password = options.password ?? "";
        this.requestTimeout = options.requestTimeout;
        // Transport encapsulates Transmission session id handling and probing
        this.transport = new TransmissionRpcTransport(
            this.endpoint,
            this.username || this.password
                ? {
                      user: this.username,
                      pass: this.password,
                  }
                : undefined,
        );
    }

    private extractEndpointHost(): string {
        try {
            const url = new URL(this.endpoint);
            return url.hostname.toLowerCase();
        } catch {
            return "";
        }
    }

    private isLoopbackHost(host: string): boolean {
        const trimmed = host.trim().toLowerCase();
        if (!trimmed) return false;
        return (
            trimmed === "127.0.0.1" ||
            trimmed === "localhost" ||
            trimmed === "::1" ||
            trimmed === "0:0:0:0:0:0:0:1"
        );
    }

    public updateRequestTimeout(timeout: number) {
        this.requestTimeout = timeout;
    }

    private getAuthorizationHeader(): string | undefined {
        if (!this.username && !this.password) {
            return undefined;
        }
        const token = `${this.username}:${this.password}`;
        return `Basic ${btoa(token)}`;
    }

    private async performSend<T>(
        payload: RpcRequest<string>,
        schema: z.ZodSchema<T>,
        retryCount = 0,
        keepalive = false,
        options?: RpcSendOptions,
    ): Promise<T> {
        void retryCount;
        // Hard gate: do not send RPCs unless we have completed a handshake
        // and hold a valid session ID. This prevents callers from racing
        // handshakes and issuing requests that lack the proper session
        // context (which leads to empty results or 409 churn). Bypass when
        // explicitly requested (session-get etc.).
        if (
            !options?.bypassHandshake &&
            (this.handshakeState !== "ready" || !this.sessionId)
        ) {
            await this.handshakeOnce();
        }
        const controller = new AbortController();
        this.activeControllers.add(controller);
        let timeoutId: number | undefined;
        if (this.requestTimeout && this.requestTimeout > 0) {
            timeoutId = window.setTimeout(
                () => controller.abort(),
                this.requestTimeout,
            );
        }

        try {
            try {
                const now = Date.now();
                const m = payload.method ?? "";
                const entry = this.recentMethodCalls.get(m);
                if (
                    entry &&
                    now - entry.firstTs <= this.METHOD_CALL_WINDOW_MS
                ) {
                    entry.count += 1;
                } else {
                    this.recentMethodCalls.set(m, {
                        count: 1,
                        firstTs: now,
                    });
                }
                const cur = this.recentMethodCalls.get(m)!;
                if (cur.count >= this.METHOD_CALL_WARNING_THRESHOLD) {
                    const lastWarn = recentWarningTs.get(m) ?? 0;
                    if (now - lastWarn >= WARNING_THROTTLE_MS) {
                        infraLogger.warn({
                            scope: "rpc",
                            event: "rapid_method_calls",
                            message: "Rapid repeated calls detected for RPC method",
                            details: {
                                method: m,
                                count: cur.count,
                                windowMs: this.METHOD_CALL_WINDOW_MS,
                            },
                        });
                        recentWarningTs.set(m, now);
                    }
                }
            } catch {
                // Ignore diagnostics errors
            }

            const attemptRequest = async (): Promise<T> => {
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };

                const authHeader = this.getAuthorizationHeader();
                if (authHeader) {
                    headers.Authorization = authHeader;
                }

                const requestInit: RequestInit = {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                };
                if (keepalive) {
                    requestInit.keepalive = true;
                }
                const transportOutcome =
                    await this.transport.fetchWithSessionOutcome(
                        requestInit,
                        controller,
                        keepalive,
                    );
                if (transportOutcome.kind !== "ok") {
                    if (transportOutcome.kind === "auth_error") {
                        this.handleUnauthorizedResponse();
                        throw new Error(transportOutcome.message);
                    }
                    if (transportOutcome.kind === "session_conflict") {
                        this.invalidateSession("409-session-conflict");
                        throw new Error(transportOutcome.message);
                    }
                    if (transportOutcome.kind === "aborted") {
                        const abortedError = new Error(
                            transportOutcome.message,
                        );
                        (abortedError as { name?: string }).name =
                            "AbortError";
                        throw abortedError;
                    }
                    throw new Error(transportOutcome.message);
                }
                const response = transportOutcome.response;

                if (response.status === 409) {
                    // Transport owns session-id negotiation/retry. If a 409 still
                    // bubbles up here, fail fast and invalidate local handshake.
                    this.invalidateSession("409-session-conflict");
                    throw new Error("Transmission RPC session conflict");
                }

                if (response.status === 401) {
                    this.handleUnauthorizedResponse();
                    throw new Error("Transmission RPC unauthorized");
                }
                if (response.status === 403) {
                    this.handleUnauthorizedResponse();
                    throw new Error("Transmission RPC forbidden");
                }

                if (!response.ok) {
                    throw new Error(
                        `Transmission RPC responded with ${response.status}`,
                    );
                }
                // Sync transport-owned session token into adapter state so
                // handshake gating remains coherent for mutating RPC flows.
                try {
                    const transportToken = this.transport.getSessionId();
                    if (transportToken && transportToken !== this.sessionId) {
                        this.acceptSessionId(transportToken);
                    }
                } catch {
                    // ignore transport session sync errors
                }

                const json = await response.json();
                const parsed = parseRpcResponse(json);

                if (parsed.result !== "success") {
                    const code = parsed.result ?? "";
                    const lower = String(code).toLowerCase();
                    const methodNotFound =
                        /method|not\s*found|not\s*recognized/.test(lower);

                    if (methodNotFound) {
                        infraLogger.warn({
                            scope: "rpc",
                            event: "method_not_recognized",
                            message:
                                "RPC method not recognized by server response",
                            details: {
                                method: payload.method,
                                code,
                            },
                        });
                        throw new RpcCommandError(
                            `Transmission RPC responded with ${code}`,
                            code,
                        );
                    }

                    throw new RpcCommandError(
                        `Transmission RPC responded with ${parsed.result}`,
                        parsed.result,
                    );
                }
                const args = parsed.arguments ?? {};
                try {
                    const shouldLog =
                        typeof sessionStorage !== "undefined" &&
                        sessionStorage.getItem(
                            "tt-debug-raw-torrent-detail",
                        ) === "2";
                    if (shouldLog && payload.method === "torrent-get") {
                        infraLogger.debug({
                            scope: "rpc",
                            event: "raw_torrent_get",
                            message: "Raw torrent-get payload",
                            details: { args },
                        });
                    }
                    try {
                        const shouldLogSessionGet =
                            typeof sessionStorage !== "undefined" &&
                            sessionStorage.getItem(
                                "tt-debug-raw-session-get",
                            ) === "1";
                        if (
                            shouldLogSessionGet &&
                            payload.method === "session-get"
                        ) {
                            infraLogger.debug({
                                scope: "rpc",
                                event: "raw_session_get",
                                message: "Raw session-get payload",
                                details: { args },
                            });
                        }
                    } catch {
                        // ignore sessionStorage errors for session-get logging
                    }
                } catch {
                    // ignore sessionStorage errors
                }
                return schema.parse(args as unknown) as T;
            };

            const requestPromise = (async () => {
                try {
                    return await attemptRequest();
                } catch (e) {
                    if (!isAbortError(e)) {
                        infraLogger.error(
                            {
                                scope: "rpc",
                                event: "send_error",
                                message: "RPC send request failed",
                            },
                            e instanceof Error ? e : { error: String(e) },
                        );
                    }
                    throw e;
                } finally {
                    if (timeoutId) {
                        window.clearTimeout(timeoutId);
                    }
                    try {
                        this.activeControllers.delete(controller);
                    } catch {
                        // swallow
                    }
                }
            })();

            return requestPromise;
        } catch (e) {
            if (!isAbortError(e)) {
                infraLogger.error(
                    {
                        scope: "rpc",
                        event: "send_error",
                        message: "RPC send request failed",
                    },
                    e instanceof Error ? e : { error: String(e) },
                );
            }
            throw e;
        }
    }

    public async send<T>(
        payload: RpcRequest<string>,
        schema: z.ZodSchema<T>,
        retryCount = 0,
        keepalive = false,
        options?: RpcSendOptions,
    ): Promise<T> {
        const method = payload.method ?? "";
        if (READ_ONLY_RPC_METHODS.has(method)) {
            const cacheEnabled = READ_ONLY_RPC_RESPONSE_TTL_MS > 0;
            const args = payload.arguments ?? {};
            try {
                // Ensure transport is seeded with any adapter-held session id
                try {
                    const transportSession = this.transport.getSessionId();
                    if (this.sessionId && this.sessionId !== transportSession) {
                        const t = this.transport as unknown as {
                            setSessionId?: (token?: string | null) => void;
                        };
                        if (typeof t.setSessionId === "function")
                            t.setSessionId(this.sessionId);
                    }
                } catch {
                    // ignore transport session seed errors
                }
                const rawOutcome = await this.transport.requestWithOutcome(
                    payload.method!,
                    args,
                    { cache: cacheEnabled },
                );
                if (rawOutcome.kind !== "ok") {
                    if (rawOutcome.kind === "auth_error") {
                        const authError = new Error(rawOutcome.message);
                        (authError as { status?: number }).status =
                            rawOutcome.status;
                        throw authError;
                    }
                    if (rawOutcome.kind === "aborted") {
                        const abortedError = new Error(rawOutcome.message);
                        (abortedError as { name?: string }).name =
                            "AbortError";
                        throw abortedError;
                    }
                    throw new Error(rawOutcome.message);
                }
                const raw = rawOutcome.value;

                // Sync transport-owned session id back into adapter state so
                // subsequent mutating RPCs (which rely on adapter.sessionId)
                // won't trigger redundant handshakes. Transport may obtain the
                // authoritative X-Transmission-Session-Id during read-only
                // requests (e.g. session-get) so propagate it here.
                try {
                    const transportToken = this.transport.getSessionId();
                    if (transportToken && transportToken !== this.sessionId) {
                        this.acceptSessionId(transportToken);
                    }
                } catch {
                    // ignore transport session sync errors
                }

                return schema.parse(raw as unknown);
            } catch (e: unknown) {
                const status = (e as { status?: unknown })?.status;
                if (status === 401 || status === 403) {
                    try {
                        this.handleUnauthorizedResponse();
                    } catch {
                        // ignore unauthorized handler failures
                    }
                }
                throw e;
            }
        }
        const result = await this.performSend(
            payload,
            schema,
            retryCount,
            keepalive,
            options,
        );
        // Deterministic invalidation: any mutating RPC must invalidate
        // short-lived read-only response cache to avoid serving stale data
        // that contradicts engine truth.
        try {
            this.transport.clearResponseCache();
        } catch {
            // ignore cache invalidation errors
        }
        return result;
    }

    // Synchronously destroy the adapter and release resources.
    public destroy(): void {
        try {
            this.heartbeat.dispose();
        } catch (err) {
            infraLogger.warn(
                {
                    scope: "rpc",
                    event: "destroy_error",
                    message: "RPC adapter destroy failed while disposing heartbeat",
                },
                err instanceof Error ? err : { error: String(err) },
            );
        }
        try {
            for (const ctrl of Array.from(this.activeControllers)) {
                try {
                    ctrl.abort();
                } catch (err) {
                    if (!isAbortError(err)) {
                        infraLogger.warn(
                            {
                                scope: "rpc",
                                event: "abort_controller_error",
                                message:
                                    "RPC adapter destroy failed to abort request controller",
                            },
                            err instanceof Error
                                ? err
                                : { error: String(err) },
                        );
                    }
                }
            }
        } finally {
            this.activeControllers.clear();
        }
    }

    private async mutate(method: string, args: Record<string, unknown> = {}) {
        await this.send({ method, arguments: args }, zRpcSuccess);
    }

    private resolveEndpointUrl(): URL | null {
        if (typeof window === "undefined") {
            return null;
        }
        try {
            return new URL(this.endpoint, window.location.origin);
        } catch {
            return null;
        }
    }

    public async handshake(): Promise<TransmissionSessionSettings> {
        return this.handshakeOnce();
    }

    private async handshakeOnce(
        reason: string = "no-session-id",
    ): Promise<TransmissionSessionSettings> {
        if (this.handshakePromise) {
            return this.handshakePromise;
        }
        if (this.sessionId && this.sessionSettingsCache) {
            return this.sessionSettingsCache;
        }
        if (this.handshakeState === "idle") {
            this.handshakeState = "invalid";
        }
        this.transitionHandshakeState("handshaking", reason);
        const promise = (async () => {
            try {
                const result = await this.performHandshake();
                this.handshakeResult = result;
                this.transitionHandshakeState("ready", "handshake-ok");
                return result;
            } catch (error) {
                this.transitionHandshakeState("invalid", "handshake-failure");
                throw error;
            } finally {
                this.handshakePromise = undefined;
            }
        })();
        this.handshakePromise = promise;
        return promise;
    }

    private async performHandshake(): Promise<TransmissionSessionSettings> {
        const result = await this.send(
            { method: "session-get" },
            zTransmissionSessionSettings,
            0,
            false,
            { bypassHandshake: true },
        );
        this.sessionSettingsCache = result;
        this.engineInfoCache = undefined;

        return result;
    }

    private syncIdMap(torrents: TransmissionTorrent[]) {
        const seen = new Set<string>();
        torrents.forEach((torrent) => {
            this.idMap.set(torrent.hashString, torrent.id);
            seen.add(torrent.hashString);
        });
        for (const key of Array.from(this.idMap.keys())) {
            if (!seen.has(key)) {
                this.idMap.delete(key);
            }
        }
    }

    private async refreshIdMap() {
        const torrents = await this.fetchTransmissionTorrents();
        this.syncIdMap(torrents);
    }

    /**
     * Fetch a lightweight delta of recently-active torrents using
     * Transmission's `ids: "recently-active"` feature. Returns the array
     * of transmission-format torrents and an optional `removed` array.
     */
    public async fetchRecentlyActiveTransmission(): Promise<{
        torrents: TransmissionTorrent[];
        removed?: number[];
    }> {
        const response = await this.performSend(
            {
                method: "torrent-get",
                arguments: {
                    ids: "recently-active",
                    fields: SUMMARY_FIELDS,
                },
            },
            zTransmissionRecentlyActiveResponse,
        );

        return {
            torrents: response?.torrents ?? [],
            removed: Array.isArray(response?.removed) ? response.removed : [],
        };
    }

    /**
     * Adapter-level helper for HeartbeatManager: return a normalized delta
     * payload (TorrentEntity[]) and removed ids when supported.
     */
    public async getRecentlyActive(): Promise<{
        torrents: TorrentEntity[];
        removed?: number[];
    }> {
        const { torrents, removed } =
            await this.fetchRecentlyActiveTransmission();
        const normalized = torrents.map(normalizeTorrent);
        return { torrents: normalized, removed };
    }

    private async resolveRpcId(id: string) {
        const mapped = this.idMap.get(id);
        if (mapped !== undefined) return mapped;
        const parsed = Number(id);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
        try {
            const torrent =
                await this.fetchTransmissionTorrentSummaryByIdentifier(id);
            this.idMap.set(torrent.hashString, torrent.id);
            return torrent.id;
        } catch (error) {
            if (
                error instanceof Error &&
                !error.message.includes("not found")
            ) {
                throw error;
            }
            await this.refreshIdMap();
            const refreshed = this.idMap.get(id);
            if (refreshed !== undefined) return refreshed;
            throw error instanceof Error
                ? error
                : new Error(`Torrent ${id} not found`);
        }
    }

    private async resolveIds(ids: string[]) {
        const resolved: number[] = [];
        for (const id of ids) {
            resolved.push(await this.resolveRpcId(id));
        }
        return resolved;
    }

    private async queueOperation(method: string, ids: number[]) {
        await this.mutate(method, { ids });
    }

    public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
        const settings = await this.send(
            { method: "session-get" },
            zTransmissionSessionSettings,
        );
        return settings;
    }

    public async detectEngine(): Promise<EngineInfo> {
        if (this.engineInfoCache) {
            return this.engineInfoCache;
        }
        const settings =
            this.sessionSettingsCache ?? (await this.fetchSessionSettings());
        const version =
            settings.version ??
            (settings["rpc-version"]
                ? String(settings["rpc-version"])
                : undefined);
        const info: EngineInfo = {
            type: "transmission",
            name: "Transmission",
            version,
            capabilities: {
                sequentialDownload: false,
                superSeeding: false,
                trackerReannounce: true,
            },
        };
        this.engineInfoCache = info;
        return info;
    }

    public getServerClass(): ServerClass {
        return this.serverClass;
    }

    public getCapabilities(): EngineRuntimeCapabilities {
        return {
            executionModel: "remote",
            hasHostFileSystemAccess: false,
            canCheckFreeSpace: Boolean(this.checkFreeSpace),
        };
    }

    public async updateSessionSettings(
        settings: Partial<TransmissionSessionSettings>,
    ): Promise<void> {
        await this.send(
            { method: "session-set", arguments: settings },
            zRpcSuccess,
        );
        this.sessionSettingsCache = {
            ...(this.sessionSettingsCache ?? {}),
            ...settings,
        };
    }

    public async testPort(): Promise<boolean> {
        const result = await this.send(
            { method: "session-test" },
            z.object({ portIsOpen: z.boolean().optional() }),
        );
        return Boolean(result.portIsOpen);
    }

    public async fetchSessionStats(): Promise<TransmissionSessionStats> {
        try {
            const stats = await this.send(
                { method: "session-stats" },
                zSessionStats,
            );
            return stats;
        } catch (error) {
            // Best-effort fallback: log and return zeroed stats to avoid
            // disconnecting the UI on malformed or partial RPC responses.
            infraLogger.warn(
                {
                    scope: "rpc",
                    event: "session_stats_parse_failed",
                    message:
                        "Failed to parse session-stats; returning zeroed fallback stats",
                },
                error instanceof Error ? error : { error: String(error) },
            );
            const zeroTotals = {
                uploadedBytes: 0,
                downloadedBytes: 0,
                filesAdded: 0,
                secondsActive: 0,
                sessionCount: 0,
            };
            return {
                activeTorrentCount: 0,
                downloadSpeed: 0,
                pausedTorrentCount: 0,
                torrentCount: 0,
                uploadSpeed: 0,
                dhtNodes: 0,
                cumulativeStats: zeroTotals,
                currentStats: zeroTotals,
            };
        }
    }

    public async getSessionStats(): Promise<SessionStats> {
        const stats = await this.fetchSessionStats();
        return {
            downloadSpeed: stats.downloadSpeed,
            uploadSpeed: stats.uploadSpeed,
            torrentCount: stats.torrentCount,
            activeTorrentCount: stats.activeTorrentCount,
            pausedTorrentCount: stats.pausedTorrentCount,
            dhtNodes: stats.dhtNodes === undefined ? undefined : stats.dhtNodes,
            // DHT node counts are not provided reliably; telemetry indicators live in fetchNetworkTelemetry()
        };
    }

    public subscribeToHeartbeat(
        params: HeartbeatSubscriberParams,
    ): HeartbeatSubscription {
        return this.heartbeat.subscribe(params);
    }

    /**
     * Return the engine-owned speed history for a torrent.
     * This delegates to the internal HeartbeatManager which maintains fixed-length buffers.
     */
    public async getSpeedHistory(
        id: string,
    ): Promise<{ down: number[]; up: number[] }> {
        try {
            // HeartbeatManager provides a synchronous getter that returns copies of buffers.
            // Call it directly and return the result as a resolved Promise.
            const data = this.heartbeat.getSpeedHistory(id);
            return Promise.resolve(data);
        } catch {
            return Promise.resolve({ down: [], up: [] });
        }
    }

    public async closeSession(): Promise<void> {
        await this.mutate("session-close");
    }
    /**
     * Reset local adapter/transport session state without sending a
     * mutating RPC. This allows the UI to request a light-weight reconnect
     * without invoking `session-close` on the engine.
     */
    public resetConnection(): void {
        try {
            this.transport.resetSession();
        } catch {
            // ignore transport reset errors
        }
        try {
            // Ensure adapter-level session state is considered invalid so
            // a subsequent handshake/probe will run.
            this.invalidateSession("reset-connection");
        } catch {
            // ignore local session invalidation errors
        }
    }
    public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        const normalizedPath = path.trim();
        const fallbackCandidates =
            TransmissionAdapter.buildFreeSpaceFallbackCandidates(normalizedPath);

        let lastError: unknown = null;
        const attemptedCandidates: string[] = [];
        for (const candidate of fallbackCandidates) {
            attemptedCandidates.push(candidate);
            infraLogger.debug({
                scope: "rpc",
                event: "free_space_candidate_start",
                message: "Attempting free-space candidate",
                details: {
                    requestedPath: normalizedPath,
                    candidate,
                },
            });
            try {
                const fs = await this.send(
                    { method: "free-space", arguments: { path: candidate } },
                    zTransmissionFreeSpace,
                );
                infraLogger.debug({
                    scope: "rpc",
                    event: "free_space_candidate_ok",
                    message: "Free-space candidate succeeded",
                    details: {
                        requestedPath: normalizedPath,
                        candidate,
                        reportedPath: fs.path,
                        sizeBytes: fs.sizeBytes,
                        totalSize: fs.totalSize,
                    },
                });
                return fs;
            } catch (error) {
                lastError = error;
                infraLogger.debug({
                    scope: "rpc",
                    event: "free_space_candidate_error",
                    message: "Free-space candidate failed",
                    details: {
                        requestedPath: normalizedPath,
                        candidate,
                        errorMessage:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                });
            }
        }

        const lastMessage =
            lastError instanceof Error
                ? lastError.message
                : "free-space failed";
        throw new Error(
            `free-space failed for "${normalizedPath}". tried: ${attemptedCandidates.join(" -> ")}. ${lastMessage}`,
        );
    }

    private static buildFreeSpaceFallbackCandidates(path: string): string[] {
        const trimmed = path.trim();
        if (!trimmed) {
            return [];
        }

        const dedupe = (values: string[]) => Array.from(new Set(values));

        const windowsDriveMatch = trimmed.match(/^([a-zA-Z]):[\\/]/);
        if (windowsDriveMatch) {
            const drive = windowsDriveMatch[1].toUpperCase();
            const normalized = `${drive}:${trimmed.slice(2)}`.replace(
                /\//g,
                "\\",
            );
            const withoutTrailing = normalized.replace(/[\\]+$/g, "");
            const rest = withoutTrailing.slice(3);
            const segments = rest
                ? rest.split("\\").filter((segment) => segment.length > 0)
                : [];
            const candidates: string[] = [
                normalized,
                normalized.replace(/\\/g, "/"),
                withoutTrailing,
                withoutTrailing.replace(/\\/g, "/"),
            ];
            for (let length = segments.length - 1; length >= 0; length -= 1) {
                if (length === 0) {
                    candidates.push(`${drive}:\\`);
                    candidates.push(`${drive}:/`);
                    continue;
                }
                const backslashCandidate = `${drive}:\\${segments
                    .slice(0, length)
                    .join("\\")}`;
                candidates.push(backslashCandidate);
                candidates.push(backslashCandidate.replace(/\\/g, "/"));
            }
            return dedupe(candidates);
        }

        if (/^\\\\/.test(trimmed)) {
            const normalized = trimmed.replace(/\//g, "\\");
            const withoutPrefix = normalized.replace(/^\\\\/, "");
            const segments = withoutPrefix
                .split("\\")
                .filter((segment) => segment.length > 0);
            const candidates: string[] = [normalized];
            for (let length = segments.length - 1; length >= 2; length -= 1) {
                candidates.push(`\\\\${segments.slice(0, length).join("\\")}`);
            }
            return dedupe(candidates);
        }

        if (trimmed.startsWith("/")) {
            const withoutTrailing = trimmed.replace(/\/+$/g, "") || "/";
            const segments = withoutTrailing
                .split("/")
                .filter((segment) => segment.length > 0);
            const candidates: string[] = [trimmed, withoutTrailing];
            for (let length = segments.length - 1; length >= 0; length -= 1) {
                if (length === 0) {
                    candidates.push("/");
                    continue;
                }
                candidates.push(`/${segments.slice(0, length).join("/")}`);
            }
            return dedupe(candidates);
        }

        return [trimmed];
    }

    private async fetchTransmissionTorrents(): Promise<TransmissionTorrent[]> {
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                },
            },
            zTransmissionTorrentArray,
        );
        return list as TransmissionTorrent[];
    }

    private async fetchTransmissionTorrentSummaryByIdentifier(
        identifier: string | number,
    ): Promise<TransmissionTorrent> {
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                    ids: [identifier],
                },
            },
            zTransmissionTorrentArray,
        );
        const [torrent] = list as TransmissionTorrent[];
        if (!torrent) {
            throw new Error(`Torrent ${identifier} not found`);
        }
        return torrent as TransmissionTorrent;
    }

    private async fetchTransmissionTorrentDetails(
        id: number,
        options?: TorrentDetailsRequestOptions,
    ): Promise<TransmissionTorrentDetail> {
        const detail = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: buildDetailFields(options),
                    ids: [id],
                },
            },
            zTransmissionTorrentDetailSingle,
        );
        if (!detail) {
            throw new Error(`Torrent ${id} not found`);
        }
        return detail as TransmissionTorrentDetail;
    }

    public async getTorrents(): Promise<TorrentEntity[]> {
        const torrents = await this.fetchTransmissionTorrents();
        this.syncIdMap(torrents);
        return torrents.map(normalizeTorrent);
    }

    public async getTorrentDetails(
        id: string,
        options?: TorrentDetailsRequestOptions,
    ): Promise<TorrentDetailEntity> {
        const rpcId = await this.resolveRpcId(id);
        const detail = await this.fetchTransmissionTorrentDetails(rpcId, options);
        this.idMap.set(detail.hashString, detail.id);
        return normalizeTorrentDetail(detail);
    }

    /**
     * Bulk fetch details to prevent N+1 request storms when multiple rows
     * subscribe to details simultaneously.
     */
    public async getTorrentDetailsBulk(
        ids: string[],
        options?: TorrentDetailsRequestOptions,
    ): Promise<TorrentDetailEntity[]> {
        const rpcIds = await this.resolveIds(ids);
        if (rpcIds.length === 0) return [];

        const response = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: buildDetailFields(options),
                    ids: rpcIds,
                },
            },
            zTransmissionTorrentDetailArray,
        );

        const results: TorrentDetailEntity[] = [];
        for (const detail of response as TransmissionTorrentDetail[]) {
            if (detail.hashString && typeof detail.id === "number") {
                try {
                    this.idMap.set(detail.hashString, detail.id);
                } catch {
                    // ignore id map update errors
                }
            }
            results.push(normalizeTorrentDetail(detail));
        }
        return results;
    }

    public async addTorrent(
        payload: AddTorrentPayload,
    ): Promise<AddTorrentResult> {
        const args: Record<string, unknown> = {
            paused: payload.paused,
        };
        if (payload.downloadDir?.trim()) {
            args["download-dir"] = payload.downloadDir;
        }
        if (payload.metainfoPath) {
            args["metainfo-path"] = payload.metainfoPath;
        } else if (payload.metainfo) {
            args.metainfo = payload.metainfo;
        } else if (payload.magnetLink) {
            args.filename = payload.magnetLink;
        } else {
            throw new Error("No torrent source provided");
        }
        if (payload.filesUnwanted?.length) {
            args["files-unwanted"] = payload.filesUnwanted;
        }

        if (payload.priorityHigh?.length) {
            args["priority-high"] = payload.priorityHigh;
        }
        if (payload.priorityNormal?.length) {
            args["priority-normal"] = payload.priorityNormal;
        }
        if (payload.priorityLow?.length) {
            args["priority-low"] = payload.priorityLow;
        }

        const response = await this.send(
            { method: "torrent-add", arguments: args },
            zTransmissionAddTorrentResponse,
        );
        const addedTorrent = response["torrent-added"];
        const duplicateTorrent = response["torrent-duplicate"];
        const torrentEntry = addedTorrent ?? duplicateTorrent;
        if (!torrentEntry?.hashString) {
            throw new Error("Torrent add did not return an identifier");
        }

        const duplicate = Boolean(duplicateTorrent);
        const rpcId = torrentEntry.id;
        if (typeof rpcId !== "number" || !Number.isFinite(rpcId)) {
            throw new Error(
                "Torrent add did not return a numeric RPC identifier",
            );
        }

        try {
            this.idMap.set(torrentEntry.hashString, rpcId);
        } catch {
            // ignore idMap errors
        }

        return {
            id: torrentEntry.hashString,
            rpcId,
            name: torrentEntry.name,
            duplicate,
        };
    }

    public async pause(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.stopTorrents(rpcIds);
    }

    public async resume(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.startTorrents(rpcIds);
    }

    public async startNow(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.startTorrents(rpcIds, true);
    }

    public async verify(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.verifyTorrents(rpcIds);
    }

    public async moveToTop(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-top", rpcIds);
    }

    public async moveUp(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-up", rpcIds);
    }

    public async moveDown(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-down", rpcIds);
    }

    public async moveToBottom(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-bottom", rpcIds);
    }

    public async remove(ids: string[], deleteData = false): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.mutate("torrent-remove", {
            ids: rpcIds,
            "delete-local-data": deleteData,
        });
        ids.forEach((id) => {
            this.idMap.delete(id);
        });
    }

    /**
     * Remove torrents with optional data deletion.
     * @param idsOrId - Single torrent ID or array of IDs.
     * @param deleteData - Whether to delete downloaded files from disk.
     */
    public async removeTorrents(
        idsOrId: string | string[],
        deleteData: boolean = false,
    ): Promise<void> {
        const ids = Array.isArray(idsOrId) ? idsOrId : [idsOrId];
        await this.mutate("torrent-remove", {
            ids,
            "delete-local-data": deleteData,
        });
    }

    public async updateFileSelection(
        id: string,
        indexes: number[],
        wanted: boolean,
    ): Promise<void> {
        if (!indexes.length) return;
        const key = wanted ? "files-wanted" : "files-unwanted";
        const rpcId = await this.resolveRpcId(id);
        await this.mutate("torrent-set", {
            ids: [rpcId],
            [key]: indexes,
        });
    }

    public async setSequentialDownload(id: string, enabled: boolean): Promise<void> {
        const rpcId = await this.resolveRpcId(id);
        await this.mutate("torrent-set", {
            ids: [rpcId],
            sequentialDownload: enabled,
        });
    }

    public async setSuperSeeding(id: string, enabled: boolean): Promise<void> {
        const rpcId = await this.resolveRpcId(id);
        await this.mutate("torrent-set", {
            ids: [rpcId],
            superSeeding: enabled,
        });
    }

    public async addTrackers(ids: string[], trackers: string[]): Promise<void> {
        if (!ids.length) return;
        const trackerAdd = trackers.map((tracker) => tracker.trim()).filter((tracker) => tracker.length > 0);
        if (!trackerAdd.length) return;
        const rpcIds = await this.resolveIds(ids);
        await this.mutate("torrent-set", {
            ids: rpcIds,
            trackerAdd,
        });
    }

    public async removeTrackers(ids: string[], trackerIds: number[]): Promise<void> {
        if (!ids.length) return;
        const trackerRemove = trackerIds.filter((trackerId) => Number.isFinite(trackerId));
        if (!trackerRemove.length) return;
        const rpcIds = await this.resolveIds(ids);
        await this.mutate("torrent-set", {
            ids: rpcIds,
            trackerRemove,
        });
    }

    public async replaceTrackers(ids: string[], trackers: string[]): Promise<void> {
        if (!ids.length) return;
        const trackerList = trackers.map((tracker) => tracker.trim()).filter((tracker) => tracker.length > 0).join("\n");
        if (!trackerList.length) return;
        const rpcIds = await this.resolveIds(ids);
        await this.mutate("torrent-set", {
            ids: rpcIds,
            trackerList,
        });
    }

    public async forceTrackerReannounce(id: string): Promise<void> {
        const rpcId = await this.resolveRpcId(id);
        await this.send(
            {
                method: "torrent-reannounce",
                arguments: {
                    ids: [rpcId],
                },
            },
            zRpcSuccess,
        );
    }

    public async startTorrents(ids: number[], now = false): Promise<void> {
        const method = now ? "torrent-start-now" : "torrent-start";
        await this.mutate(method, { ids });
    }

    public async stopTorrents(ids: number[]): Promise<void> {
        await this.mutate("torrent-stop", { ids });
    }

    public async verifyTorrents(ids: number[]): Promise<void> {
        await this.mutate("torrent-verify", { ids });
    }

    public async renameTorrentPath(
        id: number,
        path: string,
        name: string,
    ): Promise<TransmissionTorrentRenameResult> {
        const result = await this.send(
            {
                method: "torrent-rename-path",
                arguments: {
                    ids: [id],
                    path,
                    name,
                },
            },
            zTransmissionTorrentRenameResult,
        );
        return result;
    }

    public async setTorrentLocation(
        ids: number | number[],
        location: string,
        moveData?: boolean,
    ): Promise<void>;
    public async setTorrentLocation(
        id: string,
        location: string,
        moveData?: boolean,
    ): Promise<void>;
    public async setTorrentLocation(
        idsOrId: number | number[] | string,
        location: string,
        moveData = true,
    ): Promise<void> {
        const ids =
            typeof idsOrId === "string"
                ? [await this.resolveRpcId(idsOrId)]
                : Array.isArray(idsOrId)
                  ? idsOrId
                  : [idsOrId];
        await this.mutate("torrent-set-location", {
            ids,
            location,
            move: moveData,
        });
    }

    public async setBandwidthGroup(
        options: TransmissionBandwidthGroupOptions,
    ): Promise<void> {
        const args: Record<string, unknown> = { name: options.name };
        if (options.honorsSessionLimits !== undefined) {
            args["honors-session-limits"] = options.honorsSessionLimits;
        }
        if (options.speedLimitDown !== undefined) {
            args["speed-limit-down"] = options.speedLimitDown;
        }
        if (options.speedLimitDownEnabled !== undefined) {
            args["speed-limit-down-enabled"] = options.speedLimitDownEnabled;
        }
        if (options.speedLimitUp !== undefined) {
            args["speed-limit-up"] = options.speedLimitUp;
        }
        if (options.speedLimitUpEnabled !== undefined) {
            args["speed-limit-up-enabled"] = options.speedLimitUpEnabled;
        }
        await this.mutate("group-set", args);
    }

    public async fetchNetworkTelemetry(): Promise<NetworkTelemetry | null> {
        const now = Date.now();
        // Return cached value if fresh
        if (
            this.networkTelemetryCache &&
            !this.networkTelemetryCache.inflight &&
            now - this.networkTelemetryCache.ts < this.NETWORK_TELEMETRY_TTL_MS
        ) {
            return this.networkTelemetryCache.value;
        }
        // If a fetch is already in-flight, return the same promise to dedupe.
        // Use a dedicated lock so callers can't race before `networkTelemetryCache` is installed.
        if (this._networkTelemetryInflight)
            return this._networkTelemetryInflight;

        const previousCache = this.networkTelemetryCache;
        const inflight = (async (): Promise<NetworkTelemetry | null> => {
            try {
                // Deterministic telemetry resolution (guarantee downloadDirFreeSpace or null)
                const settings = await this.send(
                    { method: "session-get" },
                    zTransmissionSessionSettings,
                );
                const asAny = settings as Record<string, unknown>;

                const telemetry: NetworkTelemetry = {
                    dhtEnabled:
                        typeof asAny["dht-enabled"] === "boolean"
                            ? (asAny["dht-enabled"] as boolean)
                            : undefined,
                    pexEnabled:
                        typeof asAny["pex-enabled"] === "boolean"
                            ? (asAny["pex-enabled"] as boolean)
                            : undefined,
                    lpdEnabled:
                        typeof asAny["lpd-enabled"] === "boolean"
                            ? (asAny["lpd-enabled"] as boolean)
                            : undefined,
                    portForwardingEnabled:
                        typeof asAny["port-forwarding-enabled"] === "boolean"
                            ? (asAny["port-forwarding-enabled"] as boolean)
                            : undefined,
                    altSpeedEnabled:
                        typeof asAny["alt-speed-enabled"] === "boolean"
                            ? (asAny["alt-speed-enabled"] as boolean)
                            : undefined,
                    // Attempt to read engine-provided free-space value (Transmission variant keys)
                    downloadDirFreeSpace:
                        typeof asAny["download-dir-free-space"] === "number"
                            ? (asAny["download-dir-free-space"] as number)
                            : typeof asAny["downloadDirFreeSpace"] === "number"
                              ? (asAny["downloadDirFreeSpace"] as number)
                              : undefined,
                    downloadQueueEnabled:
                        typeof asAny["download-queue-enabled"] === "boolean"
                            ? (asAny["download-queue-enabled"] as boolean)
                            : undefined,
                    seedQueueEnabled:
                        typeof asAny["seed-queue-enabled"] === "boolean"
                            ? (asAny["seed-queue-enabled"] as boolean)
                            : undefined,
                };

                // If engine provided a concrete free-space value, we're done.
                if (typeof telemetry.downloadDirFreeSpace === "number") {
                    return telemetry;
                }

                // Fallback: resolve download directory and call free-space RPC (engine-supported).
                const downloadDir =
                    typeof asAny["download-dir"] === "string"
                        ? (asAny["download-dir"] as string)
                        : typeof asAny["downloadDir"] === "string"
                          ? (asAny["downloadDir"] as string)
                          : undefined;

                if (!downloadDir) {
                    // Deterministic failure: telemetry unavailable for this engine.
                    return null;
                }

                // Only call free-space RPC when necessary; may be expensive.
                const fs = await this.checkFreeSpace(downloadDir);
                if (!fs || typeof fs.sizeBytes !== "number") {
                    return null;
                }

                telemetry.downloadDirFreeSpace = fs.sizeBytes;
                infraLogger.debug({
                    scope: "rpc",
                    event: "network_telemetry_normalized",
                    message:
                        "Normalized network telemetry from free-space fallback",
                    details: { telemetry },
                });
                return telemetry;
            } catch (err) {
                // Best-effort: on error, return null instead of throwing so callers
                // can treat telemetry as optional and avoid thundering-herd errors.
                infraLogger.debug({
                    scope: "rpc",
                    event: "network_telemetry_fetch_failed",
                    message: "Network telemetry fetch failed; returning null",
                    details: {
                        errorMessage:
                            err instanceof Error ? err.message : String(err),
                    },
                });
                infraLogger.debug(
                    {
                        scope: "rpc",
                        event: "network_telemetry_fetch_failed_error",
                        message:
                            "Network telemetry fetch failure detail (stack/object)",
                    },
                    err instanceof Error ? err : { error: String(err) },
                );
                return null;
            }
        })();

        // Install inflight lock and cache shim synchronously to prevent races
        this._networkTelemetryInflight = inflight;
        this.networkTelemetryCache = {
            value: previousCache?.value ?? null,
            ts: previousCache?.ts ?? 0,
            inflight,
        };
        try {
            const result = await inflight;
            this.networkTelemetryCache.value = result;
            this.networkTelemetryCache.ts = Date.now();
            this.networkTelemetryCache.inflight = undefined;
            return result;
        } catch {
            // On error, record the failure time so we don't retry on every
            // heartbeat tick; preserve previous cached value but enforce a
            // back-off equal to NETWORK_TELEMETRY_TTL_MS.
            if (this.networkTelemetryCache) {
                this.networkTelemetryCache.inflight = undefined;
                this.networkTelemetryCache.ts = Date.now();
            }
            return null;
        } finally {
            this._networkTelemetryInflight = undefined;
        }
    }
}
