export type RpcTorrentStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TorrentStatus =
    | "downloading"
    | "seeding"
    | "paused"
    | "checking"
    | "error"
    | "queued";

export interface TransmissionTorrent {
    id: number;
    hashString: string;
    name: string;
    totalSize: number;
    percentDone: number;
    recheckProgress?: number;
    status: RpcTorrentStatus;
    rateDownload: number;
    rateUpload: number;
    peersConnected: number;
    eta: number;
    addedDate: number;
    queuePosition?: number;
    uploadRatio: number;
    uploadedEver: number;
    downloadedEver: number;
    downloadDir?: string;
    leftUntilDone?: number;
    sizeWhenDone?: number;
    error?: number;
    errorString?: string;
    peersSendingToUs?: number;
    peersGettingFromUs?: number;
    isFinished?: boolean;
    sequentialDownload?: boolean;
    superSeeding?: boolean;
}

export interface TransmissionTorrentFile {
    name: string;
    length: number;
    bytesCompleted?: number;
}

export interface TransmissionTorrentFileStat {
    wanted: boolean;
    priority: number;
}

export interface TransmissionTorrentTracker {
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

export interface TransmissionTorrentPeer {
    address: string;
    clientIsChoking: boolean;
    clientIsInterested: boolean;
    clientName: string;
    country?: string;
    flagStr: string;
    peerIsChoking: boolean;
    peerIsInterested: boolean;
    progress: number;
    rateToClient: number;
    rateToPeer: number;
}

export interface TransmissionTorrentDetail extends TransmissionTorrent {
    files: TransmissionTorrentFile[];
    trackers: TransmissionTorrentTracker[];
    peers: TransmissionTorrentPeer[];
    fileStats?: TransmissionTorrentFileStat[];
    pieceCount?: number;
    pieceSize?: number;
    pieceStates?: number[];
    pieceAvailability?: number[];
}

export interface TransmissionPollResponse {
    torrents: TransmissionTorrent[];
}

export interface TransmissionSessionSettings {
    "peer-port"?: number;
    "peer-port-random-on-start"?: boolean;
    "port-forwarding-enabled"?: boolean;
    encryption?: "required" | "preferred" | "tolerated";
    "speed-limit-down"?: number;
    "speed-limit-down-enabled"?: boolean;
    "speed-limit-up"?: number;
    "speed-limit-up-enabled"?: boolean;
    "alt-speed-enabled"?: boolean;
    "alt-speed-down"?: number;
    "alt-speed-up"?: number;
    "alt-speed-time-enabled"?: boolean;
    "alt-speed-time-begin"?: number;
    "alt-speed-time-end"?: number;
    "alt-speed-time-day"?: number;
    "peer-limit-global"?: number;
    "peer-limit-per-torrent"?: number;
    "lpd-enabled"?: boolean;
    "dht-enabled"?: boolean;
    "pex-enabled"?: boolean;
    "blocklist-enabled"?: boolean;
    "blocklist-url"?: string;
    "download-dir"?: string;
    "incomplete-dir-enabled"?: boolean;
    "incomplete-dir"?: string;
    "rename-partial-files"?: boolean;
    "start-added-torrents"?: boolean;
    seedRatioLimit?: number;
    seedRatioLimited?: boolean;
    "idle-seeding-limit"?: number;
    "idle-seeding-limit-enabled"?: boolean;
    version?: string;
    "rpc-version"?: number;
    ui?: {
        autoOpen?: boolean;
        autorunHidden?: boolean;
        showSplash?: boolean;
        splashMessage?: string;
    };
}

export interface TransmissionFreeSpace {
    path: string;
    sizeBytes: number;
    totalSize?: number;
}

export type DirectoryEntryType = "drive" | "folder";

export interface DirectoryNode {
    name: string;
    path: string;
    type: DirectoryEntryType;
    totalBytes?: number;
    freeBytes?: number;
    children?: DirectoryNode[];
}

export interface DirectoryBrowseResult {
    path: string;
    parentPath?: string;
    separator?: string;
    entries: DirectoryNode[];
}

export interface TransmissionSessionStatsTotals {
    uploadedBytes: number;
    downloadedBytes: number;
    filesAdded: number;
    secondsActive: number;
    sessionCount: number;
}

export interface TransmissionSessionStats {
    activeTorrentCount: number;
    downloadSpeed: number;
    pausedTorrentCount: number;
    torrentCount: number;
    uploadSpeed: number;
    dhtNodes?: number;
    cumulativeStats: TransmissionSessionStatsTotals;
    currentStats: TransmissionSessionStatsTotals;
}

export interface TransmissionBandwidthGroupOptions {
    name: string;
    honorsSessionLimits?: boolean;
    speedLimitDown?: number;
    speedLimitDownEnabled?: boolean;
    speedLimitUp?: number;
    speedLimitUpEnabled?: boolean;
}

export interface TransmissionTorrentRenameResult {
    id: number;
    name: string;
    path: string;
}

export interface SystemInstallOptions {
    name?: string;
    args?: string;
    locations?: string[];
    registerHandlers?: boolean;
    installToProgramFiles?: boolean;
}

export interface SystemInstallResult {
    action: "system-install";
    success: boolean;
    permissionDenied?: boolean;
    message?: string;
    shortcuts?: Record<string, string>;
    installSuccess?: boolean;
    installMessage?: string;
    installedPath?: string;
    handlersRegistered?: boolean;
    handlerMessage?: string;
}
