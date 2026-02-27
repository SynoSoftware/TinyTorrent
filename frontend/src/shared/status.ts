export type EngineStatus = "detecting" | "unknown" | "healthy" | "degraded";
export type ConnectionStatus =
    | "online"
    | "connected"
    | "offline"
    | "polling"
    | "error"
    | "idle";
export type DiskStatus = "ok" | "low" | "full" | "unknown";
export type TorrentStatus =
    | "downloading"
    | "seeding"
    | "queued"
    | "stalled"
    | "paused"
    | "checking"
    | "error";

export const status = {
    engine: {
        detecting: "detecting",
        unknown: "unknown",
        healthy: "healthy",
        degraded: "degraded",
    },
    connection: {
        online: "online",
        connected: "connected",
        offline: "offline",
        polling: "polling",
        error: "error",
        idle: "idle",
    },
    disk: {
        ok: "ok",
        low: "low",
        full: "full",
        unknown: "unknown",
    },
    torrent: {
        downloading: "downloading",
        seeding: "seeding",
        queued: "queued",
        stalled: "stalled",
        paused: "paused",
        checking: "checking",
        error: "error",
    },
} as const;
