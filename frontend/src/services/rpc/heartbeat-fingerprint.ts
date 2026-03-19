import type {
    NetworkTelemetry,
    SessionStats,
    TorrentDetailEntity,
    TorrentEntity,
} from "@/services/rpc/entities";

const FNV1A_OFFSET_BASIS = 2166136261;
const FNV1A_PRIME = 16777619;
const FIELD_SEPARATOR_CODE = 31; // unit separator

type FingerprintValue = string | number | boolean | null | undefined;

const mixHash = (hash: number, value: FingerprintValue): number => {
    // Serialize without allocating big intermediate structures.
    // Strings are hashed by char-code; numbers/booleans are stringified via
    // small temporaries (acceptable) to keep the function simple and correct.
    const serialized =
        typeof value === "string"
            ? value
            : typeof value === "number"
              ? Number.isFinite(value)
                  ? String(value)
                  : "NaN"
              : typeof value === "boolean"
                ? value
                    ? "1"
                    : "0"
                : "";

    let mixed = hash >>> 0;
    mixed ^= FIELD_SEPARATOR_CODE;
    mixed = Math.imul(mixed, FNV1A_PRIME) >>> 0;

    for (let i = 0; i < serialized.length; i += 1) {
        mixed ^= serialized.charCodeAt(i);
        mixed = Math.imul(mixed, FNV1A_PRIME) >>> 0;
    }
    return mixed >>> 0;
};

const mixTorrent = (hash: number, torrent: TorrentEntity): number => {
    // Keep this list aligned with what the UI surfaces can change without a full refresh.
    // If a new field becomes user-visible in table/detail summaries, add it here.
    let mixed = hash;
    mixed = mixHash(mixed, torrent.id);
    mixed = mixHash(mixed, torrent.hash);
    mixed = mixHash(mixed, torrent.name);
    mixed = mixHash(mixed, torrent.state);
    mixed = mixHash(mixed, torrent.progress);
    mixed = mixHash(mixed, torrent.verificationProgress);
    mixed = mixHash(mixed, torrent.speed.down);
    mixed = mixHash(mixed, torrent.speed.up);
    mixed = mixHash(mixed, torrent.peerSummary.connected);
    mixed = mixHash(mixed, torrent.peerSummary.total);
    mixed = mixHash(mixed, torrent.peerSummary.sending);
    mixed = mixHash(mixed, torrent.peerSummary.getting);
    mixed = mixHash(mixed, torrent.peerSummary.seeds);
    mixed = mixHash(mixed, torrent.totalSize);
    mixed = mixHash(mixed, torrent.eta);
    mixed = mixHash(mixed, torrent.queuePosition);
    mixed = mixHash(mixed, torrent.ratio);
    mixed = mixHash(mixed, torrent.uploaded);
    mixed = mixHash(mixed, torrent.downloaded);
    mixed = mixHash(mixed, torrent.leftUntilDone);
    mixed = mixHash(mixed, torrent.sizeWhenDone);
    mixed = mixHash(mixed, torrent.desiredAvailable);
    mixed = mixHash(mixed, torrent.error);
    mixed = mixHash(mixed, torrent.errorString);
    mixed = mixHash(mixed, torrent.metadataPercentComplete);
    mixed = mixHash(mixed, torrent.isFinished);
    mixed = mixHash(mixed, torrent.isStalled);
    mixed = mixHash(mixed, torrent.webseedsSendingToUs);
    mixed = mixHash(mixed, torrent.peersFrom?.cache);
    mixed = mixHash(mixed, torrent.peersFrom?.dht);
    mixed = mixHash(mixed, torrent.peersFrom?.incoming);
    mixed = mixHash(mixed, torrent.peersFrom?.lpd);
    mixed = mixHash(mixed, torrent.peersFrom?.ltep);
    mixed = mixHash(mixed, torrent.peersFrom?.pex);
    mixed = mixHash(mixed, torrent.peersFrom?.tracker);
    mixed = mixHash(mixed, torrent.sequentialDownload);
    mixed = mixHash(mixed, torrent.superSeeding);
    mixed = mixHash(mixed, torrent.added);
    mixed = mixHash(mixed, torrent.savePath);
    mixed = mixHash(mixed, torrent.downloadDir);
    mixed = mixHash(mixed, torrent.rpcId);
    mixed = mixHash(mixed, torrent.isGhost);
    mixed = mixHash(mixed, torrent.ghostLabel);
    mixed = mixHash(mixed, torrent.ghostState);
    return mixed >>> 0;
};

const mixNumberArray = (
    hash: number,
    values?: readonly number[] | null,
): number => {
    let mixed = mixHash(hash, values?.length ?? 0);
    if (!values) {
        return mixed >>> 0;
    }
    for (const value of values) {
        mixed = mixHash(mixed, value);
    }
    return mixed >>> 0;
};

