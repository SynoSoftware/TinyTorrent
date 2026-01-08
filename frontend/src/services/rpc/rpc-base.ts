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
    DirectoryBrowseResult,
    TransmissionSessionSettings,
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionTorrentTracker,
    TransmissionTorrentPeer,
    TransmissionFreeSpace,
    TransmissionSessionStats,
    TransmissionBandwidthGroupOptions,
    TransmissionTorrentRenameResult,
    SystemInstallOptions,
    SystemInstallResult,
} from "./types";
import { z } from "zod";
import {
    parseRpcResponse,
    zTransmissionTorrentArray,
    zTransmissionTorrentDetailSingle,
    zSessionStats,
    zTransmissionSessionSettings,
    zTransmissionFreeSpace,
    zDirectoryBrowseResponse,
    zTinyTorrentCapabilitiesNormalized,
    zSystemAutorunStatus,
    zSystemHandlerStatus,
    zTransmissionTorrentRenameResult,
    zSystemInstallResult,
    zRpcSuccess,
    zTransmissionAddTorrentResponse,
    getTorrentList,
    getSessionStats,
} from "@/services/rpc/schemas";
import {
    CONFIG,
    FOCUS_RESTORE_DELAY_MS,
    WS_RECONNECT_INITIAL_DELAY_MS,
    WS_RECONNECT_MAX_DELAY_MS,
} from "@/config/logic";
import type { EngineAdapter } from "./engine-adapter";
import { NativeShell } from "@/app/runtime";
import { HeartbeatManager } from "./heartbeat";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "./heartbeat";
import type {
    TorrentEntity,
    TorrentDetailEntity,
    TorrentTrackerEntity,
    TorrentPeerEntity,
    AddTorrentPayload,
    AddTorrentResult,
    SessionStats,
    EngineInfo,
    LibtorrentPriority,
    TinyTorrentCapabilities,
    AutorunStatus,
    SystemHandlerStatus,
    ServerClass,
} from "./entities";
import { normalizeTorrent, normalizeTorrentDetail } from "./normalizers";
import { RpcCommandError } from "./errors";
import { TransmissionRpcTransport } from "../transport";
import type { NetworkTelemetry } from "./entities";

type RpcRequest<M extends string> = {
    method: M;
    arguments?: Record<string, unknown>;
    tag?: number;
};

type RpcResponse<T> = {
    result: string;
    arguments: T;
    tag?: number;
};

type TorrentGetResponse<T> = {
    torrents: T[];
};

type HandshakeState = "idle" | "handshaking" | "ready" | "invalid";

type RpcSendOptions = {
    bypassHandshake?: boolean;
    _retry409?: boolean; // internal: guard to prevent infinite 409 retry loops
};

const READ_ONLY_RPC_METHODS = new Set([
    "torrent-get",
    "session-get",
    "session-stats",
    "tt-get-capabilities",
    "free-space",
]);
const READ_ONLY_RPC_RESPONSE_TTL_MS = Number.isFinite(
    (CONFIG as unknown as { performance?: { read_rpc_cache_ms?: number } })
        ?.performance?.read_rpc_cache_ms as number
)
    ? ((CONFIG as unknown as { performance?: { read_rpc_cache_ms?: number } })
          .performance!.read_rpc_cache_ms as number)
    : 0;

