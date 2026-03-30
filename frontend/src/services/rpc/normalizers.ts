import type {
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionTorrentFile,
    TransmissionTorrentFileStat,
    TransmissionPriority,
    TransmissionTorrentPeer,
    TransmissionPeerSourceCounts,
    TransmissionTorrentTracker,
} from "@/services/rpc/types";
import type {
    LibtorrentPriority,
    TorrentDetailEntity,
    TorrentEntity,
    TorrentFileEntity,
    TorrentPeerDiscoverySources,
    TorrentPeerEntity,
    TorrentTrackerEntity,
} from "@/services/rpc/entities";
import { status, type TorrentTransportStatus } from "@/shared/status";
import { infraLogger } from "@/shared/utils/infraLogger";

const STATUS_MAP: Record<number, TorrentTransportStatus> = {
    0: status.torrent.paused,
    1: status.torrent.checking,
    2: status.torrent.checking,
    3: status.torrent.queued,
    4: status.torrent.downloading,
    5: status.torrent.queued,
    6: status.torrent.seeding,
    7: status.torrent.paused,
};

const isTransportStatus = (value: string): value is TorrentTransportStatus =>
    value === status.torrent.paused ||
    value === status.torrent.checking ||
    value === status.torrent.queued ||
    value === status.torrent.downloading ||
    value === status.torrent.seeding ||
    value === status.torrent.error;

const normalizeStatus = (
    rawStatus: number | TorrentTransportStatus | undefined,
): TorrentTransportStatus => {
    if (typeof rawStatus === "string") {
        return isTransportStatus(rawStatus) ? rawStatus : status.torrent.paused;
    }
    if (typeof rawStatus === "number") {
        return STATUS_MAP[rawStatus] ?? status.torrent.paused;
    }
    return status.torrent.paused;
};

// Transmission error semantics:
// error: 0 = OK, 1/2 = tracker warning/error, 3 = local error
const hasRpcError = (torrent: Pick<TransmissionTorrent, "error">) =>
    typeof torrent.error === "number" && torrent.error !== 0;

const normalizeErrorString = (value: unknown) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length > 0 ? s : undefined;
};

const numOr = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function resetNormalizerRuntimeState() {
    // No-op by contract.
    // RPC normalization is limited to daemon-grounded truth only.
    // UI-derived presentation states such as "stalled" are owned elsewhere.
}

const isCheckingStatusNum = (statusNum: unknown) => statusNum === 1 || statusNum === 2;

export const deriveTorrentState = (base: TorrentTransportStatus, torrent: TransmissionTorrent): TorrentTransportStatus => {
    const statusNum = typeof torrent.status === "number" ? torrent.status : undefined;
    const rawStatusWasUiOnlyStalled =
        (torrent as { status: unknown }).status === status.torrent.stalled;
    const statusIndicatesChecking = isCheckingStatusNum(statusNum);
    const isVerifying = typeof torrent.recheckProgress === "number" && torrent.recheckProgress > 0;
    const currentlyVerifying = isVerifying || statusIndicatesChecking;
    const hasWantedDataRemaining =
        typeof torrent.leftUntilDone === "number" && torrent.leftUntilDone > 0;

    // 1) Active verify is authoritative over stale/local error flags.
    // Transmission may keep error=3 while a manual recheck is in progress.
    // If we keep returning ERROR here, UI never shows checking/progress.
    if (currentlyVerifying) {
        return status.torrent.checking;
    }

    // 2) Error classification (authoritative outside active verify)
    if (hasRpcError(torrent)) {
        return status.torrent.error;
    }

    // 3) Base states that must never be overridden
    if (
        !rawStatusWasUiOnlyStalled &&
        (base === status.torrent.paused || base === status.torrent.checking || base === status.torrent.queued)
    ) {
        return base;
    }

    // 4) Re-opened wanted files must move a previously seeded torrent back to
    // downloading so table status and speed columns reflect the resumed work.
    if (hasWantedDataRemaining) {
        return status.torrent.downloading;
    }

    // Contract:
    // - RPC normalization exposes daemon-grounded state only.
    // - UI-derived presentation states such as "stalled" are not assigned here.
    // - Heartbeat transport policy may depend on these normalized states.
    return base === status.torrent.seeding || torrent.percentDone === 1 || torrent.isFinished === true
        ? status.torrent.seeding
        : base;
};

