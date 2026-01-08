import { RpcCommandError } from "./rpc/errors";

interface RpcRequest {
    method: string;
    arguments?: Record<string, unknown>;
    tag?: number;
}

interface RpcResponse<T = any> {
    result: string;
    arguments: T;
}

export class TransmissionRpcTransport {
    private sessionId: string | null = null;
    private endpoint: string;
    private authHeader?: string;

    // 1. Request Coalescing Map (Deduplication)
    private inflightRequests = new Map<string, Promise<any>>();

    // 2. Short-lived Cache (TTL)
    private responseCache = new Map<string, { val: any; ts: number }>();
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
            this.authHeader =
                "Basic " + btoa(`${credentials.user}:${credentials.pass}`);
        }
    }

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
            this.clearResponseCache();
        } catch {}
    }

    public getSessionId(): string | undefined {
        return this.sessionId ?? undefined;
    }

    public async fetchWithSession(
        requestInit: RequestInit,
        controller?: AbortController,
        keepalive = false
    ): Promise<Response> {
        if (controller) {
            requestInit.signal = controller.signal;
        }
        if (keepalive) {
            (requestInit as any).keepalive = true;
        }

        const attempt = async (retry = false): Promise<Response> => {
            const headers: Record<string, string> = Object.assign(
                {},
                (requestInit.headers as Record<string, string>) ?? {}
            );
            if (this.sessionId) {
                headers["X-Transmission-Session-Id"] = this.sessionId as string;
            }
            if (this.authHeader) {
                headers["Authorization"] = this.authHeader;
            }
            requestInit.headers = headers;

            const response = await fetch(this.endpoint, requestInit);

            // Some tests/mock environments provide a lightweight object
            // that looks like a Response but lacks `status` or `headers`.
            // Be defensive: derive numeric status from `status` when
            // present, otherwise infer from `ok`.
            const status: number =
                typeof (response as any)?.status === "number"
                    ? (response as any).status
                    : (response as any)?.ok
                    ? 200
                    : 0;

            if (status === 409) {
                // Try to obtain a session token from headers when available
                let token: string | null | undefined = undefined;
                try {
                    token = (response as any)?.headers?.get
                        ? (response as any).headers.get(
                              "X-Transmission-Session-Id"
                          )
                        : undefined;
                } catch {}

                if (!token) {
                    try {
                        token = await this.probeForSessionId(controller);
                    } catch {}
                }
                if (!token) {
                    this.sessionId = null;
                    throw new Error("Transmission RPC missing session id");
                }
                this.sessionId = token;
                if (retry) {
                    this.sessionId = null;
                    throw new Error("Transmission RPC session conflict");
                }
                return attempt(true);
            }

            // Update session id if present on response headers (defensive)
            try {
                const currentToken = (response as any)?.headers?.get
                    ? (response as any).headers.get("X-Transmission-Session-Id")
                    : null;
                if (currentToken && currentToken !== this.sessionId) {
                    this.sessionId = currentToken;
                }
            } catch {}

            return response;
        };

        return attempt(false);
    }

    private async probeForSessionId(
        controller?: AbortController
    ): Promise<string | null> {
        const methods: Array<RequestInit["method"]> = [
            "OPTIONS",
            "HEAD",
            "GET",
        ];
        const headersBase: Record<string, string> = {
            "Content-Type": "application/json",
        };
        for (const method of methods) {
            try {
                const resp = await fetch(this.endpoint, {
                    method,
                    headers: headersBase,
                    signal: controller?.signal,
                });
                const token = resp.headers.get("X-Transmission-Session-Id");
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
                return cached.val;
            }
        }

        // B. Coalescing (Deduplication)
        // If this exact request is already flying, return the existing promise
        if (this.inflightRequests.has(cacheKey)) {
            return this.inflightRequests.get(cacheKey);
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
            const result = await promise;
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
        args: any,
        controller?: AbortController
    ): Promise<T> {
        const requestInit: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method, arguments: args }),
        };

        const res = await this.fetchWithSession(requestInit, controller, false);

        // Handle unauthorized responses explicitly so callers can react.
        if (res.status === 401) {
            const e: any = new Error("TinyTorrent RPC unauthorized");
            e.status = 401;
            throw e;
        }
        if (res.status === 403) {
            const e: any = new Error("TinyTorrent RPC forbidden");
            e.status = 403;
            throw e;
        }

        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

        const json: RpcResponse<T> = await res.json();
        if (json.result !== "success") {
            throw new RpcCommandError(json.result, json.result);
        }

        return json.arguments;
    }
}
