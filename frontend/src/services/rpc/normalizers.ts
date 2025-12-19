import type {
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionTorrentFile,
    TransmissionTorrentPeer,
    TransmissionTorrentTracker,
} from "./types";
import type {
    LibtorrentPriority,
    TorrentDetailEntity,
    TorrentEntity,
    TorrentFileEntity,
    TorrentPeerEntity,
    TorrentTrackerEntity,
} from "./entities";

const STATUS_MAP: Record<number, TorrentEntity["state"]> = {
    0: "paused",
    1: "checking",
    2: "checking",
    3: "queued",
    4: "downloading",
    5: "queued",
    6: "seeding",
    7: "paused",
};

const normalizeStatus = (
    status: number | TorrentEntity["state"] | undefined
): TorrentEntity["state"] => {
    if (typeof status === "string") {
        return status;
    }
    if (typeof status === "number") {
        return STATUS_MAP[status] ?? "paused";
    }
    return "paused";
};

const mapPriority = (priority: number): LibtorrentPriority => {
    if (priority <= -1) return 0;
    if (priority === 0) return 4;
    return 7;
};

const normalizeFile = (
    file: TransmissionTorrentFile,
    index: number
): TorrentFileEntity => ({
    name: file.name,
    index,
    length: file.length,
    bytesCompleted: file.bytesCompleted,
    progress: file.percentDone,
    priority: mapPriority(file.priority),
    wanted: file.wanted,
});

const normalizeTracker = (
    tracker: TransmissionTorrentTracker
): TorrentTrackerEntity => ({
    id: tracker.tier,
    announce: tracker.announce,
    tier: tracker.tier,
    announceState: tracker.announceState,
    lastAnnounceTime: tracker.lastAnnounceTime,
    lastAnnounceResult: tracker.lastAnnounceResult,
    lastAnnounceSucceeded: tracker.lastAnnounceSucceeded,
    lastScrapeTime: tracker.lastScrapeTime,
    lastScrapeResult: tracker.lastScrapeResult,
    lastScrapeSucceeded: tracker.lastScrapeSucceeded,
    seederCount: tracker.seederCount,
    leecherCount: tracker.leecherCount,
    scrapeState: tracker.scrapeState,
});

const normalizePeer = (peer: TransmissionTorrentPeer): TorrentPeerEntity => ({
    address: peer.address,
    clientIsChoking: peer.clientIsChoking,
    clientIsInterested: peer.clientIsInterested,
    peerIsChoking: peer.peerIsChoking,
    peerIsInterested: peer.peerIsInterested,
    clientName: peer.clientName,
    rateToClient: peer.rateToClient,
    rateToPeer: peer.rateToPeer,
    progress: peer.progress,
    flagStr: peer.flagStr,
    country: peer.country,
});

export const normalizeTorrent = (
    torrent: TransmissionTorrent
): TorrentEntity => {
    const state = normalizeStatus(torrent.status);
    const verificationProgress =
        state === "checking"
            ? torrent.recheckProgress ?? torrent.percentDone
            : undefined;
    return {
        id: torrent.hashString,
        hash: torrent.hashString,
        name: torrent.name,
        progress: torrent.percentDone,
        state,
        verificationProgress,
        speed: {
            down: torrent.rateDownload,
            up: torrent.rateUpload,
        },
        peerSummary: {
            connected: torrent.peersConnected,
            total: torrent.peersConnected,
            sending: torrent.peersSendingToUs,
            getting: torrent.peersGettingFromUs,
            seeds: torrent.peersSendingToUs,
        },
        totalSize: torrent.totalSize,
        eta: torrent.eta,
        queuePosition: torrent.queuePosition,
        ratio: torrent.uploadRatio,
        uploaded: torrent.uploadedEver,
        downloaded: torrent.downloadedEver,
        leftUntilDone: torrent.leftUntilDone,
        sizeWhenDone: torrent.sizeWhenDone,
        error: torrent.error,
        errorString: torrent.errorString,
        isFinished: torrent.isFinished,
        sequentialDownload: torrent.sequentialDownload,
        superSeeding: torrent.superSeeding,
        added: torrent.addedDate,
        savePath: torrent.downloadDir,
        rpcId: torrent.id,
    };
};

export const normalizeTorrentDetail = (
    detail: TransmissionTorrentDetail
): TorrentDetailEntity => ({
    ...normalizeTorrent(detail),
    files: detail.files?.map(normalizeFile),
    trackers: detail.trackers?.map(normalizeTracker),
    peers: detail.peers?.map(normalizePeer),
    pieceCount: detail.pieceCount,
    pieceSize: detail.pieceSize,
    pieceStates: detail.pieceStates,
    pieceAvailability: detail.pieceAvailability,
    downloadDir: detail.downloadDir,
});
