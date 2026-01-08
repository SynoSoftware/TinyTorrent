import { RpcCommandError } from "./errors";

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

    /**
     * Public Interface: The rest of the app just calls this.
     * It handles the state machine, retries, and queueing internally.
     */
    public async request<T>(
        method: string,
        args: Record<string, unknown> = {},
        options: { cache?: boolean } = {}
    ): Promise<T> {
        const cacheKey = JSON.stringify({ method, args });

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

        const promise = this.executeWithStateLogic<T>(method, args);

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
        retryCount = 0
    ): Promise<T> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.sessionId)
            headers["X-Transmission-Session-Id"] = this.sessionId;
        if (this.authHeader) headers["Authorization"] = this.authHeader;

        const res = await fetch(this.endpoint, {
            method: "POST",
            body: JSON.stringify({ method, arguments: args }),
            headers,
        });

        // STATE: Session Invalid -> Update -> Retry
        if (res.status === 409) {
            if (retryCount > 0) throw new Error("Infinite 409 Loop Detected");

            this.sessionId = res.headers.get("X-Transmission-Session-Id");
            if (!this.sessionId)
                throw new Error("No Session ID returned in 409");

            // Retry transparently
            return this.executeWithStateLogic(method, args, retryCount + 1);
        }

        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

        const json: RpcResponse<T> = await res.json();
        if (json.result !== "success") {
            throw new RpcCommandError(json.result, json.result);
        }

        return json.arguments;
    }
}
