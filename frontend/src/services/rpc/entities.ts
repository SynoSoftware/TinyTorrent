import type { TorrentTransportStatus } from "@/shared/status";
export type { TorrentStatus, TorrentTransportStatus } from "@/shared/status";

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

export interface TorrentPeerDiscoverySources {
    cache?: number;
    dht?: number;
    incoming?: number;
    lpd?: number;
    ltep?: number;
    pex?: number;
    tracker?: number;
}

export type LibtorrentPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
    scrape?: string;
    tier: number;
    announceState?: number;
    downloadCount?: number;
    downloaderCount?: number;
    hasAnnounced?: boolean;
    hasScraped?: boolean;
    host?: string;
    lastAnnouncePeerCount?: number;
    lastAnnounceStartTime?: number;
    lastAnnounceTime: number;
    lastAnnounceTimedOut?: boolean;
    lastAnnounceResult: string;
    lastAnnounceSucceeded: boolean;
    lastScrapeStartTime?: number;
    lastScrapeTime: number;
    lastScrapeTimedOut?: boolean;
    lastScrapeResult: string;
    lastScrapeSucceeded: boolean;
    seederCount: number;
    leecherCount: number;
    scrapeState?: number;
    nextAnnounceTime?: number;
    nextScrapeTime?: number;
    isBackup?: boolean;
    sitename?: string;
}

export interface TorrentPeerEntity {
    address: string;
    port: number;
    clientIsChoking: boolean;
    clientIsInterested: boolean;
    peerIsChoking: boolean;
    peerIsInterested: boolean;
    isDownloadingFrom: boolean;
    isEncrypted: boolean;
    isIncoming: boolean;
    isUploadingTo: boolean;
    isUtp: boolean;
    clientName: string;
    bytesToClient: number;
    bytesToPeer: number;
    rateToClient: number;
    rateToPeer: number;
    progress: number;
    flagStr: string;
}

export interface TorrentEntity {
    id: string;
    hash: string;
    name: string;
    progress?: number;
    verificationProgress?: number;
    state: TorrentTransportStatus;
    speed: TorrentSpeed;
    peerSummary: TorrentPeers;
    totalSize: number;
    eta: number;
    queuePosition?: number;
    ratio: number;
    uploaded: number;
    downloaded: number;
    haveValid?: number;
    haveUnchecked?: number;
    doneDate?: number;
    secondsDownloading?: number;
    secondsSeeding?: number;
    leftUntilDone?: number;
    sizeWhenDone?: number;
    desiredAvailable?: number;
    error?: number;
    errorString?: string;
    metadataPercentComplete?: number;
    isFinished?: boolean;
    isStalled?: boolean;
    webseedsSendingToUs?: number;
    peersFrom?: TorrentPeerDiscoverySources;
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
    activityDate?: number;
    comment?: string;
    corruptEver?: number;
    creator?: string;
    dateCreated?: number;
    downloadLimit?: number;
    downloadLimited?: boolean;
    isPrivate?: boolean;
    uploadLimit?: number;
    uploadLimited?: boolean;
}

export interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    metainfoPath?: string;
    downloadDir?: string;
    paused?: boolean;
    sequentialDownload?: boolean;
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