const mixFiles = (
    hash: number,
    files?: TorrentDetailEntity["files"],
): number => {
    let mixed = mixHash(hash, files?.length ?? 0);
    if (!files) {
        return mixed >>> 0;
    }
    for (const file of files) {
        mixed = mixHash(mixed, file.index);
        mixed = mixHash(mixed, file.name);
        mixed = mixHash(mixed, file.length);
        mixed = mixHash(mixed, file.bytesCompleted);
        mixed = mixHash(mixed, file.progress);
        mixed = mixHash(mixed, file.priority);
        mixed = mixHash(mixed, file.wanted);
    }
    return mixed >>> 0;
};

const mixTrackers = (
    hash: number,
    trackers?: TorrentDetailEntity["trackers"],
): number => {
    let mixed = mixHash(hash, trackers?.length ?? 0);
    if (!trackers) {
        return mixed >>> 0;
    }
    for (const tracker of trackers) {
        mixed = mixHash(mixed, tracker.id);
        mixed = mixHash(mixed, tracker.announce);
        mixed = mixHash(mixed, tracker.scrape);
        mixed = mixHash(mixed, tracker.tier);
        mixed = mixHash(mixed, tracker.announceState);
        mixed = mixHash(mixed, tracker.downloadCount);
        mixed = mixHash(mixed, tracker.downloaderCount);
        mixed = mixHash(mixed, tracker.hasAnnounced);
        mixed = mixHash(mixed, tracker.hasScraped);
        mixed = mixHash(mixed, tracker.host);
        mixed = mixHash(mixed, tracker.lastAnnouncePeerCount);
        mixed = mixHash(mixed, tracker.lastAnnounceStartTime);
        mixed = mixHash(mixed, tracker.lastAnnounceTime);
        mixed = mixHash(mixed, tracker.lastAnnounceTimedOut);
        mixed = mixHash(mixed, tracker.lastAnnounceResult);
        mixed = mixHash(mixed, tracker.lastAnnounceSucceeded);
        mixed = mixHash(mixed, tracker.lastScrapeStartTime);
        mixed = mixHash(mixed, tracker.lastScrapeTime);
        mixed = mixHash(mixed, tracker.lastScrapeTimedOut);
        mixed = mixHash(mixed, tracker.lastScrapeResult);
        mixed = mixHash(mixed, tracker.lastScrapeSucceeded);
        mixed = mixHash(mixed, tracker.seederCount);
        mixed = mixHash(mixed, tracker.leecherCount);
        mixed = mixHash(mixed, tracker.scrapeState);
        mixed = mixHash(mixed, tracker.nextAnnounceTime);
        mixed = mixHash(mixed, tracker.nextScrapeTime);
        mixed = mixHash(mixed, tracker.isBackup);
        mixed = mixHash(mixed, tracker.sitename);
    }
    return mixed >>> 0;
};

const mixPeers = (
    hash: number,
    peers?: TorrentDetailEntity["peers"],
): number => {
    let mixed = mixHash(hash, peers?.length ?? 0);
    if (!peers) {
        return mixed >>> 0;
    }
    for (const peer of peers) {
        mixed = mixHash(mixed, peer.address);
        mixed = mixHash(mixed, peer.port);
        mixed = mixHash(mixed, peer.clientIsChoking);
        mixed = mixHash(mixed, peer.clientIsInterested);
        mixed = mixHash(mixed, peer.peerIsChoking);
        mixed = mixHash(mixed, peer.peerIsInterested);
        mixed = mixHash(mixed, peer.isDownloadingFrom);
        mixed = mixHash(mixed, peer.isEncrypted);
        mixed = mixHash(mixed, peer.isIncoming);
        mixed = mixHash(mixed, peer.isUploadingTo);
        mixed = mixHash(mixed, peer.isUtp);
        mixed = mixHash(mixed, peer.clientName);
        mixed = mixHash(mixed, peer.bytesToClient);
        mixed = mixHash(mixed, peer.bytesToPeer);
        mixed = mixHash(mixed, peer.rateToClient);
        mixed = mixHash(mixed, peer.rateToPeer);
        mixed = mixHash(mixed, peer.progress);
        mixed = mixHash(mixed, peer.flagStr);
    }
    return mixed >>> 0;
};

const mixNetworkTelemetry = (
    hash: number,
    telemetry?: NetworkTelemetry | null,
): number => {
    let mixed = hash;
    mixed = mixHash(mixed, telemetry?.dhtEnabled);
    mixed = mixHash(mixed, telemetry?.pexEnabled);
    mixed = mixHash(mixed, telemetry?.lpdEnabled);
    mixed = mixHash(mixed, telemetry?.portForwardingEnabled);
    mixed = mixHash(mixed, telemetry?.altSpeedEnabled);
    mixed = mixHash(mixed, telemetry?.downloadDirFreeSpace);
    mixed = mixHash(mixed, telemetry?.downloadQueueEnabled);
    mixed = mixHash(mixed, telemetry?.seedQueueEnabled);
    return mixed >>> 0;
};