const mapPriority = (priority?: TransmissionPriority): LibtorrentPriority => {
    const normalized = priority ?? 0;
    if (normalized <= -1) return 1;
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

const zipFileEntities = (detail: TransmissionTorrentDetail): TorrentFileEntity[] => {
    const files = detail.files ?? [];
    const stats = detail.fileStats ?? [];
    const fileCount = files.length;
    const statsCount = stats.length;
    const hasStats = statsCount > 0;
    const limit = hasStats ? Math.min(fileCount, statsCount) : fileCount;
    if (hasStats && fileCount !== statsCount) {
        infraLogger.warn({
            scope: "rpc_normalizer",
            event: "file_stats_length_mismatch",
            message: "Torrent file and fileStats lengths do not match",
            details: {
                torrentHash: detail.hashString,
                filesCount: fileCount,
                fileStatsCount: statsCount,
            },
        });
    } else if (!hasStats && fileCount > 0) {
        infraLogger.warn({
            scope: "rpc_normalizer",
            event: "file_stats_missing",
            message: "Torrent response is missing fileStats",
            details: {
                torrentHash: detail.hashString,
                filesCount: fileCount,
            },
        });
    }
    const result: TorrentFileEntity[] = [];
    for (let index = 0; index < limit; ++index) {
        const file: TransmissionTorrentFile = files[index];
        const stat: TransmissionTorrentFileStat | undefined = stats[index];
        const length = typeof file.length === "number" ? file.length : undefined;
        const bytesCompleted = typeof file.bytesCompleted === "number" ? file.bytesCompleted : undefined;
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

const normalizeTracker = (tracker: TransmissionTorrentTracker): TorrentTrackerEntity => ({
    id: Number.isFinite(Number(tracker.id)) ? Number(tracker.id) : tracker.tier,
    announce: tracker.announce,
    scrape: tracker.scrape,
    tier: tracker.tier,
    announceState: tracker.announceState,
    downloadCount:
        Number.isFinite(Number(tracker.downloadCount))
            ? Number(tracker.downloadCount)
            : undefined,
    downloaderCount:
        Number.isFinite(Number(tracker.downloaderCount))
            ? Number(tracker.downloaderCount)
            : undefined,
    hasAnnounced: tracker.hasAnnounced,
    hasScraped: tracker.hasScraped,
    host: tracker.host,
    lastAnnouncePeerCount:
        Number.isFinite(Number(tracker.lastAnnouncePeerCount))
            ? Number(tracker.lastAnnouncePeerCount)
            : undefined,
    lastAnnounceStartTime:
        Number.isFinite(Number(tracker.lastAnnounceStartTime))
            ? Number(tracker.lastAnnounceStartTime)
            : undefined,
    lastAnnounceTime: tracker.lastAnnounceTime,
    lastAnnounceTimedOut: tracker.lastAnnounceTimedOut ?? false,
    lastAnnounceResult: tracker.lastAnnounceResult,
    lastAnnounceSucceeded: tracker.lastAnnounceSucceeded,
    lastScrapeStartTime:
        Number.isFinite(Number(tracker.lastScrapeStartTime))
            ? Number(tracker.lastScrapeStartTime)
            : undefined,
    lastScrapeTime: tracker.lastScrapeTime,
    lastScrapeTimedOut: tracker.lastScrapeTimedOut ?? false,
    lastScrapeResult: tracker.lastScrapeResult,
    lastScrapeSucceeded: tracker.lastScrapeSucceeded,
    // Preserve missing data as NaN so the UI can render "unknown".
    seederCount: Number.isFinite(Number(tracker.seederCount)) ? Number(tracker.seederCount) : NaN,
    leecherCount: Number.isFinite(Number(tracker.leecherCount)) ? Number(tracker.leecherCount) : NaN,
    scrapeState: tracker.scrapeState,
    nextAnnounceTime:
        Number.isFinite(Number(tracker.nextAnnounceTime))
            ? Number(tracker.nextAnnounceTime)
            : undefined,
    nextScrapeTime:
        Number.isFinite(Number(tracker.nextScrapeTime))
            ? Number(tracker.nextScrapeTime)
            : undefined,
    isBackup: tracker.isBackup ?? false,
    sitename: tracker.sitename,
});

const normalizePeer = (peer: TransmissionTorrentPeer): TorrentPeerEntity => ({
    address: peer.address,
    port: Number.isFinite(Number(peer.port)) ? Number(peer.port) : 0,
    clientIsChoking: Boolean(peer.clientIsChoking),
    clientIsInterested: Boolean(peer.clientIsInterested),
    peerIsChoking: Boolean(peer.peerIsChoking),
    peerIsInterested: Boolean(peer.peerIsInterested),
    isDownloadingFrom: Boolean(peer.isDownloadingFrom),
    isEncrypted: Boolean(peer.isEncrypted),
    isIncoming: Boolean(peer.isIncoming),
    isUploadingTo: Boolean(peer.isUploadingTo),
    isUtp: Boolean(peer.isUtp),
    // Keep clientName as-is (empty string allowed). For numeric fields,
    // preserve missing values as NaN so the UI can show "unknown" states
    // instead of fabricating zero values.
    clientName: peer.clientName ?? "",
    bytesToClient: Number.isFinite(Number(peer.bytesToClient))
        ? Number(peer.bytesToClient)
        : NaN,
    bytesToPeer: Number.isFinite(Number(peer.bytesToPeer))
        ? Number(peer.bytesToPeer)
        : NaN,
    rateToClient: Number.isFinite(Number(peer.rateToClient)) ? Number(peer.rateToClient) : NaN,
    rateToPeer: Number.isFinite(Number(peer.rateToPeer)) ? Number(peer.rateToPeer) : NaN,
    // Progress is safe to default to 0 for rendering geometry.
    progress: Number.isFinite(Number(peer.progress)) ? Number(peer.progress) : 0,
    flagStr: peer.flagStr ?? "",
});

const normalizePeerDiscoverySources = (
    sources?: TransmissionPeerSourceCounts,
): TorrentPeerDiscoverySources | undefined => {
    if (!sources) {
        return undefined;
    }

    return {
        cache: Number.isFinite(Number(sources.fromCache))
            ? Number(sources.fromCache)
            : undefined,
        dht: Number.isFinite(Number(sources.fromDht))
            ? Number(sources.fromDht)
            : undefined,
        incoming: Number.isFinite(Number(sources.fromIncoming))
            ? Number(sources.fromIncoming)
            : undefined,
        lpd: Number.isFinite(Number(sources.fromLpd))
            ? Number(sources.fromLpd)
            : undefined,
        ltep: Number.isFinite(Number(sources.fromLtep))
            ? Number(sources.fromLtep)
            : undefined,
        pex: Number.isFinite(Number(sources.fromPex))
            ? Number(sources.fromPex)
            : undefined,
        tracker: Number.isFinite(Number(sources.fromTracker))
            ? Number(sources.fromTracker)
            : undefined,
    };
};

export const normalizeTorrent = (torrent: TransmissionTorrent): TorrentEntity => {
    const baseState = normalizeStatus(torrent.status);
    const derivedState = deriveTorrentState(baseState, torrent);

    const progress = torrent.percentDone;

    const verificationProgress = derivedState === status.torrent.checking ? torrent.recheckProgress : undefined;

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
            total: undefined,
            sending: numOr(torrent.peersGettingFromUs, 0),
            getting: numOr(torrent.peersSendingToUs, 0),
            seeds: undefined,
        },
        totalSize: numOr(torrent.totalSize, 0),
        eta: numOr(torrent.eta, -1),
        queuePosition: torrent.queuePosition,
        ratio: numOr(torrent.uploadRatio, 0),
        uploaded: numOr(torrent.uploadedEver, 0),
        downloaded: numOr(torrent.downloadedEver, 0),
        haveValid: typeof torrent.haveValid === "number" ? torrent.haveValid : undefined,
        haveUnchecked: typeof torrent.haveUnchecked === "number" ? torrent.haveUnchecked : undefined,
        doneDate: typeof torrent.doneDate === "number" ? torrent.doneDate : undefined,
        secondsDownloading:
            typeof torrent.secondsDownloading === "number"
                ? torrent.secondsDownloading
                : undefined,
        secondsSeeding:
            typeof torrent.secondsSeeding === "number"
                ? torrent.secondsSeeding
                : undefined,
        leftUntilDone: torrent.leftUntilDone,
        sizeWhenDone: torrent.sizeWhenDone,
        desiredAvailable:
            typeof torrent.desiredAvailable === "number"
                ? torrent.desiredAvailable
                : undefined,
        error: torrent.error,
        errorString: normalizeErrorString(torrent.errorString),
        metadataPercentComplete:
            typeof torrent.metadataPercentComplete === "number"
                ? torrent.metadataPercentComplete
                : undefined,
        isFinished: torrent.isFinished,
        isStalled: torrent.isStalled,
        webseedsSendingToUs:
            typeof torrent.webseedsSendingToUs === "number"
                ? torrent.webseedsSendingToUs
                : undefined,
        peersFrom: normalizePeerDiscoverySources(torrent.peersFrom),
        sequentialDownload:
            torrent.sequentialDownload ?? torrent["sequential_download"],
        superSeeding: torrent.superSeeding,
        added: numOr(torrent.addedDate, Math.floor(Date.now() / 1000)),
        savePath: torrent.downloadDir,
        rpcId: torrent.id,
    };

    return normalizedTorrent;
};

export const normalizeTorrentDetail = (detail: TransmissionTorrentDetail): TorrentDetailEntity => {
    const normalizedFiles = zipFileEntities(detail);
    const base = normalizeTorrent(detail);
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
        activityDate:
            typeof detail.activityDate === "number"
                ? detail.activityDate
                : undefined,
        comment:
            typeof detail.comment === "string" ? detail.comment : undefined,
        corruptEver:
            typeof detail.corruptEver === "number"
                ? detail.corruptEver
                : undefined,
        creator:
            typeof detail.creator === "string" ? detail.creator : undefined,
        dateCreated:
            typeof detail.dateCreated === "number"
                ? detail.dateCreated
                : undefined,
        downloadLimit:
            typeof detail.downloadLimit === "number"
                ? detail.downloadLimit
                : undefined,
        downloadLimited:
            typeof detail.downloadLimited === "boolean"
                ? detail.downloadLimited
                : undefined,
        isPrivate:
            typeof detail.isPrivate === "boolean"
                ? detail.isPrivate
                : undefined,
        uploadLimit:
            typeof detail.uploadLimit === "number"
                ? detail.uploadLimit
                : undefined,
        uploadLimited:
            typeof detail.uploadLimited === "boolean"
                ? detail.uploadLimited
                : undefined,
    };
};

