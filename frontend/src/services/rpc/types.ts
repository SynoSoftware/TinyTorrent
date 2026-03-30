export type RpcTorrentStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TransmissionPriority = -1 | 0 | 1;

export interface TransmissionPeerSourceCounts {
    fromCache?: number;
    fromDht?: number;
    fromIncoming?: number;
    fromLpd?: number;
    fromLtep?: number;
    fromPex?: number;
    fromTracker?: number;
}

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
    haveValid?: number;
    haveUnchecked?: number;
    doneDate?: number;
    secondsDownloading?: number;
    secondsSeeding?: number;
    downloadDir?: string;
    leftUntilDone?: number;
    sizeWhenDone?: number;
    error?: number;
    errorString?: string;
    peersSendingToUs?: number;
    peersGettingFromUs?: number;
    peersFrom?: TransmissionPeerSourceCounts;
    desiredAvailable?: number;
    metadataPercentComplete?: number;
    webseedsSendingToUs?: number;
    isStalled?: boolean;
    isFinished?: boolean;
    "sequential_download"?: boolean;
    sequentialDownload?: boolean;
    superSeeding?: boolean;
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

export interface TransmissionTorrentFile {
    name: string;
    length: number;
    bytesCompleted?: number;
}

export interface TransmissionTorrentFileStat {
    wanted: boolean;
    priority: TransmissionPriority;
}

export interface TransmissionTorrentTracker {
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

export interface TransmissionTorrentPeer {
    address: string;
    port: number;
    clientIsChoking: boolean;
    clientIsInterested: boolean;
    clientName: string;
    flagStr: string;
    isDownloadingFrom: boolean;
    isEncrypted: boolean;
    isIncoming: boolean;
    isUploadingTo: boolean;
    isUtp: boolean;
    peerIsChoking: boolean;
    peerIsInterested: boolean;
    progress: number;
    bytesToClient: number;
    bytesToPeer: number;
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
    "torrent_added_verify_mode"?: "fast" | "full";
    "torrent_complete_verify_enabled"?: boolean;
    seedRatioLimit?: number;
    seedRatioLimited?: boolean;
    "idle-seeding-limit"?: number;
    "idle-seeding-limit-enabled"?: boolean;
    "download-queue-enabled"?: boolean;
    "download-queue-size"?: number;
    "queue-stalled-enabled"?: boolean;
    "queue-stalled-minutes"?: number;
    "seed-queue-enabled"?: boolean;
    "seed-queue-size"?: number;
    "sequential_download"?: boolean;
    sequentialDownload?: boolean;
    version?: string;
    platform?: string;
    "rpc-version"?: number;
    "rpc-version-semver"?: string;
    ui?: {
        autoOpen?: boolean;
        autorunHidden?: boolean;
        showSplash?: boolean;
    };
}

export type DaemonPathStyle = "windows" | "posix" | "unknown";

export interface TransmissionFreeSpace {
    path: string;
    sizeBytes: number;
    totalSize?: number;
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
