export type TorrentStatus =
    | "downloading"
    | "seeding"
    | "paused"
    | "checking"
    | "error"
    | "queued";

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
    progress: number;
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
}

export interface AddTorrentPayload {
    magnetLink?: string;
    metainfo?: string;
    downloadDir?: string;
    paused?: boolean;
    filesUnwanted?: number[];
}

export interface SessionStats {
    downloadSpeed: number;
    uploadSpeed: number;
    torrentCount: number;
    activeTorrentCount: number;
    pausedTorrentCount: number;
    dhtNodes?: number;
}

export type EngineType = "transmission" | "libtorrent" | "unknown";

export interface EngineCapabilities {
    sequentialDownload: boolean;
    superSeeding: boolean;
    trackerReannounce: boolean;
}

export interface EngineInfo {
    type: EngineType;
    name?: string;
    version?: string;
    capabilities: EngineCapabilities;
}
