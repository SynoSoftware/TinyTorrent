const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeHost(value: string): string {
    return value.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

export function isLoopbackHost(host: string): boolean {
    if (!host) return false;
    const normalized = normalizeHost(host);
    return LOOPBACK_HOSTS.has(normalized);
}
