// FILE: src/services/rpc/normalizers.ts

import type {
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionTorrentFile,
    TransmissionTorrentFileStat,
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
    TorrentStatus,
    ErrorEnvelope,
    ErrorClass,
    RecoveryState,
    RecoveryAction,
} from "./entities";
import { buildErrorEnvelope } from "./recovery";

const STATUS_MAP: Record<number, TorrentStatus> = {
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
    status: number | TorrentStatus | undefined
): TorrentStatus => {
    if (typeof status === "string") {
        return status;
    }
    if (typeof status === "number") {
        return STATUS_MAP[status] ?? "paused";
    }
    return "paused";
};

// Transmission error semantics:
// error: 0 = OK, 1/2 = tracker warning/error, 3 = local error
const hasRpcError = (torrent: Pick<TransmissionTorrent, "error">) =>
    typeof torrent.error === "number" && torrent.error !== 0;

const normalizeErrorString = (value: unknown) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length > 0 ? s : undefined;
};

// Note: classification for recovery is centralized in `buildErrorEnvelope`.

const numOr = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const deriveTorrentState = (
    base: TorrentStatus,
    torrent: Pick<
        TransmissionTorrent,
        | "error"
        | "errorString"
        | "rateDownload"
        | "rateUpload"
        | "peersConnected"
        | "peersSendingToUs"
        | "peersGettingFromUs"
        | "percentDone"
    >
): TorrentStatus => {
    // 1) Error classification (authoritative)
    if (hasRpcError(torrent)) {
        const env = buildErrorEnvelope(torrent as TransmissionTorrent);
        return env.errorClass === "missingFiles" ? "missing_files" : "error";
    }

    // 2) Base states that must never be overridden
    if (base === "paused" || base === "checking" || base === "queued") {
        return base;
    }

    // 🔒 3) Completed torrents are NEVER stalled
    if (torrent.percentDone === 1) {
        return "seeding";
    }

    const down = numOr(torrent.rateDownload, 0);
    const connected = numOr(torrent.peersConnected, 0);
    const sendingToUs = numOr(torrent.peersSendingToUs, 0);

    // 4) Stalled applies ONLY to downloading
    if (base === "downloading") {
        const noTraffic = down === 0;
        const noUsefulPeers = connected === 0 || sendingToUs === 0;
        return noTraffic && noUsefulPeers ? "stalled" : "downloading";
    }

    return base;
};

// Error envelope is computed centrally in the recovery domain.

const mapPriority = (priority?: number): LibtorrentPriority => {
    const normalized = typeof priority === "number" ? priority : 0;
    if (normalized <= -1) return 0;
    if (normalized === 0) return 4;
    return 7;
};

const sanitizeFileName = (value: string | undefined, index: number) => {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length > 0) {
        return trimmed;
    }
    return `file-${index}`;
};

const zipFileEntities = (
    detail: TransmissionTorrentDetail
): TorrentFileEntity[] => {
    const files = detail.files ?? [];
    const stats = detail.fileStats ?? [];
    const fileCount = files.length;
    const statsCount = stats.length;
    const hasStats = statsCount > 0;
    const limit = hasStats ? Math.min(fileCount, statsCount) : fileCount;
    if (hasStats && fileCount !== statsCount) {
        console.warn(
            `[tiny-torrent][rpc] file/fileStats length mismatch for torrent ${detail.hashString}: files=${fileCount} fileStats=${statsCount}`
        );
    } else if (!hasStats && fileCount > 0) {
        console.warn(
            `[tiny-torrent][rpc] missing fileStats for torrent ${detail.hashString}`
        );
    }
    const result: TorrentFileEntity[] = [];
    for (let index = 0; index < limit; ++index) {
        const file: TransmissionTorrentFile = files[index];
        const stat: TransmissionTorrentFileStat | undefined = stats[index];
        const length =
            typeof file.length === "number" ? file.length : undefined;
        const bytesCompleted =
            typeof file.bytesCompleted === "number"
                ? file.bytesCompleted
                : undefined;
        const progress =
            length && typeof bytesCompleted === "number" && length > 0
                ? Math.min(bytesCompleted / length, 1)
                : undefined;
        result.push({
            name: sanitizeFileName(file.name, index),
            index,
            length,
            bytesCompleted,
            progress,
            priority: mapPriority(stat?.priority),
            wanted: stat?.wanted ?? true,
        });
    }
    return result;
};

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
    // Preserve missing data as NaN instead of fabricating 0 so the UI
    // can differentiate "missing" vs "zero".
    seederCount: Number.isFinite(Number(tracker.seederCount))
        ? Number(tracker.seederCount)
        : NaN,
    leecherCount: Number.isFinite(Number(tracker.leecherCount))
        ? Number(tracker.leecherCount)
        : NaN,
    scrapeState: tracker.scrapeState,
});

