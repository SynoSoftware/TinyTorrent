import { infraLogger } from "@/shared/utils/infraLogger";
import { isAbortError } from "@/shared/utils/errors";
import { TRANSPORT_CACHE_TTL_MS } from "@/config/logic";

export type TransportOutcomeKind =
    | "ok"
    | "auth_error"
    | "session_conflict"
    | "unavailable"
    | "aborted";

type TransportFailureOutcome =
    | { kind: "auth_error"; status: 401 | 403; message: string }
    | { kind: "session_conflict"; message: string }
    | { kind: "unavailable"; message: string }
    | { kind: "aborted"; message: string };

export type TransportRequestOutcome<T> =
    | { kind: "ok"; value: T }
    | TransportFailureOutcome;

export type TransportFetchOutcome =
    | { kind: "ok"; response: Response }
    | TransportFailureOutcome;

interface RpcResponse<T = unknown> {
    result: string;
    arguments: T;
}

type TransportSessionRuntime = {
    sharedSessionId: string | null;
    probePromise: Promise<string | null> | null;
    sessionBarrier: Promise<void> | null;
};

const transportSessionRuntimeByKey = new Map<string, TransportSessionRuntime>();

const getTransportSessionRuntime = (key: string): TransportSessionRuntime => {
    const existing = transportSessionRuntimeByKey.get(key);
    if (existing) return existing;
    const runtime: TransportSessionRuntime = {
        sharedSessionId: null,
        probePromise: null,
        sessionBarrier: null,
    };
    transportSessionRuntimeByKey.set(key, runtime);
    return runtime;
};

export function resetTransportSessionRuntimeOwner() {
    transportSessionRuntimeByKey.clear();
}

export class TransmissionRpcTransport {
    private sessionId: string | null = null;
    private endpoint: string;
    private authHeader?: string;
    private readonly sessionRuntime: TransportSessionRuntime;
    // Track controllers for active fetches so we can abort them on reset.
    private inflightControllers = new Set<AbortController>();

    // 1. Request Coalescing Map (Deduplication)
    private inflightRequests = new Map<
        string,
        Promise<TransportRequestOutcome<unknown>>
    >();

    // 2. Short-lived Cache (TTL)
    private responseCache = new Map<string, { val: unknown; ts: number }>();
    private readonly CACHE_TTL_MS = TRANSPORT_CACHE_TTL_MS;

    // Helper: stable deterministic stringify for request argument hashing
    private stableStringify(value: unknown): string {
        if (value === undefined) {
            return "undefined";
        }
        if (value === null) {
            return "null";
        }
        if (Array.isArray(value)) {
            return `[${value.map((v) => this.stableStringify(v)).join(",")}]`;
        }
        if (typeof value === "object") {
            const record = value as Record<string, unknown>;
            const keys = Object.keys(record).sort();
            return `{${keys
                .map(
                    (key) =>
                        `${JSON.stringify(key)}:${this.stableStringify(
                            record[key]
                        )}`
                )
                .join(",")}}`;
        }
        return JSON.stringify(value);
    }

    constructor(
        endpoint: string,
        credentials?: { user: string; pass: string }
    ) {
        this.endpoint = endpoint;
        if (credentials && (credentials.user || credentials.pass)) {
            try {
                // btoa is not UTF-8 safe; ensure proper UTF-8 encoding for credentials
                const raw = `${credentials.user}:${credentials.pass}`;
                this.authHeader =
                    "Basic " + btoa(unescape(encodeURIComponent(raw)));
            } catch {
                try {
                    // Fallback to plain btoa; worst-case the header may be malformed.
                    this.authHeader =
                        "Basic " +
                        btoa(`${credentials.user}:${credentials.pass}`);
                } catch { /* ignore */ }
            }
        }
        infraLogger.debug({
            scope: "transport",
            event: "created",
            message: "Transmission RPC transport created",
            details: { endpoint: this.endpoint },
        });
        this.sessionRuntime = getTransportSessionRuntime(
            `${this.endpoint}::${this.authHeader ?? ""}`,
        );
    }
    // TODO: This transport is Transmission-only. Do not add TinyTorrent token auth / websocket logic here.
    // TODO: Capability/locality decisions (localhost vs remote, ShellAgent/ShellExtensions bridge availability) belong to a UI capability provider, not this transport.

