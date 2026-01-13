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
} from "./entities";
import { buildErrorEnvelope } from "./recovery";
import STATUS, { type TorrentStatus } from "@/shared/status";

const STATUS_MAP: Record<number, TorrentStatus> = {
    0: STATUS.torrent.PAUSED,
    1: STATUS.torrent.CHECKING,
    2: STATUS.torrent.CHECKING,
    3: STATUS.torrent.QUEUED,
    4: STATUS.torrent.DOWNLOADING,
    5: STATUS.torrent.QUEUED,
    6: STATUS.torrent.SEEDING,
    7: STATUS.torrent.PAUSED,
};

// qBittorrent’s “Stalled torrent timeout” defaults to 60 seconds, so keep the grace window identical.
const STALLED_GRACE_SECONDS = 60;

const normalizeStatus = (
    status: number | TorrentStatus | undefined
): TorrentStatus => {
    if (typeof status === "string") {
        return status as TorrentStatus;
    }
    if (typeof status === "number") {
        return STATUS_MAP[status] ?? STATUS.torrent.PAUSED;
    }
    return STATUS.torrent.PAUSED;
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

type VerifyStateEntry = {
    wasVerifying: boolean;
    lastVerifyCompletedAt?: number;
    lastDownloadStartedAt?: number;
    lastDerivedState?: TorrentStatus;
    noTrafficSince?: number;
};

const verifyStateMap = new Map<string, VerifyStateEntry>();

const isCheckingStatusNum = (statusNum: unknown) =>
    statusNum === 1 || statusNum === 2;

const updateVerifyState = (
    idKey: string | null,
    currentlyVerifying: boolean,
    nowSeconds: number
) => {
    if (!idKey) return;
    const entry = verifyStateMap.get(idKey) ?? {
        wasVerifying: false,
    };
    const previouslyVerifying = entry.wasVerifying;
    entry.wasVerifying = currentlyVerifying;
    if (!entry.wasVerifying && previouslyVerifying) {
        entry.lastVerifyCompletedAt = nowSeconds;
    }
    verifyStateMap.set(idKey, entry);
};

const hasRecentVerifyCompletion = (
    idKey: string | null,
    nowSeconds: number
) => {
    if (!idKey) return false;
    const entry = verifyStateMap.get(idKey);
    if (!entry || entry.lastVerifyCompletedAt === undefined) return false;
    return nowSeconds - entry.lastVerifyCompletedAt < STALLED_GRACE_SECONDS;
};

/**
 * Stateless “post-verify grace” detection using Transmission truth.
 *
 * We avoid any local caches/maps. Instead, we treat "recent activity" as a grace window.
 * Transmission updates `activityDate` when meaningful torrent activity happens (including verify completion),
 * so we can delay STALLED classification shortly after that moment.
 *
 * If activityDate is missing/0, we fall back to addedDate-based grace (new torrents).
 */
type ActivityInfo = {
    activityDate?: number;
    addedDate?: number;
};

const isWithinStallGraceWindow = (torrent: ActivityInfo) => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const activityDate =
        typeof torrent.activityDate === "number" &&
        Number.isFinite(torrent.activityDate)
            ? Math.max(0, Math.floor(torrent.activityDate))
            : undefined;

    const addedDate =
        typeof torrent.addedDate === "number" &&
        Number.isFinite(torrent.addedDate)
            ? Math.max(0, Math.floor(torrent.addedDate))
            : undefined;

    // Primary: grace after recent activity (covers “verify just completed” without stateful tracking)
    if (typeof activityDate === "number") {
        return nowSeconds - activityDate < STALLED_GRACE_SECONDS;
    }

    // Fallback: grace for newly added torrents
    if (typeof addedDate === "number") {
        return nowSeconds - addedDate < STALLED_GRACE_SECONDS;
    }

    return false;
};

