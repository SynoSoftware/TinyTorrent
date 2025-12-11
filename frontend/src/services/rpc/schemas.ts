import { z } from "zod";
import type {
    RpcTorrentStatus,
    TransmissionFreeSpace,
    TransmissionSessionSettings,
    TransmissionSessionStats,
    TransmissionTorrent,
    TransmissionTorrentDetail,
} from "./types";

const zRpcResponse = z.object({
    result: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    tag: z.number().optional(),
});

const RPC_TORRENT_STATUS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const isRpcTorrentStatus = (value: number): value is RpcTorrentStatus =>
    (RPC_TORRENT_STATUS_VALUES as readonly number[]).includes(value);

const zRpcTorrentStatus = z
    .number()
    .int()
    .refine(isRpcTorrentStatus, {
        message: "Invalid transmission torrent status",
    });

const zTransmissionTorrentFile = z.object({
    bytesCompleted: z.number(),
    length: z.number(),
    name: z.string(),
    percentDone: z.number(),
    priority: z.number(),
    wanted: z.boolean(),
});

const zTransmissionTorrentTracker = z.object({
    announce: z.string(),
    tier: z.number(),
    announceState: z.number().optional(),
    lastAnnounceTime: z.number(),
    lastAnnounceResult: z.string(),
    lastAnnounceSucceeded: z.boolean(),
    lastScrapeTime: z.number(),
    lastScrapeResult: z.string(),
    lastScrapeSucceeded: z.boolean(),
    seederCount: z.number(),
    leecherCount: z.number(),
    scrapeState: z.number().optional(),
});

const zTransmissionTorrentPeer = z.object({
    address: z.string(),
    clientIsChoking: z.boolean(),
    clientIsInterested: z.boolean(),
    peerIsChoking: z.boolean(),
    peerIsInterested: z.boolean(),
    clientName: z.string(),
    rateToClient: z.number(),
    rateToPeer: z.number(),
    progress: z.number(),
    flagStr: z.string(),
    country: z.string().optional(),
});

const zTransmissionTorrent = z.object({
    id: z.number(),
    hashString: z.string(),
    name: z.string(),
    totalSize: z.number(),
    percentDone: z.number(),
    recheckProgress: z.number().optional(),
    status: zRpcTorrentStatus,
    rateDownload: z.number(),
    rateUpload: z.number(),
    peersConnected: z.number(),
    eta: z.number(),
    addedDate: z.number(),
    queuePosition: z.number(),
    uploadRatio: z.number(),
    uploadedEver: z.number(),
    downloadedEver: z.number(),
    downloadDir: z.string().optional(),
    leftUntilDone: z.number().optional(),
    sizeWhenDone: z.number().optional(),
    error: z.number().optional(),
    errorString: z.string().optional(),
    peersSendingToUs: z.number().optional(),
    peersGettingFromUs: z.number().optional(),
    isFinished: z.boolean().optional(),
    sequentialDownload: z.boolean().optional(),
    superSeeding: z.boolean().optional(),
});

const zTransmissionTorrentDetail = zTransmissionTorrent.extend({
    files: z.array(zTransmissionTorrentFile).default([]),
    trackers: z.array(zTransmissionTorrentTracker).default([]),
    peers: z.array(zTransmissionTorrentPeer).default([]),
    pieceCount: z.number().optional(),
    pieceSize: z.number().optional(),
    pieceStates: z.array(z.number()).optional(),
    pieceAvailability: z.array(z.number()).optional(),
});

const zTorrentListResponse = z.object({
    torrents: z.array(zTransmissionTorrent),
});

const zTorrentDetailResponse = z.object({
    torrents: z.array(zTransmissionTorrentDetail),
});

const zSessionStatsTotals = z.object({
    uploadedBytes: z.number(),
    downloadedBytes: z.number(),
    filesAdded: z.number(),
    secondsActive: z.number(),
    sessionCount: z.number(),
});

const zTransmissionSessionStats = z.object({
    activeTorrentCount: z.number(),
    downloadSpeed: z.number(),
    pausedTorrentCount: z.number(),
    torrentCount: z.number(),
    uploadSpeed: z.number(),
    dhtNodes: z.number().optional(),
    cumulativeStats: zSessionStatsTotals,
    currentStats: zSessionStatsTotals,
});

const zEncryptionLevel = z.enum([
    "required",
    "preferred",
    "tolerated",
]);

const zTransmissionSessionSettings = z.object({
    "peer-port": z.number().optional(),
    "peer-port-random-on-start": z.boolean().optional(),
    "port-forwarding-enabled": z.boolean().optional(),
    encryption: zEncryptionLevel.optional(),
    "speed-limit-down": z.number().optional(),
    "speed-limit-down-enabled": z.boolean().optional(),
    "speed-limit-up": z.number().optional(),
    "speed-limit-up-enabled": z.boolean().optional(),
    "alt-speed-enabled": z.boolean().optional(),
    "alt-speed-down": z.number().optional(),
    "alt-speed-up": z.number().optional(),
    "alt-speed-time-enabled": z.boolean().optional(),
    "alt-speed-begin": z.number().optional(),
    "alt-speed-end": z.number().optional(),
    "alt-speed-time-day": z.number().optional(),
    "peer-limit-global": z.number().optional(),
    "peer-limit-per-torrent": z.number().optional(),
    "lpd-enabled": z.boolean().optional(),
    "dht-enabled": z.boolean().optional(),
    "pex-enabled": z.boolean().optional(),
    "blocklist-enabled": z.boolean().optional(),
    "blocklist-url": z.string().optional(),
    "download-dir": z.string().optional(),
    "incomplete-dir-enabled": z.boolean().optional(),
    "incomplete-dir": z.string().optional(),
    "rename-partial-files": z.boolean().optional(),
    "start-added-torrents": z.boolean().optional(),
    seedRatioLimit: z.number().optional(),
    seedRatioLimited: z.boolean().optional(),
    "idle-seeding-limit": z.number().optional(),
    "idle-seeding-limit-enabled": z.boolean().optional(),
    version: z.string().optional(),
    "rpc-version": z.number().optional(),
});

const zTransmissionFreeSpace = z.object({
    path: z.string(),
    sizeBytes: z.number(),
    totalSize: z.number(),
});

export const parseRpcResponse = (payload: unknown) => zRpcResponse.parse(payload);
export const getTorrentList = (payload: unknown): TransmissionTorrent[] =>
    zTorrentListResponse.parse(payload).torrents as TransmissionTorrent[];
export const getTorrentDetail = (payload: unknown): TransmissionTorrentDetail => {
    const result = zTorrentDetailResponse.parse(payload);
    const [torrent] = result.torrents;
    if (!torrent) {
        throw new Error("Torrent not found in RPC response");
    }
    return torrent as TransmissionTorrentDetail;
};
export const getSessionStats = (
    payload: unknown
): TransmissionSessionStats =>
    zTransmissionSessionStats.parse(payload) as TransmissionSessionStats;
export const getSessionSettings = (
    payload: unknown
): TransmissionSessionSettings =>
    zTransmissionSessionSettings.parse(payload) as TransmissionSessionSettings;
export const getFreeSpace = (
    payload: unknown
): TransmissionFreeSpace =>
    zTransmissionFreeSpace.parse(payload) as TransmissionFreeSpace;