    public clearResponseCache(): void {
        try {
            this.responseCache.clear();
        } catch { /* ignore */ }
    }

    /**
     * Reset local session state without issuing any network requests.
     * The next outgoing request will trigger the normal 409/session-id
     * handshake flow handled by `fetchWithSession`.
     */
    public resetSession(): void {
        try {
            this.sessionId = null;
        } catch { /* ignore */ }
        try {
            this.sessionRuntime.sharedSessionId = null;
            this.sessionRuntime.probePromise = null;
            this.sessionRuntime.sessionBarrier = null;
        } catch { /* ignore */ }
        try {
            this.clearResponseCache();
        } catch { /* ignore */ }
        try {
            // Abort any in-flight fetches and clear coalesced inflight promises
            this.abortAll();
            this.inflightRequests.clear();
        } catch { /* ignore */ }
    }

    public getSessionId(): string | undefined {
        return this.sessionId ?? this.sessionRuntime.sharedSessionId ?? undefined;
    }

    public setSessionId(token: string | null | undefined): void {
        try {
            this.sessionId = token ?? null;
        } catch { /* ignore */ }
        try {
            this.sessionRuntime.sharedSessionId = token ?? null;
        } catch { /* ignore */ }
    }

    private mapFetchErrorToOutcome(
        error: unknown,
        fallbackMessage: string,
    ): TransportFailureOutcome {
        if (isAbortError(error)) {
            return { kind: "aborted", message: "Transmission RPC request aborted" };
        }
        return {
            kind: "unavailable",
            message:
                error instanceof Error && error.message
                    ? error.message
                    : fallbackMessage,
        };
    }

