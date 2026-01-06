export const STATUS = {
    engine: {
        DETECTING: "detecting",
        UNKNOWN: "unknown",
        HEALTHY: "healthy",
        DEGRADED: "degraded",
    },
    connection: {
        ONLINE: "online",
        CONNECTED: "connected",
        OFFLINE: "offline",
        POLLING: "polling",
        WEBSOCKET: "websocket",
        ERROR: "error",
        IDLE: "idle",
    },
    disk: {
        OK: "ok",
        LOW: "low",
        FULL: "full",
        UNKNOWN: "unknown",
    },
    torrent: {
        DOWNLOADING: "downloading",
        SEEDING: "seeding",
        QUEUED: "queued",
        STALLED: "stalled",
        PAUSED: "paused",
        CHECKING: "checking",
        ERROR: "error",
        MISSING_FILES: "missing_files",
    },
} as const;

export type TorrentStatus =
    (typeof STATUS.torrent)[keyof typeof STATUS.torrent];
export type DiskStatus = (typeof STATUS.disk)[keyof typeof STATUS.disk];
export type ConnectionStatus =
    (typeof STATUS.connection)[keyof typeof STATUS.connection];
export type EngineStatus = (typeof STATUS.engine)[keyof typeof STATUS.engine];

export default STATUS;
