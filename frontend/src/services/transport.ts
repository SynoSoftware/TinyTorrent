import { RpcCommandError } from "./rpc/errors";

interface RpcRequest {
    method: string;
    arguments?: Record<string, unknown>;
    tag?: number;
}

interface RpcResponse<T = unknown> {
    result: string;
    arguments: T;
}

export class TransmissionRpcTransport {
    private sessionId: string | null = null;
    // Shared session token across all Transport instances (helps React Strict Mode)
    private static sharedSessionId: string | null = null;
    private endpoint: string;
    private authHeader?: string;
    // Track controllers for active fetches so we can abort them on reset.
    private inflightControllers = new Set<AbortController>();

    // 1. Request Coalescing Map (Deduplication)
    private inflightRequests = new Map<string, Promise<unknown>>();

    // 2. Short-lived Cache (TTL)
    private responseCache = new Map<string, { val: unknown; ts: number }>();
    private readonly CACHE_TTL_MS = 500;

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
        if (credentials?.user) {
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
                } catch {}
            }
        }
        try {
            // eslint-disable-next-line no-console
            console.debug("[tiny-torrent][transport] created", {
                endpoint: this.endpoint,
            });
        } catch {}
    }
    // TODO: This transport is Transmission-only. Do not add TinyTorrent token auth / websocket logic here.
    // TODO: Capability/locality decisions (localhost vs remote, ShellAgent/ShellExtensions bridge availability) belong to a UI capability provider, not this transport.

    // Probe promise to dedupe concurrent probes for X-Transmission-Session-Id
    // and sessionBarrier are static so multiple Transport instances (e.g.
    // React Strict Mode duplicate mounts) share the same handshake coordination.
    private static probePromise: Promise<string | null> | null = null;
    private static sessionBarrier: Promise<void> | null = null;

    public clearResponseCache(): void {
        try {
            this.responseCache.clear();
        } catch {}
    }

    /**
     * Reset local session state without issuing any network requests.
     * The next outgoing request will trigger the normal 409/session-id
     * handshake flow handled by `fetchWithSession`.
     */
    public resetSession(): void {
        try {
            this.sessionId = null;
        } catch {}
        try {
            TransmissionRpcTransport.sharedSessionId = null;
        } catch {}
        try {
            this.clearResponseCache();
        } catch {}
        try {
            // Abort any in-flight fetches and clear coalesced inflight promises
            this.abortAll();
            this.inflightRequests.clear();
        } catch {}
    }

    public getSessionId(): string | undefined {
        return (
            this.sessionId ??
            TransmissionRpcTransport.sharedSessionId ??
            undefined
        );
    }

    public setSessionId(token: string | null | undefined): void {
        try {
            this.sessionId = token ?? null;
        } catch {}
        try {
            TransmissionRpcTransport.sharedSessionId = token ?? null;
        } catch {}
    }

    public async fetchWithSession(
        requestInit: RequestInit,
        controller?: AbortController,
        keepalive = false
    ): Promise<Response> {
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
                    } catch {}
                };
                if (controller.signal)
                    controller.signal.addEventListener("abort", onAbort);
            } catch {}
        }
        // Track controller for abortAll support
        try {
            this.inflightControllers.add(internalController);
        } catch {}
        requestInit.signal = internalController.signal;
        if (keepalive) {
            (requestInit as RequestInit & { keepalive?: boolean }).keepalive =
                true;
        }

        const attempt = async (retry = false): Promise<Response> => {
            // SESSION BARRIER: if we don't have a sessionId yet and this is not
            // a retry attempt, gate so only one leader will perform the probe.
            if (
                !(this.sessionId ?? TransmissionRpcTransport.sharedSessionId) &&
                !retry
            ) {
                if (!TransmissionRpcTransport.sessionBarrier) {
                    // Synchronously install the barrier so concurrent callers
                    // observe a non-null value and will await the same promise.
                    let resolveBarrier: () => void = () => {};
                    let rejectBarrier: (err?: any) => void = () => {};
                    TransmissionRpcTransport.sessionBarrier = new Promise<void>(
                        (res, rej) => {
                            resolveBarrier = res;
                            rejectBarrier = rej;
                        }
                    );

                    try {
                        // eslint-disable-next-line no-console
                        console.debug(
                            "[tiny-torrent][transport] sessionBarrier installed (leader)",
                            {
                                endpoint: this.endpoint,
                            }
                        );
                    } catch {}

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
                                        } catch {}
                                    }
                                } catch {}
                            }

                            if (token) {
                                this.sessionId = token;
                                try {
                                    TransmissionRpcTransport.sharedSessionId =
                                        token;
                                } catch {}
                            }

                            resolveBarrier();
                        } catch (err) {
                            try {
                                rejectBarrier(err);
                            } catch {}
                        } finally {
                            // clear barrier after resolution so future handshakes
                            // may create a new barrier when needed.
                            TransmissionRpcTransport.sessionBarrier = null;
                        }
                    })();
                }

                try {
                    try {
                        // eslint-disable-next-line no-console
                        console.debug(
                            "[tiny-torrent][transport] awaiting sessionBarrier (worker)",
                            {
                                endpoint: this.endpoint,
                            }
                        );
                    } catch {}
                    await TransmissionRpcTransport.sessionBarrier;
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
                this.sessionId ?? TransmissionRpcTransport.sharedSessionId;
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
            } finally {
                try {
                    this.inflightControllers.delete(internalController);
                } catch {}
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
                } catch {}

                if (!token) {
                    try {
                        // Use a deduped probe so multiple concurrent 409 handlers
                        // share a single probe network request instead of issuing
                        // multiple OPTIONS/HEAD/GET probes.
                        token = await this.probeForSessionId(controller);
                    } catch {}
                }
                if (!token) {
                    this.sessionId = null;
                    TransmissionRpcTransport.sharedSessionId = null;
                    throw new Error("Transmission RPC missing session id");
                }
                this.sessionId = token;
                try {
                    TransmissionRpcTransport.sharedSessionId = token;
                } catch {}
                if (retry) {
                    this.sessionId = null;
                    throw new Error("Transmission RPC session conflict");
                }
                return attempt(true);
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
                        TransmissionRpcTransport.sharedSessionId = currentToken;
                    } catch {}
                }
            } catch {}

            return response;
        };

        return attempt(false);
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
                } catch {}
            }
        } finally {
            try {
                this.inflightControllers.clear();
            } catch {}
        }
    }

    private async probeForSessionId(
        controller?: AbortController
    ): Promise<string | null> {
        // Dedupe concurrent probes so we don't flood the server with
        // OPTIONS/HEAD/GET probes when multiple requests observe 409s.
        if (TransmissionRpcTransport.probePromise)
            return TransmissionRpcTransport.probePromise;

        // Prefer a simple GET probe without custom headers to avoid CORS preflight
        // failures (many Transmission endpoints don't implement OPTIONS/HEAD).
        const methods: Array<RequestInit["method"]> = ["GET"];
        const headersBase: Record<string, string> = {};

        TransmissionRpcTransport.probePromise = (async (): Promise<
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
                        } catch {}
                    } catch {}
                }
                return null;
            } finally {
                // Clear the probe promise so future probes may run if needed.
                TransmissionRpcTransport.probePromise = null;
            }
        })();

        return TransmissionRpcTransport.probePromise;
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
        const cacheKey = `${method}:${this.stableStringify(args ?? null)}`;

        // A. Cache Check
        if (options.cache) {
            const cached = this.responseCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) {
                return cached.val as T;
            }
        }

        // B. Coalescing (Deduplication)
        // If this exact request is already flying, return the existing promise
        if (this.inflightRequests.has(cacheKey)) {
            return this.inflightRequests.get(cacheKey) as Promise<T>;
        }

        // If this is a cached/coalesced read-only request, do NOT wire the
        // caller's AbortSignal into the internal fetch. This prevents one
        // consumer aborting the shared in-flight request for all waiters.
        const allowCallerAbort = !options.cache;
        const execController = allowCallerAbort ? controller : undefined;
        const promise = this.executeWithStateLogic<T>(
            method,
            args,
            execController
        );

        this.inflightRequests.set(cacheKey, promise);

        try {
            const result = (await promise) as T;
            // Update Cache on success
            if (options.cache) {
                this.responseCache.set(cacheKey, {
                    val: result,
                    ts: Date.now(),
                });
            }
            return result;
        } finally {
            // Clean up inflight map
            this.inflightRequests.delete(cacheKey);
        }
    }

    /**
     * The State Machine Logic (Session ID handling)
     */
    private async executeWithStateLogic<T>(
        method: string,
        args: unknown,
        controller?: AbortController
    ): Promise<T> {
        const requestInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method, arguments: args }),
        };

        const res = await this.fetchWithSession(requestInit, controller, false);

        // Handle unauthorized responses explicitly so callers can react.
        // TODO: Rename these error messages to “Transmission RPC ...” (not “TinyTorrent RPC ...”) once the codebase is fully Transmission-only; keep errors consistent across transports/adapters.
        if (res.status === 401) {
            const e = new Error("TinyTorrent RPC unauthorized");
            (e as unknown as { status?: number }).status = 401;
            throw e;
        }
        if (res.status === 403) {
            const e = new Error("TinyTorrent RPC forbidden");
            (e as unknown as { status?: number }).status = 403;
            throw e;
        }

        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

        const jsonRaw = await res.json();
        const json = jsonRaw as RpcResponse<T>;
        if (json.result !== "success") {
            throw new RpcCommandError(json.result, json.result);
        }

        return json.arguments;
    }
}