    public async fetchWithSessionOutcome(
        requestInit: RequestInit,
        controller?: AbortController,
        keepalive = false
    ): Promise<TransportFetchOutcome> {
        // Create an internal controller so we can always abort the underlying
        // fetch if needed (reset/abortAll). If a caller provided a controller,
        // wire it to abort the internal controller as well.
        const internalController = controller
            ? new AbortController()
            : new AbortController();
        if (controller) {
            try {
                const onAbort = () => {
                    try {
                        internalController.abort();
                    } catch { /* ignore */ }
                };
                if (controller.signal)
                    controller.signal.addEventListener("abort", onAbort);
            } catch { /* ignore */ }
        }
        // Track controller for abortAll support
        try {
            this.inflightControllers.add(internalController);
        } catch { /* ignore */ }
        requestInit.signal = internalController.signal;
        if (keepalive) {
            (requestInit as RequestInit & { keepalive?: boolean }).keepalive =
                true;
        }

        const attempt = async (retry = false): Promise<TransportFetchOutcome> => {
            // SESSION BARRIER: if we don't have a sessionId yet and this is not
            // a retry attempt, gate so only one leader will perform the probe.
            if (
                !(this.sessionId ?? this.sessionRuntime.sharedSessionId) &&
                !retry
            ) {
                if (!this.sessionRuntime.sessionBarrier) {
                    // Synchronously install the barrier so concurrent callers
                    // observe a non-null value and will await the same promise.
                    let resolveBarrier: () => void = () => {};
                    let rejectBarrier: (err?: Error) => void = () => {};
                    this.sessionRuntime.sessionBarrier = new Promise<void>(
                        (res, rej) => {
                            resolveBarrier = res;
                            rejectBarrier = rej;
                        }
                    );

                    infraLogger.debug({
                        scope: "transport",
                        event: "session_barrier_installed",
                        message:
                            "Session barrier installed for leader handshake",
                        details: { endpoint: this.endpoint },
                    });

                    // Leader: attempt a light-weight probe to obtain session id
                    // before sending POSTs. Use an independent controller so a
                    // caller abort won't cancel the leader's probe.
                    (async () => {
                        try {
                            let token = await this.probeForSessionId(undefined);
                            // If a simple GET probe didn't return a session id,
                            // attempt a direct POST probe to elicit a 409 with
                            // the X-Transmission-Session-Id header. This is
                            // necessary because some Transmission servers only
                            // advertise the session token on POST conflicts.
                            if (!token) {
                                try {
                                    const postHeaders: Record<string, string> =
                                        {};
                                    if (this.authHeader)
                                        postHeaders["Authorization"] =
                                            this.authHeader;
                                    postHeaders["Content-Type"] =
                                        "application/json";
                                    const probeBody = JSON.stringify({
                                        method: "session-get",
                                    });
                                    const resp = await fetch(this.endpoint, {
                                        method: "POST",
                                        headers: postHeaders,
                                        body: probeBody,
                                    });
                                    const headerToken =
                                        resp &&
                                        resp.headers &&
                                        typeof resp.headers.get === "function"
                                            ? resp.headers.get(
                                                  "X-Transmission-Session-Id"
                                              )
                                            : null;
                                    if (headerToken) {
                                        token = headerToken;
                                    } else {
                                        try {
                                            const txt = await resp.text();
                                            if (txt) {
                                                const m = txt.match(
                                                    /X-Transmission-Session-Id\s*[:=]\s*([A-Za-z0-9_-]+)/i
                                                );
                                                if (m && m[1]) token = m[1];
                                            }
                                        } catch { /* ignore */ }
                                    }
                                } catch { /* ignore */ }
                            }

                            if (token) {
                                this.sessionId = token;
                                try {
                                    this.sessionRuntime.sharedSessionId = token;
                                } catch { /* ignore */ }
                            }

                            resolveBarrier();
                        } catch (err) {
                            try {
                                rejectBarrier(
                                    err instanceof Error
                                        ? err
                                        : new Error(
                                              "Session barrier initialization failed"
                                          )
                                );
                            } catch { /* ignore */ }
                        } finally {
                            // clear barrier after resolution so future handshakes
                            // may create a new barrier when needed.
                            this.sessionRuntime.sessionBarrier = null;
                        }
                    })();
                }

                try {
                    infraLogger.debug({
                        scope: "transport",
                        event: "session_barrier_await",
                        message:
                            "Awaiting existing session barrier for worker request",
                        details: { endpoint: this.endpoint },
                    });
                    await this.sessionRuntime.sessionBarrier;
                } catch {
                    // If the leader's probe failed, fall through and attempt
                    // the normal POST flow which will perform the 409/handshake
                    // logic as a fallback.
                }
            }
            const headers: Record<string, string> = Object.assign(
                {},
                (requestInit.headers as Record<string, string>) ?? {}
            );
            const effectiveSessionId =
                this.sessionId ?? this.sessionRuntime.sharedSessionId;
            if (effectiveSessionId) {
                headers["X-Transmission-Session-Id"] =
                    effectiveSessionId as string;
            }
            if (this.authHeader) {
                headers["Authorization"] = this.authHeader;
            }
            requestInit.headers = headers;

            let response: Response;
            try {
                response = await fetch(this.endpoint, requestInit);
            } catch (error) {
                return this.mapFetchErrorToOutcome(
                    error,
                    "Transmission RPC unavailable",
                );
            } finally {
                try {
                    this.inflightControllers.delete(internalController);
                } catch { /* ignore */ }
            }

            // Some tests/mock environments provide a lightweight object
            // that looks like a Response but lacks `status` or `headers`.
            // Be defensive: derive numeric status from `status` when
            // present, otherwise infer from `ok`.
            const maybeResp = response as Response | undefined | null;
            const status: number =
                maybeResp && typeof maybeResp.status === "number"
                    ? maybeResp.status
                    : maybeResp && typeof maybeResp.ok === "boolean"
                    ? maybeResp.ok
                        ? 200
                        : 0
                    : 0;

            if (status === 409) {
                // Try to obtain a session token from headers when available
                let token: string | null | undefined = undefined;
                try {
                    const hdrs = (response as Response)?.headers;
                    if (hdrs && typeof hdrs.get === "function") {
                        token = hdrs.get("X-Transmission-Session-Id");
                    }
                } catch { /* ignore */ }

                if (!token) {
                    try {
                        // Use a deduped probe so multiple concurrent 409 handlers
                        // share a single probe network request instead of issuing
                        // multiple OPTIONS/HEAD/GET probes.
                        token = await this.probeForSessionId(controller);
                    } catch { /* ignore */ }
                }
                if (!token) {
                    this.sessionId = null;
                    this.sessionRuntime.sharedSessionId = null;
                    return {
                        kind: "session_conflict",
                        message: "Transmission RPC missing session id",
                    };
                }
                this.sessionId = token;
                try {
                    this.sessionRuntime.sharedSessionId = token;
                } catch { /* ignore */ }
                if (retry) {
                    this.sessionId = null;
                    return {
                        kind: "session_conflict",
                        message: "Transmission RPC session conflict",
                    };
                }
                return attempt(true);
            }

            if (status === 401) {
                return {
                    kind: "auth_error",
                    status: 401,
                    message: "Transmission RPC unauthorized",
                };
            }
            if (status === 403) {
                return {
                    kind: "auth_error",
                    status: 403,
                    message: "Transmission RPC forbidden",
                };
            }

            // Update session id if present on response headers (defensive)
            try {
                const hdrs = (response as Response)?.headers;
                const currentToken =
                    hdrs && typeof hdrs.get === "function"
                        ? hdrs.get("X-Transmission-Session-Id")
                        : null;
                if (currentToken && currentToken !== this.sessionId) {
                    this.sessionId = currentToken;
                    try {
                        this.sessionRuntime.sharedSessionId = currentToken;
                    } catch { /* ignore */ }
                }
            } catch { /* ignore */ }

            return { kind: "ok", response };
        };

        return attempt(false);
    }