// Helper: stable deterministic stringify for request argument hashing
function stableStringify(value: unknown): string {
    if (value === undefined) {
        return "undefined";
    }

    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableStringify(record[key])}`
            )
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function buildReadRpcDedupKey(
    method: string,
    args?: Record<string, unknown>
): string {
    const serializedArgs = stableStringify(args ?? null);
    return `${method}:${serializedArgs}`;
}

const WARNING_THROTTLE_MS = 1000;
const recentWarningTs = new Map<string, number>();

const DEFAULT_ENDPOINT =
    import.meta.env.VITE_RPC_ENDPOINT ?? CONFIG.defaults.rpc_endpoint;

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
    "leftUntilDone",
    "sizeWhenDone",
    "error",
    "errorString",
    "sequentialDownload",
    "superSeeding",
    "isFinished",
    "downloadDir",
];

// Fields that change frequently and are safe to request on a delta poll.
const VOLATILE_FIELDS: Array<keyof TransmissionTorrent> = [
    "id",
    "status",
    "rateDownload",
    "rateUpload",
    "peersConnected",
    "percentDone",
    "eta",
    "queuePosition",
    "error",
    "errorString",
];

// A compact set of fields to request for recently-active deltas. We include
// a small subset of static fields (name, totalSize) so newly-added torrents
// look reasonable in the UI without requiring an immediate full fetch.
const DELTA_FIELDS: Array<keyof TransmissionTorrent> = [
    ...VOLATILE_FIELDS,
    // `hashString` is required by `normalizeTorrent` and by UI identity
    // (React keys). Include it so delta fetches supply a valid hash.
    "hashString",
    "name",
    "totalSize",
];

const DETAIL_FIELDS = [
    ...SUMMARY_FIELDS,
    "files",
    "fileStats",
    "trackers",
    "peers",
    "pieceCount",
    "pieceSize",
    "pieceStates",
    "pieceAvailability",
];

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
    private readonly activeControllers = new Set<AbortController>();
    // Track an in-flight promise for fetching extended capabilities to
    // prevent duplicated concurrent requests.
    private inflightGetCapabilities?: Promise<void>;
    // Rapid-call detector: tracks recent method call counts to detect
    // potential race conditions or buggy caller code.
    private readonly recentMethodCalls = new Map<
        string,
        { count: number; firstTs: number }
    >();
    private readonly METHOD_CALL_WINDOW_MS = 2000; // 2s
    private readonly METHOD_CALL_WARNING_THRESHOLD = 100;
    private tinyTorrentCapabilities?: TinyTorrentCapabilities | null;
    private websocketSession?: TinyTorrentWebSocketSession;
    private transport: TransmissionRpcTransport;
    private serverClass: ServerClass = "unknown";
    private handshakeState: HandshakeState = "invalid";
    private handshakePromise?: Promise<TransmissionSessionSettings>;
    private handshakeResult?: TransmissionSessionSettings;
    // (sessionIdRefreshPromise removed — Transport owns session-id probing)
    // Cache for potentially expensive network telemetry lookups (free-space).
    // Prevents invoking disk/FS checks on every websocket tick.
    private networkTelemetryCache?: {
        value: NetworkTelemetry | null;
        ts: number;
        inflight?: Promise<NetworkTelemetry | null>;
    };
    // Dedicated inflight lock to avoid races when two callers start telemetry
    // resolution concurrently before the cache object is installed.
    private _networkTelemetryInflight?: Promise<NetworkTelemetry | null>;
    private readonly NETWORK_TELEMETRY_TTL_MS = 60_000; // 60s

    private getTinyTorrentAuthToken(): string | undefined {
        const token = sessionStorage.getItem("tt-auth-token");
        return token && token.length > 0 ? token : undefined;
    }

    private clearTinyTorrentAuthToken() {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem("tt-auth-token");
        }
    }

    private handleUnauthorizedResponse() {
        this.clearTinyTorrentAuthToken();
        this.invalidateSession("unauthorized");
        this.closeWebSocketSession();
    }

    private transitionHandshakeState(next: HandshakeState, reason: string) {
        const prev = this.handshakeState;
        if (prev === next) return;
        if (prev === "invalid" && next === "handshaking") {
            console.debug(
                "[tiny-torrent][rpc] session invalid -> handshaking",
                {
                    reason,
                }
            );
        } else if (prev === "handshaking" && next === "ready") {
            console.debug("[tiny-torrent][rpc] handshaking -> ready", {
                reason,
            });
        } else if (prev === "ready" && next === "invalid") {
            console.debug("[tiny-torrent][rpc] ready -> invalid", { reason });
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

    constructor(options?: {
        endpoint?: string;
        username?: string;
        password?: string;
        requestTimeout?: number;
    }) {
        this.endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
        this.username = options?.username ?? "";
        this.password = options?.password ?? "";
        this.requestTimeout = options?.requestTimeout;
        // Transport encapsulates Transmission session id handling and probing
        this.transport = new TransmissionRpcTransport(this.endpoint);
    }

    private isAbortError(err: unknown): boolean {
        if (!err) return false;
        try {
            const e = err as unknown;
            if (typeof e === "object" && e !== null) {
                const name = (e as { name?: unknown }).name;
                if (name === "AbortError") return true;
                const message = (e as { message?: unknown }).message;
                if (typeof message === "string" && /abort(ed)?/i.test(message))
                    return true;
            }
            return false;
        } catch {
            return false;
        }
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
        options?: RpcSendOptions
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
                this.requestTimeout
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
                        console.warn(
                            `[tiny-torrent][rpc] Rapid repeated calls to RPC method '${m}' (${cur.count} times in ${this.METHOD_CALL_WINDOW_MS}ms). This may indicate a race condition or bad caller code.`
                        );
                        recentWarningTs.set(m, now);
                    }
                }
                // diagnostics removed: stack-trace logging for torrent-get storms
            } catch (e) {
                // Don't allow diagnostic code to interfere with normal RPC flow.
            }

            const attemptRequest = async (_attempt: number): Promise<T> => {
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };

                const ttAuth = this.getTinyTorrentAuthToken();
                if (ttAuth) {
                    headers["X-TT-Auth"] = ttAuth;
                }
                const transportSessionId = this.transport.getSessionId();
                if (transportSessionId) {
                    headers["X-Transmission-Session-Id"] = transportSessionId;
                }
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
                const response = await this.transport.fetchWithSession(
                    requestInit,
                    controller,
                    keepalive
                );

                if (response.status === 409) {
                    // Defensive: Transport should already handle 409/session-id
                    // negotiation. If we still observe a 409, attempt to accept
                    // any token present on the response, then fail fast so the
                    // caller can decide how to proceed.
                    try {
                        const hdrs = (response as Response | undefined)
                            ?.headers;
                        const token =
                            hdrs && typeof hdrs.get === "function"
                                ? hdrs.get("X-Transmission-Session-Id")
                                : null;
                        if (token) this.acceptSessionId(token);
                    } catch {}
                    this.invalidateSession("409-session-conflict");
                    throw new Error("Transmission RPC session conflict");
                }

                if (response.status === 401) {
                    this.handleUnauthorizedResponse();
                    throw new Error("TinyTorrent RPC unauthorized");
                }
                if (response.status === 403) {
                    this.handleUnauthorizedResponse();
                    throw new Error("TinyTorrent RPC forbidden");
                }

                if (!response.ok) {
                    throw new Error(
                        `Transmission RPC responded with ${response.status}`
                    );
                }
                // Accept session ID from any response that provides it. Per
                // Transmission semantics the `X-Transmission-Session-Id` header
                // can be present on 200 OK responses; treat it as authoritative
                // and install it so subsequent requests carry the correct
                // session context. This prevents handshake churn when servers
                // don't issue 409 for every new session token.
                const currentToken = response.headers.get(
                    "X-Transmission-Session-Id"
                );
                if (currentToken && currentToken !== this.sessionId) {
                    this.acceptSessionId(currentToken);
                }

                const json = await response.json();
                const parsed = parseRpcResponse(json);

                if (parsed.result !== "success") {
                    const code = parsed.result ?? "";
                    const lower = String(code).toLowerCase();
                    const methodNotFound =
                        /method|not\s*found|not\s*recognized/.test(lower);

                    // Special-case: the optional `tt-get-capabilities` extension
                    // may not be recognized by plain Transmission servers. Treat
                    // that as a non-fatal condition: mark the server as
                    // `transmission`, ensure websocket state is consistent, and
                    // return null so callers that expect capabilities can
                    // interpret absence as unsupported.
                    if (
                        methodNotFound &&
                        payload.method === "tt-get-capabilities"
                    ) {
                        this.tinyTorrentCapabilities = null;
                        this.serverClass = "transmission";
                        this.ensureWebsocketConnection();
                        console.debug(
                            "[tiny-torrent][rpc] tt-get-capabilities not recognized; marking serverClass=transmission"
                        );
                        return null as unknown as T;
                    }

                    if (methodNotFound) {
                        console.warn(
                            `[tiny-torrent][rpc] method not recognized for '${payload.method}': ${code}`
                        );
                        throw new RpcCommandError(
                            `Transmission RPC responded with ${code}`,
                            code
                        );
                    }

                    throw new RpcCommandError(
                        `Transmission RPC responded with ${parsed.result}`,
                        parsed.result
                    );
                }
                const args = parsed.arguments ?? {};
                try {
                    const shouldLog =
                        typeof sessionStorage !== "undefined" &&
                        sessionStorage.getItem(
                            "tt-debug-raw-torrent-detail"
                        ) === "2";
                    if (shouldLog && payload.method === "torrent-get") {
                        console.debug(
                            "[tiny-torrent][rpc-raw][torrent-get]",
                            args
                        );
                    }
                    try {
                        const shouldLogSessionGet =
                            typeof sessionStorage !== "undefined" &&
                            sessionStorage.getItem(
                                "tt-debug-raw-session-get"
                            ) === "1";
                        if (
                            shouldLogSessionGet &&
                            payload.method === "session-get"
                        ) {
                            console.debug(
                                "[tiny-torrent][rpc-raw][session-get]",
                                args
                            );
                        }
                    } catch (e) {
                        // ignore sessionStorage errors for session-get logging
                    }
                } catch (e) {
                    // ignore sessionStorage errors
                }
                return schema.parse(args as unknown) as T;
            };

            const requestPromise = (async () => {
                try {
                    return await attemptRequest(0);
                } catch (e) {
                    if (!this.isAbortError(e)) {
                        console.error("[tiny-torrent][rpc] send error:", e);
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
            if (!this.isAbortError(e)) {
                console.error("[tiny-torrent][rpc] send error:", e);
            }
            throw e;
        }
    }

    public async send<T>(
        payload: RpcRequest<string>,
        schema: z.ZodSchema<T>,
        retryCount = 0,
        keepalive = false,
        options?: RpcSendOptions
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
                } catch {}
                const raw = await this.transport.request(
                    payload.method!,
                    args,
                    { cache: cacheEnabled }
                );

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
                } catch {}

                return schema.parse(raw as unknown);
            } catch (e: unknown) {
                const status = (e as { status?: unknown })?.status;
                if (status === 401 || status === 403) {
                    try {
                        this.handleUnauthorizedResponse();
                    } catch {}
                }
                throw e;
            }
        }
        const result = await this.performSend(
            payload,
            schema,
            retryCount,
            keepalive,
            options
        );
        // Deterministic invalidation: any mutating RPC must invalidate
        // short-lived read-only response cache to avoid serving stale data
        // that contradicts engine truth.
        try {
            try {
                this.transport.clearResponseCache();
            } catch {}
        } catch {}
        return result;
    }

    // Synchronously destroy the adapter and release resources.
    public destroy(): void {
        try {
            this.heartbeat.disablePolling();
            // ensure heartbeat removes any global listeners it installed
            try {
                const hb = this.heartbeat as unknown as {
                    dispose?: () => void;
                };
                if (typeof hb.dispose === "function") {
                    hb.dispose();
                }
            } catch {}
        } catch (err) {
            // Log destroy errors instead of swallowing silently
            // eslint-disable-next-line no-console
            console.warn("[tiny-torrent][rpc] destroy error:", err);
        }
        try {
            this.closeWebSocketSession();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
                "[tiny-torrent][rpc] closeWebSocketSession error:",
                err
            );
        }
        try {
            for (const ctrl of Array.from(this.activeControllers)) {
                try {
                    ctrl.abort();
                } catch (err) {
                    if (!this.isAbortError(err)) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            "[tiny-torrent][rpc] abort controller error:",
                            err
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

    private updateServerClassFromCapabilities(
        capabilities: TinyTorrentCapabilities | null
    ) {
        if (!capabilities || !capabilities.serverClass) {
            this.serverClass = "unknown";
            return;
        }
        if (capabilities.serverClass === "tinytorrent") {
            this.serverClass = "tinytorrent";
            return;
        }
        if (capabilities.serverClass === "transmission") {
            this.serverClass = "transmission";
            return;
        }
        this.serverClass = "unknown";
    }

    private applyCapabilities(capabilities: TinyTorrentCapabilities | null) {
        this.tinyTorrentCapabilities = capabilities;
        this.updateServerClassFromCapabilities(capabilities);
        this.ensureWebsocketConnection();
    }
    private buildWebSocketBaseUrl(path: string): URL | null {
        if (!path) return null;
        try {
            if (path.startsWith("ws://") || path.startsWith("wss://")) {
                return new URL(path);
            }
            const endpointUrl = this.resolveEndpointUrl();
            if (!endpointUrl) {
                return null;
            }
            const scheme = endpointUrl.protocol === "https:" ? "wss" : "ws";
            const normalizedPath = path.startsWith("/") ? path : `/${path}`;
            return new URL(`${scheme}://${endpointUrl.host}${normalizedPath}`);
        } catch {
            return null;
        }
    }

    private closeWebSocketSession() {
        this.websocketSession?.stop();
        this.websocketSession = undefined;
    }

    private ensureWebsocketConnection() {
        if (!this.hasWebsocketSupport()) {
            this.closeWebSocketSession();
            return;
        }
        const endpointPath =
            this.tinyTorrentCapabilities?.websocketEndpoint ??
            this.tinyTorrentCapabilities?.websocketPath;
        if (!endpointPath) {
            this.closeWebSocketSession();
            return;
        }
        const wsBaseUrl = this.buildWebSocketBaseUrl(endpointPath);
        if (!wsBaseUrl) {
            this.closeWebSocketSession();
            return;
        }
        if (!this.websocketSession) {
            this.websocketSession = new TinyTorrentWebSocketSession({
                getToken: () => this.getTinyTorrentAuthToken(),
                onUpdate: this.handleLiveStateUpdate,
                onConnected: () => this.heartbeat.disablePolling(),
                onDisconnected: () => this.heartbeat.enablePolling(),
                onUiFocus: () => {
                    const self = this as unknown as {
                        handleUiFocusSignal?: () => void;
                    };
                    if (typeof self.handleUiFocusSignal === "function") {
                        self.handleUiFocusSignal();
                    }
                },
                onError: (error) => {
                    console.error("[tiny-torrent][ws]", error);
                },
            });
        }
        this.websocketSession.start(wsBaseUrl);
    }

    public async refreshExtendedCapabilities(force = false): Promise<void> {
        if (
            !force &&
            this.tinyTorrentCapabilities !== undefined &&
            this.tinyTorrentCapabilities !== null
        ) {
            this.ensureWebsocketConnection();
            return;
        }
        // Prevent duplicated concurrent tt-get-capabilities calls. If one is
        // already in flight, await it instead of firing another request.
        if (this.inflightGetCapabilities) {
            try {
                await this.inflightGetCapabilities;
            } catch {
                // swallow here; the inflight promise will have already
                // logged details if it failed.
            }
            return;
        }

        this.inflightGetCapabilities = (async () => {
            try {
                const response = await this.send(
                    { method: "tt-get-capabilities" },
                    zTinyTorrentCapabilitiesNormalized,
                    0,
                    false,
                    { bypassHandshake: true }
                );
                this.applyCapabilities(response);
            } catch (error) {
                // If the server doesn't recognize our extension method, it's
                // almost certainly a plain Transmission server. Treat that as a
                // non-fatal condition and mark the server class to avoid
                // repeatedly attempting the same unsupported RPC.
                // If the capabilities RPC failed with a command error, the
                try {
                    try {
                        // Ensure transport aborts any internal fetches it is tracking.
                        const t = this.transport as unknown as {
                            abortAll?: () => void;
                        };
                        t.abortAll?.();
                    } catch {}
                } catch {}
                // server likely does not support our extension. Treat any
                // RpcCommandError as the server not supporting `tt-get-capabilities`
                // to avoid failing the handshake flow due to an optional method.
                if (error instanceof RpcCommandError) {
                    this.tinyTorrentCapabilities = null;
                    this.serverClass = "transmission";
                    this.ensureWebsocketConnection();
                    console.debug(
                        "[tiny-torrent][rpc] tt-get-capabilities not supported; marking serverClass=transmission",
                        error.code
                    );
                    return;
                }

                console.error(
                    `[tiny-torrent][rpc] refreshExtendedCapabilities failed`,
                    error
                );
                this.applyCapabilities(null);
            }
        })();

        try {
            await this.inflightGetCapabilities;
        } finally {
            this.inflightGetCapabilities = undefined;
        }
    }

    private hasWebsocketSupport() {
        const endpointPath =
            this.tinyTorrentCapabilities?.websocketEndpoint ??
            this.tinyTorrentCapabilities?.websocketPath;
        const supportsDeltaSync =
            this.tinyTorrentCapabilities?.features?.includes(
                "websocket-delta-sync"
            );
        return (
            this.serverClass === "tinytorrent" &&
            Boolean(endpointPath) &&
            Boolean(supportsDeltaSync)
        );
    }

    public async handshake(): Promise<TransmissionSessionSettings> {
        return this.handshakeOnce();
    }

    private async handshakeOnce(
        reason: string = "no-session-id"
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
            { bypassHandshake: true }
        );
        this.sessionSettingsCache = result;
        this.engineInfoCache = undefined;
        this.applyCapabilities(null);
        try {
            await this.refreshExtendedCapabilities(true);
        } catch (err) {
            // Defensive: refreshExtendedCapabilities should handle expected
            // RpcCommandError cases, but if anything unexpected bubbles up
            // ensure handshake still succeeds using conservative defaults.
            console.debug(
                "[tiny-torrent][rpc] refreshExtendedCapabilities error (ignored):",
                err
            );
            this.applyCapabilities(null);
        }
        return result;
    }

    private handleLiveStateUpdate = async ({
        torrents,
        session,
    }: {
        torrents: TransmissionTorrent[];
        session: TransmissionSessionStats;
    }) => {
        this.syncIdMap(torrents);
        const normalized = torrents.map(normalizeTorrent);
        const stats = mapTransmissionSessionStatsToSessionStats(session);
        // Push the live payload immediately to avoid blocking the websocket
        // processing pipeline on potentially slow free-space checks.
        const payload: Partial<
            import("./heartbeat").HeartbeatPayload & {
                networkTelemetry?: NetworkTelemetry;
            }
        > = {
            torrents: normalized,
            sessionStats: stats,
            timestampMs: Date.now(),
            source: "websocket",
        };
        this.heartbeat.pushLivePayload(
            payload as import("./heartbeat").HeartbeatPayload
        );

        // Fetch telemetry asynchronously and push a secondary payload when
        // available. Do not await — best-effort only.
        (async () => {
            try {
                const nt = await this.fetchNetworkTelemetry();
                if (!nt) return;
                const telemetryPayload: Partial<
                    import("./heartbeat").HeartbeatPayload & {
                        networkTelemetry?: NetworkTelemetry;
                    }
                > = {
                    torrents: normalized,
                    sessionStats: stats,
                    networkTelemetry: nt,
                    timestampMs: Date.now(),
                    source: "websocket-telemetry",
                };
                this.heartbeat.pushLivePayload(
                    telemetryPayload as import("./heartbeat").HeartbeatPayload
                );
            } catch (err) {
                // ignore telemetry fetch failures
            }
        })();
    };

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
                    fields: DELTA_FIELDS,
                },
            },
            z.any()
        );
        const args = response as unknown as { removed?: unknown } & Record<
            string,
            unknown
        >;
        const torrents = getTorrentList(args ?? {});
        const removed = Array.isArray(args?.removed)
            ? (args.removed as number[])
            : [];
        return { torrents, removed };
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

    public async notifyUiReady(): Promise<void> {
        if (this.serverClass === "tinytorrent") {
            return;
        }
        if (
            this.tinyTorrentCapabilities &&
            this.tinyTorrentCapabilities.features?.includes?.("ui-attach")
        ) {
            try {
                await this.mutate("session-ui-attach");
            } catch (err) {
                console.debug(
                    "[tiny-torrent][rpc] session-ui-attach failed (ignored)",
                    err
                );
            }
        }
    }

    public async notifyUiDetached(): Promise<void> {
        const isTransmissionClass = this.serverClass !== "tinytorrent";
        if (!isTransmissionClass) {
            return;
        }
        if (!this.tinyTorrentCapabilities?.features?.includes?.("ui-attach")) {
            return;
        }
        const request = { method: "session-ui-detach" };
        // Use fetch with keepalive so we can include required headers
        // (notably X-Transmission-Session-Id). sendBeacon does not allow
        // custom headers and will often result in 409 from Transmission.
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            const ttAuth = this.getTinyTorrentAuthToken();
            if (ttAuth) {
                headers["X-TT-Auth"] = ttAuth;
            }
            if (this.sessionId) {
                headers["X-Transmission-Session-Id"] = this.sessionId;
            }
            const authHeader = this.getAuthorizationHeader();
            if (authHeader) headers.Authorization = authHeader;

            const payload = JSON.stringify(request);
            const requestInit: RequestInit = {
                method: "POST",
                headers,
                body: payload,
                keepalive: true,
            };

            const resp = await this.transport.fetchWithSession(
                requestInit,
                undefined,
                true
            );
            // Sync transport's authoritative session token back to adapter state
            try {
                const transportToken = this.transport.getSessionId();
                if (transportToken && transportToken !== this.sessionId) {
                    this.acceptSessionId(transportToken);
                }
            } catch {}
            // best-effort; don't throw on non-OK because this is fire-and-forget
            return;
        } catch (e) {
            // fallback to adapter send which supports retries and header logic
        }

        try {
            await this.send(request, zRpcSuccess, 0, true);
        } catch (err) {
            console.debug(
                "[tiny-torrent][rpc] notifyUiDetached send failed (ignored)",
                err
            );
        }
    }

    public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
        const settings = await this.send(
            { method: "session-get" },
            zTransmissionSessionSettings
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

    public async getExtendedCapabilities(
        force = false
    ): Promise<TinyTorrentCapabilities | null> {
        if (
            force ||
            this.tinyTorrentCapabilities === undefined ||
            this.tinyTorrentCapabilities === null
        ) {
            await this.refreshExtendedCapabilities();
        } else {
            this.ensureWebsocketConnection();
        }
        return this.tinyTorrentCapabilities ?? null;
    }

    public getServerClass(): ServerClass {
        return this.serverClass;
    }

    public async updateSessionSettings(
        settings: Partial<TransmissionSessionSettings>
    ): Promise<void> {
        await this.send(
            { method: "session-set", arguments: settings },
            zRpcSuccess
        );
        this.sessionSettingsCache = {
            ...(this.sessionSettingsCache ?? {}),
            ...settings,
        };
    }

    public async testPort(): Promise<boolean> {
        const result = await this.send(
            { method: "session-test" },
            z.object({ portIsOpen: z.boolean().optional() })
        );
        return Boolean(result.portIsOpen);
    }

    public async fetchSessionStats(): Promise<TransmissionSessionStats> {
        try {
            const stats = await this.send(
                { method: "session-stats" },
                zSessionStats
            );
            return stats;
        } catch (error) {
            // Best-effort fallback: log and return zeroed stats to avoid
            // disconnecting the UI on malformed or partial RPC responses.
            console.warn(
                "[tiny-torrent][rpc] failed to parse session-stats, returning zeroed stats",
                error
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
            // DHT node counts are not provided reliably; telemetry indicators live in fetchNetworkTelemetry()
        };
    }

    public subscribeToHeartbeat(
        params: HeartbeatSubscriberParams
    ): HeartbeatSubscription {
        return this.heartbeat.subscribe(params);
    }

    /**
     * Return the engine-owned speed history for a torrent.
     * This delegates to the internal HeartbeatManager which maintains fixed-length buffers.
     */
    public async getSpeedHistory(
        id: string
    ): Promise<{ down: number[]; up: number[] }> {
        try {
            // HeartbeatManager provides a synchronous getter that returns copies of buffers.
            // Call it directly and return the result as a resolved Promise.
            const data = this.heartbeat.getSpeedHistory(id);
            return Promise.resolve(data);
        } catch (e) {
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
        } catch {}
        try {
            // Ensure adapter-level session state is considered invalid so
            // a subsequent handshake/probe will run.
            this.invalidateSession("reset-connection");
        } catch {}
    }

    public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        if (NativeShell.isAvailable) {
            return NativeShell.checkFreeSpace(path);
        }
        const fs = await this.send(
            { method: "free-space", arguments: { path } },
            zTransmissionFreeSpace
        );
        return fs;
    }

    private supportsFsBrowse(): boolean {
        return Boolean(
            this.tinyTorrentCapabilities?.features.includes("fs-browse")
        );
    }

    public async browseDirectory(
        path?: string
    ): Promise<DirectoryBrowseResult> {
        if (!this.supportsFsBrowse()) {
            throw new Error(
                "fs-browse is not supported by the connected engine"
            );
        }
        const result = await this.send(
            { method: "fs-browse", arguments: path ? { path } : undefined },
            zDirectoryBrowseResponse
        );
        return result;
    }

    public async createDirectory(path: string): Promise<void> {
        if (!path) {
            return;
        }
        await this.mutate("fs-create-dir", { path });
    }

    public async openPath(path: string): Promise<void> {
        if (!path) {
            return;
        }
        if (this.serverClass === "tinytorrent" && NativeShell.isAvailable) {
            await NativeShell.openPath(path);
            return;
        }
        await this.mutate("system-open", { path });
    }

    public async systemInstall(
        options: SystemInstallOptions = {}
    ): Promise<SystemInstallResult> {
        const args: Record<string, unknown> = {};
        const name = options.name?.trim();
        if (name) {
            args.name = name;
        }
        if (options.args && options.args.trim()) {
            args.args = options.args.trim();
        }
        if (options.locations && options.locations.length > 0) {
            args.locations = options.locations;
        }
        if (options.registerHandlers !== undefined) {
            args.registerHandlers = options.registerHandlers;
        }
        if (options.installToProgramFiles !== undefined) {
            args.installToProgramFiles = options.installToProgramFiles;
        }
        const result = await this.send(
            { method: "system-install", arguments: args },
            zSystemInstallResult
        );
        return result as SystemInstallResult;
    }

    public async getSystemAutorunStatus(): Promise<AutorunStatus> {
        const result = await this.send(
            { method: "system-autorun-status" },
            zSystemAutorunStatus
        );
        return result;
    }

    public async getSystemHandlerStatus(): Promise<SystemHandlerStatus> {
        const result = await this.send(
            { method: "system-handler-status" },
            zSystemHandlerStatus
        );
        return result;
    }

    public async systemAutorunEnable(scope = "user"): Promise<void> {
        await this.mutate("system-autorun-enable", { scope });
    }

    public async systemAutorunDisable(): Promise<void> {
        await this.mutate("system-autorun-disable");
    }

    public async systemHandlerEnable(): Promise<void> {
        await this.mutate("system-handler-enable");
    }

    public async systemHandlerDisable(): Promise<void> {
        await this.mutate("system-handler-disable");
    }

    private async fetchTransmissionTorrents(): Promise<TransmissionTorrent[]> {
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                },
            },
            zTransmissionTorrentArray
        );
        return list as TransmissionTorrent[];
    }

    private async fetchTransmissionTorrentSummaryByIdentifier(
        identifier: string | number
    ): Promise<TransmissionTorrent> {
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                    ids: [identifier],
                },
            },
            zTransmissionTorrentArray
        );
        const [torrent] = list as TransmissionTorrent[];
        if (!torrent) {
            throw new Error(`Torrent ${identifier} not found`);
        }
        return torrent as TransmissionTorrent;
    }

    private async fetchTransmissionTorrentDetails(
        id: number
    ): Promise<TransmissionTorrentDetail> {
        const detail = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: DETAIL_FIELDS,
                    ids: [id],
                },
            },
            zTransmissionTorrentDetailSingle
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

    public async getTorrentDetails(id: string): Promise<TorrentDetailEntity> {
        const rpcId = await this.resolveRpcId(id);
        const detail = await this.fetchTransmissionTorrentDetails(rpcId);
        this.idMap.set(detail.hashString, detail.id);
        return normalizeTorrentDetail(detail);
    }

    /**
     * Bulk fetch details to prevent N+1 request storms when multiple rows
     * subscribe to details simultaneously.
     */
    public async getTorrentDetailsBulk(
        ids: string[]
    ): Promise<TorrentDetailEntity[]> {
        const rpcIds = await this.resolveIds(ids);
        if (rpcIds.length === 0) return [];

        const response = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: DETAIL_FIELDS,
                    ids: rpcIds,
                },
            },
            zTransmissionTorrentArray
        );

        const results: TorrentDetailEntity[] = [];
        for (const item of response as unknown[]) {
            const detail = item as TransmissionTorrentDetail;
            if (detail.hashString && typeof detail.id === "number") {
                try {
                    this.idMap.set(detail.hashString, detail.id);
                } catch {}
            }
            results.push(normalizeTorrentDetail(detail));
        }
        return results;
    }

    public async addTorrent(
        payload: AddTorrentPayload
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

        if (this.serverClass !== "tinytorrent") {
            if (payload.priorityHigh?.length) {
                args["priority-high"] = payload.priorityHigh;
            }
            if (payload.priorityNormal?.length) {
                args["priority-normal"] = payload.priorityNormal;
            }
            if (payload.priorityLow?.length) {
                args["priority-low"] = payload.priorityLow;
            }
        }

        const response = await this.send(
            { method: "torrent-add", arguments: args },
            zTransmissionAddTorrentResponse
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
                "Torrent add did not return a numeric RPC identifier"
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
        deleteData: boolean = false
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
        wanted: boolean
    ): Promise<void> {
        if (!indexes.length) return;
        const key = wanted ? "files-wanted" : "files-unwanted";
        const rpcId = await this.resolveRpcId(id);
        await this.mutate("torrent-set", {
            ids: [rpcId],
            [key]: indexes,
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
            zRpcSuccess
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
        name: string
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
            zTransmissionTorrentRenameResult
        );
        return result;
    }

    public async setTorrentLocation(
        ids: number | number[],
        location: string,
        moveData?: boolean
    ): Promise<void>;
    public async setTorrentLocation(
        id: string,
        location: string,
        moveData?: boolean
    ): Promise<void>;
    public async setTorrentLocation(
        idsOrId: number | number[] | string,
        location: string,
        moveData = true
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
        options: TransmissionBandwidthGroupOptions
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
                    zTransmissionSessionSettings
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
                    //    console.debug(
                    //        "[telemetry] Normalized NetworkTelemetry:",
                    //        telemetry
                    //    );
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
                console.debug(
                    "[telemetry] Normalized NetworkTelemetry (from free-space):",
                    telemetry
                );
                return telemetry;
            } catch (err) {
                // Best-effort: on error, return null instead of throwing so callers
                // can treat telemetry as optional and avoid thundering-herd errors.
                console.debug(
                    "[telemetry] fetchNetworkTelemetry failed, returning null",
                    err
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
        } catch (err) {
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

function mapTransmissionSessionStatsToSessionStats(
    stats: TransmissionSessionStats
): SessionStats {
    return {
        downloadSpeed: stats.downloadSpeed,
        uploadSpeed: stats.uploadSpeed,
        torrentCount: stats.torrentCount,
        activeTorrentCount: stats.activeTorrentCount,
        pausedTorrentCount: stats.pausedTorrentCount,
        // Preserve undefined when the engine does not provide DHT telemetry.
        dhtNodes: stats.dhtNodes === undefined ? undefined : stats.dhtNodes,
    };
}

interface TinyTorrentWebSocketSessionOptions {
    getToken: () => string | undefined;
    onUpdate: (data: {
        torrents: TransmissionTorrent[];
        session: TransmissionSessionStats;
    }) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: unknown) => void;
    onUiFocus?: () => void;
}

type SyncSnapshotMessage = {
    type: "sync-snapshot";
    data: {
        session?: unknown;
        torrents?: TransmissionTorrent[];
    };
};

type SyncPatchMessage = {
    type: "sync-patch";
    data: {
        session?: unknown;
        torrents?: {
            removed?: number[];
            added?: TransmissionTorrent[];
            updated?: TransmissionTorrent[];
        };
    };
};

type TinyTorrentEventMessage = {
    type: "event";
    data?: {
        event?: string;
    };
};

type TinyTorrentWebSocketMessage =
    | SyncSnapshotMessage
    | SyncPatchMessage
    | TinyTorrentEventMessage;

class TinyTorrentWebSocketSession {
    private static nextSessionId = 1;
    private readonly sessionId: number;
    private readonly logPrefix: string;
    private baseUrl?: URL;
    private socket?: WebSocket;
    private reconnectTimer?: number;
    private reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
    private readonly maxReconnectDelay = WS_RECONNECT_MAX_DELAY_MS;
    private shouldReconnect = false;
    private isConnected = false;
    private readonly torrentsMap = new Map<number, TransmissionTorrent>();
    private lastSessionStats?: TransmissionSessionStats;
    private readonly options: TinyTorrentWebSocketSessionOptions;
    private focusRestoreTimer?: number;
    private connectAttempt = 0;

    constructor(options: TinyTorrentWebSocketSessionOptions) {
        this.sessionId = TinyTorrentWebSocketSession.nextSessionId++;
        this.logPrefix = `[tiny-torrent][ws #${this.sessionId}]`;
        this.options = options;
        console.log(`${this.logPrefix} session created`);
    }

    private handleUiFocusSignal() {
        if (typeof window === "undefined") {
            return;
        }
        const token = this.options.getToken();
        const focusKey = token ? `TT-FOCUS-${token}` : null;
        const originalTitle =
            typeof document !== "undefined" ? document.title : "";

        if (focusKey) {
            document.title = focusKey;
        }

        if (typeof window.focus === "function") {
            window.focus();
        }

        if (!focusKey) {
            return;
        }

        if (this.focusRestoreTimer) {
            window.clearTimeout(this.focusRestoreTimer);
        }

        this.focusRestoreTimer = window.setTimeout(() => {
            if (
                focusKey &&
                typeof document !== "undefined" &&
                document.title === focusKey
            ) {
                document.title = originalTitle;
            }
            this.focusRestoreTimer = undefined;
        }, FOCUS_RESTORE_DELAY_MS);
    }

    public start(baseUrl: URL) {
        if (typeof window === "undefined" || typeof WebSocket === "undefined") {
            return;
        }
        this.stop();
        this.baseUrl = baseUrl;
        console.log(
            `${this.logPrefix} start requested baseUrl=${baseUrl.toString()}`
        );
        this.torrentsMap.clear();
        this.lastSessionStats = undefined;
        this.shouldReconnect = true;
        this.reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
        this.scheduleConnect(0);
    }

    public stop() {
        console.log(`${this.logPrefix} stop invoked`);
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.socket) {
            console.log(`${this.logPrefix} closing socket`);
            this.socket.close();
            this.socket = undefined;
        }
        this.markDisconnected();
    }

    private scheduleConnect(delay: number) {
        if (!this.shouldReconnect || !this.baseUrl) return;
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
        }
        console.log(
            `${this.logPrefix} scheduling connect in ${delay}ms (shouldReconnect=${this.shouldReconnect})`
        );
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
    }

    /**
     *
     *  DO NOT DELETE THIS COMMENT:
     *
     *  Transport reconnect timer — ALLOWED EXCEPTION.
     *  This timer schedules WebSocket reconnect attempts only (transport-level network I/O).
     *  It does NOT perform engine polling or replace the HeartbeatManager's role.
     *  The adapter coordinates transport vs polling by calling `heartbeat.disablePolling()`
     *  when the socket is connected and `heartbeat.enablePolling()` when disconnected.
     *  Keep reconnect logic here: it's a transport-scoped responsibility, not a heartbeat   polling mechanism.
     *
     *  DO NOT DELETE THIS COMMENT:
     *
     **/

    private openSocket() {
        if (!this.shouldReconnect || !this.baseUrl) return;
        const url = this.buildUrlWithToken();
        if (!url) {
            this.options.onError?.(new Error("Invalid WebSocket URL"));
            return;
        }
        const attemptId = ++this.connectAttempt;
        console.log(
            `${
                this.logPrefix
            } opening WebSocket attempt #${attemptId} to ${url.toString()}`
        );
        try {
            this.socket = new WebSocket(url.toString());
        } catch (error) {
            console.error(
                `${this.logPrefix} connect attempt #${attemptId} failed`,
                error
            );
            this.options.onError?.(error);
            this.scheduleConnect(this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.maxReconnectDelay,
                this.reconnectDelay * 2
            );
            return;
        }
        this.socket.addEventListener("open", this.handleOpen);
        this.socket.addEventListener("message", this.handleMessage);
        this.socket.addEventListener("close", this.handleClose);
        this.socket.addEventListener("error", this.handleError);
    }

    private buildUrlWithToken(): URL | null {
        if (!this.baseUrl) return null;
        const url = new URL(this.baseUrl.toString());
        const token = this.options.getToken();
        if (token) {
            url.searchParams.set("token", token);
        } else {
            url.searchParams.delete("token");
        }
        return url;
    }

    private handleOpen = () => {
        console.log(
            `${this.logPrefix} websocket opened (attempt #${this.connectAttempt})`
        );
        this.reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
        this.isConnected = true;
        this.options.onConnected?.();
    };

    private handleMessage = (event: MessageEvent) => {
        let parsed: TinyTorrentWebSocketMessage;
        try {
            parsed = JSON.parse(event.data);
        } catch {
            return;
        }
        if (parsed.type === "sync-snapshot") {
            this.handleSnapshot(parsed.data);
        } else if (parsed.type === "sync-patch") {
            this.handlePatch(parsed.data);
        } else if (parsed.type === "event") {
            this.handleEvent(parsed.data);
        }
    };

    private handleSnapshot(data: SyncSnapshotMessage["data"]) {
        const session = this.parseSession(data.session);
        if (!session) {
            return;
        }
        const torrents = this.parseTorrents(data.torrents);
        this.torrentsMap.clear();
        torrents.forEach((torrent) => {
            this.torrentsMap.set(torrent.id, torrent);
        });
        this.lastSessionStats = session;
        this.emitUpdate();
    }

    private handlePatch(data: SyncPatchMessage["data"]) {
        const patch = data.torrents;
        if (patch?.removed) {
            for (const id of patch.removed) {
                this.torrentsMap.delete(id);
            }
        }
        if (patch?.added) {
            this.parseTorrents(patch.added).forEach((torrent) => {
                this.torrentsMap.set(torrent.id, torrent);
            });
        }
        if (patch?.updated) {
            this.parseTorrents(patch.updated).forEach((torrent) => {
                this.torrentsMap.set(torrent.id, torrent);
            });
        }
        const session = this.parseSession(data.session);
        if (session) {
            this.lastSessionStats = session;
        }
        this.emitUpdate();
    }

    private handleEvent(data: TinyTorrentEventMessage["data"]) {
        const eventName = data?.event;
        if (!eventName) {
            return;
        }
        if (eventName === "ui-focus") {
            this.options.onUiFocus?.();
        }
    }

    private parseTorrents(
        value: TransmissionTorrent[] | undefined
    ): TransmissionTorrent[] {
        if (!value || !value.length) return [];
        try {
            return getTorrentList({ torrents: value });
        } catch (error) {
            this.options.onError?.(error);
            return [];
        }
    }

    private parseSession(value: unknown): TransmissionSessionStats | undefined {
        if (!value) return undefined;
        try {
            return getSessionStats(value as unknown);
        } catch (error) {
            this.options.onError?.(error);
            return undefined;
        }
    }

    private emitUpdate() {
        if (!this.lastSessionStats) {
            return;
        }
        const torrents = Array.from(this.torrentsMap.values());
        this.options.onUpdate({
            torrents,
            session: this.lastSessionStats,
        });
    }

    private handleClose = (event: CloseEvent) => {
        console.warn(
            `${this.logPrefix} websocket closed code=${event.code} reason=${event.reason}`
        );
        this.markDisconnected();
        if (this.shouldReconnect) {
            this.scheduleConnect(this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.maxReconnectDelay,
                this.reconnectDelay * 2
            );
        }
    };

    private handleError = (event: Event) => {
        console.error(`${this.logPrefix} websocket error`, event);
        this.options.onError?.(event);
    };

    private markDisconnected() {
        if (!this.isConnected) {
            return;
        }
        console.log(`${this.logPrefix} markDisconnected`);
        this.isConnected = false;
        this.options.onDisconnected?.();
    }
}