const normalizePeer = (peer: TransmissionTorrentPeer): TorrentPeerEntity => ({
    address: peer.address,
    clientIsChoking: Boolean(peer.clientIsChoking),
    clientIsInterested: Boolean(peer.clientIsInterested),
    peerIsChoking: Boolean(peer.peerIsChoking),
    peerIsInterested: Boolean(peer.peerIsInterested),
    // Keep clientName as-is (empty string allowed). For numeric fields,
    // preserve missing values as NaN so the UI can show "unknown" states
    // instead of fabricating zero values.
    clientName: peer.clientName ?? "",
    rateToClient: Number.isFinite(Number(peer.rateToClient))
        ? Number(peer.rateToClient)
        : NaN,
    rateToPeer: Number.isFinite(Number(peer.rateToPeer))
        ? Number(peer.rateToPeer)
        : NaN,
    // Progress is safe to default to 0 for rendering geometry.
    progress: Number.isFinite(Number(peer.progress))
        ? Number(peer.progress)
        : 0,
    flagStr: peer.flagStr ?? "",
    country: peer.country,
});

export const normalizeTorrent = (
    torrent: TransmissionTorrent
): TorrentEntity => {
    const baseState = normalizeStatus(torrent.status);
    const derivedState = deriveTorrentState(baseState, torrent);

    const progress =
        derivedState === "missing_files" ? undefined : torrent.percentDone;

    const verificationProgress =
        derivedState === "checking" ? torrent.recheckProgress : undefined;

    // Use the hashString when present, otherwise fall back to the numeric RPC id
    // as a string. Some engines may omit or mis-populate hashString which would
    // otherwise cause all entries to collapse to a single map key.
    const primaryId = torrent.hashString || String(torrent.id);

    const normalizedTorrent = {
        id: primaryId,
        hash: torrent.hashString ?? String(torrent.id),
        name: torrent.name,
        progress: progress,
        state: derivedState,
        verificationProgress: verificationProgress,
        speed: {
            down: numOr(torrent.rateDownload, 0),
            up: numOr(torrent.rateUpload, 0),
        },
        peerSummary: {
            connected: numOr(torrent.peersConnected, 0),
            total: numOr(torrent.peersConnected, 0),
            sending: numOr(torrent.peersSendingToUs, 0),
            getting: numOr(torrent.peersGettingFromUs, 0),
            seeds: numOr(torrent.peersSendingToUs, 0),
        },
        totalSize: numOr(torrent.totalSize, 0),
        eta: numOr(torrent.eta, -1),
        queuePosition: torrent.queuePosition,
        ratio: numOr(torrent.uploadRatio, 0),
        uploaded: numOr(torrent.uploadedEver, 0),
        downloaded: numOr(torrent.downloadedEver, 0),
        leftUntilDone: torrent.leftUntilDone,
        sizeWhenDone: torrent.sizeWhenDone,
        error: torrent.error,
        errorString: normalizeErrorString(torrent.errorString),
        isFinished: torrent.isFinished,
        sequentialDownload: torrent.sequentialDownload,
        superSeeding: torrent.superSeeding,
        added: numOr(torrent.addedDate, Math.floor(Date.now() / 1000)),
        savePath: torrent.downloadDir,
        rpcId: torrent.id,
        errorEnvelope: buildErrorEnvelope(torrent),
    };

    //console.debug("[torrent] Normalized torrent:", normalizedTorrent);

    return normalizedTorrent;
};

export const normalizeTorrentDetail = (
    detail: TransmissionTorrentDetail
): TorrentDetailEntity => {
    const normalizedFiles = zipFileEntities(detail);
    const base = normalizeTorrent(detail);
    // enrich envelope with tracker-aware insights when available
    const envelope = buildErrorEnvelope(detail, detail);
    return {
        ...base,
        files: normalizedFiles,
        trackers: detail.trackers?.map(normalizeTracker),
        peers: detail.peers?.map(normalizePeer),
        pieceCount: detail.pieceCount,
        pieceSize: detail.pieceSize,
        pieceStates: detail.pieceStates,
        pieceAvailability: detail.pieceAvailability,
        downloadDir: detail.downloadDir,
        errorEnvelope: envelope,
    };
};