    public async fetchWithSession(
        requestInit: RequestInit,
        controller?: AbortController,
        keepalive = false,
    ): Promise<Response> {
        const outcome = await this.fetchWithSessionOutcome(
            requestInit,
            controller,
            keepalive,
        );
        if (outcome.kind === "ok") {
            return outcome.response;
        }
        const error = new Error(outcome.message);
        if (outcome.kind === "auth_error") {
            (error as unknown as { status?: number }).status = outcome.status;
        }
        if (outcome.kind === "aborted") {
            (error as unknown as { name?: string }).name = "AbortError";
        }
        throw error;
    }

    /**
     * Abort all active internal fetch controllers. Used when resetting or
     * when the adapter is destroyed to ensure no background requests remain.
     */
    public abortAll(): void {
        try {
            for (const ctrl of Array.from(this.inflightControllers)) {
                try {
                    ctrl.abort();
                } catch { /* ignore */ }
            }
        } finally {
            try {
                this.inflightControllers.clear();
            } catch { /* ignore */ }
        }
    }

    private async probeForSessionId(
        controller?: AbortController
    ): Promise<string | null> {
        // Dedupe concurrent probes so we don't flood the server with
        // OPTIONS/HEAD/GET probes when multiple requests observe 409s.
        if (this.sessionRuntime.probePromise) {
            return this.sessionRuntime.probePromise;
        }

        // Prefer a simple GET probe without custom headers to avoid CORS preflight
        // failures (many Transmission endpoints don't implement OPTIONS/HEAD).
        const methods: Array<RequestInit["method"]> = ["GET"];
        const headersBase: Record<string, string> = {};

        this.sessionRuntime.probePromise = (async (): Promise<
            string | null
        > => {
            try {
                for (const method of methods) {
                    try {
                        const resp = await fetch(this.endpoint, {
                            method,
                            headers: headersBase,
                            signal: controller?.signal,
                        });
                        const token = resp.headers
                            ? resp.headers.get("X-Transmission-Session-Id")
                            : null;
                        if (token) return token;
                        try {
                            const txt = await resp.text();
                            if (txt) {
                                const m = txt.match(
                                    /X-Transmission-Session-Id\s*[:=]\s*([A-Za-z0-9_-]+)/i
                                );
                                if (m && m[1]) return m[1];
                            }
                        } catch { /* ignore */ }
                    } catch { /* ignore */ }
                }
                return null;
            } finally {
                // Clear the probe promise so future probes may run if needed.
                this.sessionRuntime.probePromise = null;
            }
        })();

        return this.sessionRuntime.probePromise;
    }