export const computeTorrentPiecesSummaryFingerprint = (
    torrent?: TorrentEntity | null,
): number => {
    let hash = FNV1A_OFFSET_BASIS;
    if (!torrent) {
        return hash >>> 0;
    }
    hash = mixHash(hash, torrent.id);
    hash = mixHash(hash, torrent.hash);
    hash = mixHash(hash, torrent.state);
    hash = mixHash(hash, torrent.progress);
    hash = mixHash(hash, torrent.verificationProgress);
    hash = mixHash(hash, torrent.haveValid);
    hash = mixHash(hash, torrent.haveUnchecked);
    hash = mixHash(hash, torrent.leftUntilDone);
    hash = mixHash(hash, torrent.sizeWhenDone);
    hash = mixHash(hash, torrent.desiredAvailable);
    hash = mixHash(hash, torrent.metadataPercentComplete);
    hash = mixHash(hash, torrent.isFinished);
    hash = mixHash(hash, torrent.isStalled);
    hash = mixHash(hash, torrent.peerSummary.connected);
    hash = mixHash(hash, torrent.peerSummary.total);
    hash = mixHash(hash, torrent.peerSummary.sending);
    hash = mixHash(hash, torrent.peerSummary.getting);
    hash = mixHash(hash, torrent.peerSummary.seeds);
    return hash >>> 0;
};

export const computePieceSnapshotFingerprint = (
    detail?:
        | Pick<
              TorrentDetailEntity,
              "pieceCount" | "pieceSize" | "pieceStates" | "pieceAvailability"
          >
        | null,
): number => {
    let hash = FNV1A_OFFSET_BASIS;
    if (!detail) {
        return hash >>> 0;
    }
    hash = mixHash(hash, detail.pieceCount);
    hash = mixHash(hash, detail.pieceSize);
    hash = mixNumberArray(hash, detail.pieceStates);
    hash = mixNumberArray(hash, detail.pieceAvailability);
    return hash >>> 0;
};

export const computeSessionStatsFingerprint = (
    sessionStats?: SessionStats | null,
): number => {
    let hash = FNV1A_OFFSET_BASIS;
    if (!sessionStats) {
        return hash >>> 0;
    }

    hash = mixHash(hash, sessionStats.downloadSpeed);
    hash = mixHash(hash, sessionStats.uploadSpeed);
    hash = mixHash(hash, sessionStats.torrentCount);
    hash = mixHash(hash, sessionStats.activeTorrentCount);
    hash = mixHash(hash, sessionStats.pausedTorrentCount);
    hash = mixHash(hash, sessionStats.dhtNodes);
    hash = mixHash(hash, sessionStats.downloadDirFreeSpace);
    hash = mixNetworkTelemetry(hash, sessionStats.networkTelemetry);
    return hash >>> 0;
};

export const computeTorrentDetailFingerprint = (
    detail: TorrentDetailEntity | null | undefined,
    profile: "standard" | "pieces",
): number => {
    let hash = FNV1A_OFFSET_BASIS;
    if (!detail) {
        return hash >>> 0;
    }

    hash = mixHash(hash, detail.id);
    hash = mixHash(hash, detail.hash);
    hash = mixHash(hash, detail.pieceCount);
    hash = mixHash(hash, detail.pieceSize);

    if (profile === "pieces") {
        return computePieceSnapshotFingerprint(detail);
    }

    hash = mixHash(hash, detail.activityDate);
    hash = mixHash(hash, detail.comment);
    hash = mixHash(hash, detail.corruptEver);
    hash = mixHash(hash, detail.creator);
    hash = mixHash(hash, detail.dateCreated);
    hash = mixHash(hash, detail.downloadLimit);
    hash = mixHash(hash, detail.downloadLimited);
    hash = mixHash(hash, detail.isPrivate);
    hash = mixHash(hash, detail.uploadLimit);
    hash = mixHash(hash, detail.uploadLimited);
    hash = mixFiles(hash, detail.files);
    hash = mixTrackers(hash, detail.trackers);
    hash = mixPeers(hash, detail.peers);
    return hash >>> 0;
};

export const computeTorrentListFingerprint = (
    torrents: readonly TorrentEntity[],
): number => {
    // Avoid `JSON.stringify(torrents)` to reduce large transient allocations per tick.
    let hash = FNV1A_OFFSET_BASIS;
    for (const torrent of torrents) {
        hash = mixTorrent(hash, torrent);
    }
    return hash >>> 0;
};