export const deriveTorrentState = (
    base: TorrentStatus,
    torrent: TransmissionTorrent
): TorrentStatus => {
    // 1) Error classification (authoritative)
    if (hasRpcError(torrent)) {
        const env = buildErrorEnvelope(torrent as TransmissionTorrent);
        return env.errorClass === "missingFiles"
            ? STATUS.torrent.MISSING_FILES
            : STATUS.torrent.ERROR;
    }

    // 2) Base states that must never be overridden
    if (
        base === STATUS.torrent.PAUSED ||
        base === STATUS.torrent.CHECKING ||
        base === STATUS.torrent.QUEUED
    ) {
        return base;
    }

    // 🔒 3) Completed torrents are NEVER stalled
    if (torrent.percentDone === 1) {
        return STATUS.torrent.SEEDING;
    }

    const down = numOr(torrent.rateDownload, 0);
    const sendingToUs = numOr(torrent.peersSendingToUs, 0);

    const statusNum =
        typeof torrent.status === "number" ? torrent.status : undefined;
    const statusIndicatesChecking = isCheckingStatusNum(statusNum);
    const isVerifying =
        typeof torrent.recheckProgress === "number" &&
        torrent.recheckProgress > 0;
    const currentlyVerifying = isVerifying || statusIndicatesChecking;
    const idKey = torrent.hashString ?? String(torrent.id ?? "");
    const nowSeconds = Math.floor(Date.now() / 1000);
    updateVerifyState(idKey || null, currentlyVerifying, nowSeconds);
    const justCompletedVerify = hasRecentVerifyCompletion(
        idKey || null,
        nowSeconds
    );

    const entry = idKey ? verifyStateMap.get(idKey) : undefined;
    const lastDownloadStartedAt = entry?.lastDownloadStartedAt;
    const justStartedDownloading =
        typeof lastDownloadStartedAt === "number" &&
        nowSeconds - lastDownloadStartedAt < STALLED_GRACE_SECONDS;

    const isWithinGrace =
        isWithinStallGraceWindow(torrent) ||
        justCompletedVerify ||
        justStartedDownloading;

    let derived = base;

    if (base === STATUS.torrent.DOWNLOADING) {
        const noTraffic = down === 0;
        const noUploadingPeers = sendingToUs === 0;

        // Strongly recommended: don’t call it “stalled” if there are zero peers.
        // That’s not “stalled”; it’s “waiting / no peers”.
        const peersConnected = numOr(torrent.peersConnected, 0);
        const stallEligible = peersConnected > 0;

        // Reset noTrafficSince whenever we have any sign of life or we’re in a protected window.
        const shouldResetNoTraffic =
            !noTraffic ||
            !noUploadingPeers ||
            statusIndicatesChecking ||
            isVerifying ||
            isWithinGrace ||
            !stallEligible;

        if (idKey) {
            const e =
                entry ??
                ({
                    wasVerifying: currentlyVerifying,
                } as VerifyStateEntry);

            if (shouldResetNoTraffic) {
                e.noTrafficSince = undefined;
                derived = STATUS.torrent.DOWNLOADING;
            } else {
                // Start timer on first observation, only emit STALLED if it persists long enough.
                e.noTrafficSince ??= nowSeconds;

                derived =
                    nowSeconds - e.noTrafficSince >= STALLED_GRACE_SECONDS
                        ? STATUS.torrent.STALLED
                        : STATUS.torrent.DOWNLOADING;
            }

            // Keep your existing “download just started” marker if you still want it.
            if (
                derived === STATUS.torrent.DOWNLOADING &&
                e.lastDerivedState !== STATUS.torrent.DOWNLOADING
            ) {
                e.lastDownloadStartedAt = nowSeconds;
            }

            e.lastDerivedState = derived;
            verifyStateMap.set(idKey, e);
        } else {
            // No idKey: be conservative
            derived = STATUS.torrent.DOWNLOADING;
        }
    }

    return derived;
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
        derivedState === STATUS.torrent.MISSING_FILES
            ? undefined
            : torrent.percentDone;

    const verificationProgress =
        derivedState === STATUS.torrent.CHECKING
            ? torrent.recheckProgress
            : undefined;

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
export const ALLOWED_STATE_TRANSITIONS: Record<TorrentStatus, TorrentStatus[]> =
    {
        [STATUS.torrent.PAUSED]: [
            STATUS.torrent.PAUSED,
            STATUS.torrent.QUEUED,
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.SEEDING,
            STATUS.torrent.CHECKING,
            STATUS.torrent.ERROR,
            STATUS.torrent.MISSING_FILES,
        ],
        [STATUS.torrent.QUEUED]: [
            STATUS.torrent.QUEUED,
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.SEEDING,
            STATUS.torrent.PAUSED,
            STATUS.torrent.CHECKING,
            STATUS.torrent.ERROR,
        ],
        [STATUS.torrent.DOWNLOADING]: [
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.QUEUED,
            STATUS.torrent.STALLED,
            STATUS.torrent.SEEDING,
            STATUS.torrent.PAUSED,
            STATUS.torrent.ERROR,
            STATUS.torrent.MISSING_FILES,
        ],
        [STATUS.torrent.SEEDING]: [
            STATUS.torrent.SEEDING,
            STATUS.torrent.QUEUED,
            STATUS.torrent.PAUSED,
            STATUS.torrent.ERROR,
            STATUS.torrent.MISSING_FILES,
        ],
        [STATUS.torrent.CHECKING]: [
            STATUS.torrent.CHECKING,
            STATUS.torrent.QUEUED,
            STATUS.torrent.PAUSED,
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.SEEDING,
            STATUS.torrent.ERROR,
        ],
        [STATUS.torrent.STALLED]: [
            STATUS.torrent.STALLED,
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.PAUSED,
            STATUS.torrent.ERROR,
        ],
        [STATUS.torrent.ERROR]: [
            STATUS.torrent.ERROR,
            STATUS.torrent.PAUSED,
            STATUS.torrent.DOWNLOADING,
            STATUS.torrent.SEEDING,
        ],
        [STATUS.torrent.MISSING_FILES]: [
            STATUS.torrent.MISSING_FILES,
            STATUS.torrent.PAUSED,
        ],
    };

/**
 * Enforce allowed state transitions. If `prev` is undefined, accept `next`.
 * If transition is illegal, return `prev` to preserve engine-truth continuity.
 */
export function enforceStateTransition(
    prev: TorrentStatus | undefined,
    next: TorrentStatus
): TorrentStatus {
    if (!prev) return next;
    const allowed = ALLOWED_STATE_TRANSITIONS[prev] ?? [prev];
    return allowed.includes(next) ? next : prev;
}