    public async requestWithOutcome<T>(
        method: string,
        args: Record<string, unknown> = {},
        options: { cache?: boolean } = {},
        controller?: AbortController,
    ): Promise<TransportRequestOutcome<T>> {
        const cacheKey = `${method}:${this.stableStringify(args ?? null)}`;

        if (options.cache) {
            const cached = this.responseCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) {
                return { kind: "ok", value: cached.val as T };
            }
        }

        if (this.inflightRequests.has(cacheKey)) {
            return this.inflightRequests.get(cacheKey)! as Promise<
                TransportRequestOutcome<T>
            >;
        }

        const allowCallerAbort = !options.cache;
        const execController = allowCallerAbort ? controller : undefined;
        const promise = this.executeWithStateLogic<T>(
            method,
            args,
            execController,
        ) as Promise<TransportRequestOutcome<unknown>>;

        this.inflightRequests.set(cacheKey, promise);

        try {
            const outcome = (await promise) as TransportRequestOutcome<T>;
            if (options.cache && outcome.kind === "ok") {
                this.responseCache.set(cacheKey, {
                    val: outcome.value,
                    ts: Date.now(),
                });
            }
            return outcome;
        } finally {
            this.inflightRequests.delete(cacheKey);
        }
    }

    /**
     * Public Interface: The rest of the app just calls this.
     * It handles the state machine, retries, and queueing internally.
     */
    public async request<T>(
        method: string,
        args: Record<string, unknown> = {},
        options: { cache?: boolean } = {},
        controller?: AbortController
    ): Promise<T> {
        const outcome = await this.requestWithOutcome<T>(
            method,
            args,
            options,
            controller,
        );
        if (outcome.kind === "ok") {
            return outcome.value;
        }
        const error = new Error(outcome.message);
        if (outcome.kind === "auth_error") {
            (error as unknown as { status?: number }).status = outcome.status;
        }
        if (outcome.kind === "aborted") {
            (error as unknown as { name?: string }).name = "AbortError";
        }
        throw error;
    }

    /**
     * The State Machine Logic (Session ID handling)
     */
    private async executeWithStateLogic<T>(
        method: string,
        args: unknown,
        controller?: AbortController
    ): Promise<TransportRequestOutcome<T>> {
        const requestInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method, arguments: args }),
        };

        const fetchOutcome = await this.fetchWithSessionOutcome(
            requestInit,
            controller,
            false,
        );
        if (fetchOutcome.kind !== "ok") {
            return fetchOutcome;
        }
        const res = fetchOutcome.response;

        // Handle unauthorized responses explicitly so callers can react.
        // TODO: Rename these error messages to “Transmission RPC ...” (not “TinyTorrent RPC ...”) once the codebase is fully Transmission-only; keep errors consistent across transports/adapters.
        if (!res.ok) {
            return {
                kind: "unavailable",
                message: `HTTP Error ${res.status}`,
            };
        }

        const jsonRaw = await res.json();
        const json = jsonRaw as RpcResponse<T>;
        if (json.result !== "success") {
            return {
                kind: "unavailable",
                message: `Transmission RPC responded with ${json.result}`,
            };
        }

        return { kind: "ok", value: json.arguments };
    }
}
