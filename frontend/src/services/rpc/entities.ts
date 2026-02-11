import type { TorrentStatus } from "@/shared/status";
export type { TorrentStatus } from "@/shared/status";

export interface TorrentSpeed {
    down: number;
    up: number;
}

export interface TorrentPeers {
    connected: number;
    total?: number;
    sending?: number;
    getting?: number;
    seeds?: number;
}

export type LibtorrentPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ErrorClass =
    | "none"
    | "trackerWarning"
    | "trackerError"
    | "localError"
    | "diskFull"
    | "permissionDenied"
    | "missingFiles"
    | "partialFiles"
    | "metadata"
    | "unknown";

export type RecoveryState =
    | "ok"
    | "transientWaiting"
    | "needsUserAction"
    | "needsUserConfirmation"
    | "verifying"
    | "blocked";

export type RecoveryAction =
    | "reannounce"
    | "forceRecheck"
    | "resume"
    | "pause"
    | "changeLocation"
    | "openFolder"
    | "removeReadd"
    | "reDownload"
    | "setLocation"
    | "dismiss";

export type RecoveryConfidence = "certain" | "likely" | "unknown";
export type MissingFilesClassificationKind =
    | "dataGap"
    | "pathLoss"
    | "volumeLoss"
    | "accessDenied";

export interface ErrorEnvelope {
    errorClass: ErrorClass;
    errorMessage: string | null;
    lastErrorAt: number | null;
    recoveryState: RecoveryState;
    retryCount?: number | null;
    nextRetryAt?: number | null;
    recoveryActions: RecoveryAction[];
    // Hint object for future automation (non-op for now). Consumer may use
    // this to present suggested escalation without performing actions.
    automationHint?: {
        recommendedAction?: RecoveryAction | null;
        reason?: string | null;
    } | null;
    recoveryKind?: MissingFilesClassificationKind;
    recoveryConfidence?: RecoveryConfidence;
    // Stable fingerprint suitable as a persistence key for later automation.
    // Deterministic; do not include transient timestamps. Null if unavailable.
    fingerprint?: string | null;
    // Deterministic primary action selected from recoveryActions according to
    // engine capabilities and recoveryState. Null when no action selected.
    primaryAction?: RecoveryAction | null;
}

export interface TorrentFileEntity {
    name: string;
    index: number;
    length?: number;
    bytesCompleted?: number;
    progress?: number;
    priority?: LibtorrentPriority;
    wanted?: boolean;
}

export interface TorrentTrackerEntity {
    id?: number;
    announce: string;
    tier: number;
    announceState?: number;
    lastAnnounceTime: number;
    lastAnnounceResult: string;
    lastAnnounceSucceeded: boolean;
    lastScrapeTime: number;
    lastScrapeResult: string;
    lastScrapeSucceeded: boolean;
    seederCount: number;
    leecherCount: number;
    scrapeState?: number;
}

export interface TorrentPeerEntity {
    address: string;
    clientIsChoking: boolean;
    clientIsInterested: boolean;
    peerIsChoking: boolean;
    peerIsInterested: boolean;
    clientName: string;
    rateToClient: number;
    rateToPeer: number;
    progress: number;
    flagStr: string;
    country?: string;
}

export interface TorrentEntity {
    id: string;
    hash: string;
    name: string;
    progress?: number;
    verificationProgress?: number;
    state: TorrentStatus;
    speed: TorrentSpeed;
    peerSummary: TorrentPeers;
    totalSize: number;
    eta: number;
    queuePosition?: number;
    ratio: number;
    uploaded: number;
    downloaded: number;
    leftUntilDone?: number;
    sizeWhenDone?: number;
    error?: number;
    errorString?: string;
    isFinished?: boolean;
    sequentialDownload?: boolean;
    superSeeding?: boolean;
    pieceAvailability?: number[];
    added: number;
    savePath?: string;
    /**
     * Backwards-compatible alias for the download directory exposed by some
     * engine adapters (present on TorrentDetailEntity); include here so table
     * consumers can read a path without requiring a details fetch.
     */
    downloadDir?: string;
    rpcId?: number;
    isGhost?: boolean;
    ghostLabel?: string;
    ghostState?: string;
    errorEnvelope?: ErrorEnvelope;
}

export interface TorrentDetailEntity extends TorrentEntity {
    files?: TorrentFileEntity[];
    trackers?: TorrentTrackerEntity[];
    peers?: TorrentPeerEntity[];
    pieceCount?: number;
    pieceSize?: number;
    pieceStates?: number[];
    pieceAvailability?: number[];
    downloadDir?: string;
}

export interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    metainfoPath?: string;
    downloadDir?: string;
    paused?: boolean;
    filesUnwanted?: number[];
    priorityHigh?: number[];
    priorityNormal?: number[];
    priorityLow?: number[];
}

export interface AddTorrentResult {
    id: string;
    rpcId: number;
    name?: string;
    duplicate?: boolean;
}

export interface SessionStats {
    downloadSpeed: number;
    uploadSpeed: number;
    torrentCount: number;
    activeTorrentCount: number;
    pausedTorrentCount: number;
    dhtNodes?: number;
    // Optional free space for the configured download directory. Some
    // adapters expose this via session-get or telemetry; include here for
    // backward-compatible reads from `sessionStats`.
    downloadDirFreeSpace?: number;
    // Optional network telemetry snapshot. Prefer this over attaching
    // implementation-specific hidden properties at runtime.
    networkTelemetry?: NetworkTelemetry;
}

export type EngineType = "transmission" | "libtorrent" | "unknown";

export interface EngineFeatureFlags {
    sequentialDownload: boolean;
    superSeeding: boolean;
    trackerReannounce: boolean;
}

export interface EngineInfo {
    type: EngineType;
    name?: string;
    version?: string;
    capabilities: EngineFeatureFlags;
}

export type ServerClass = "tinytorrent" | "transmission" | "unknown";
// TODO: Deprecate `ServerClass` as a UX-driving concept. With “RPC extensions: NONE”, all servers speak Transmission RPC.
// TODO: If retained temporarily, `ServerClass` must be treated as diagnostics-only (logging/debug panels), not as a feature/capability switch.
// TODO: Any "Full vs Rpc UI" behavior must be expressed via `uiMode = "Full" | "Rpc"` derived locally (endpoint host + ShellAgent/ShellExtensions availability), not via a server-reported class.

export interface NetworkTelemetry {
    dhtEnabled?: boolean;
    pexEnabled?: boolean;
    lpdEnabled?: boolean;
    portForwardingEnabled?: boolean;
    altSpeedEnabled?: boolean;
    downloadDirFreeSpace?: number;
    downloadQueueEnabled?: boolean;
    seedQueueEnabled?: boolean;
}