/**
 * Canonical state-machine: allowed transitions for `TorrentStatus`.
 * This table centralizes allowed state transitions so that downstream
 * consumers (heartbeat, automation) can enforce deterministic state
 * evolution and avoid UI-driven illegal transitions.
 *
 * Rule: If a transition from `A -> B` is not allowed, the sanitized
 * result will preserve the previous state `A` until engine truth
 * moves into a legal state.
 */
export const ALLOWED_STATE_TRANSITIONS: Record<TorrentTransportStatus, TorrentTransportStatus[]> = {
    [status.torrent.paused]: [
        status.torrent.paused,
        status.torrent.queued,
        status.torrent.downloading,
        status.torrent.seeding,
        status.torrent.checking,
        status.torrent.error,
    ],
    [status.torrent.queued]: [
        status.torrent.queued,
        status.torrent.downloading,
        status.torrent.seeding,
        status.torrent.paused,
        status.torrent.checking,
        status.torrent.error,
    ],
    [status.torrent.downloading]: [
        status.torrent.downloading,
        status.torrent.queued,
        status.torrent.checking,
        status.torrent.seeding,
        status.torrent.paused,
        status.torrent.error,
    ],
    [status.torrent.seeding]: [
        status.torrent.seeding,
        status.torrent.queued,
        status.torrent.checking,
        status.torrent.paused,
        status.torrent.error,
    ],
    [status.torrent.checking]: [
        status.torrent.checking,
        status.torrent.queued,
        status.torrent.paused,
        status.torrent.downloading,
        status.torrent.seeding,
        status.torrent.error,
    ],
    [status.torrent.error]: [
        status.torrent.error,
        status.torrent.paused,
        status.torrent.queued,
        status.torrent.checking,
        status.torrent.downloading,
        status.torrent.seeding,
    ],
};

/**
 * Enforce allowed state transitions. If `prev` is undefined, accept `next`.
 * If transition is illegal, return `prev` to preserve engine-truth continuity.
 */
export function enforceStateTransition(
    prev: TorrentTransportStatus | undefined,
    next: TorrentTransportStatus,
): TorrentTransportStatus {
    if (!prev) return next;
    const allowed = ALLOWED_STATE_TRANSITIONS[prev] ?? [prev];
    return allowed.includes(next) ? next : prev;
}
