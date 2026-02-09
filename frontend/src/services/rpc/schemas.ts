import { z } from "zod";
import type {
    TransmissionFreeSpace,
    TransmissionSessionSettings,
    TransmissionSessionStats,
    TransmissionTorrent,
    TransmissionTorrentDetail,
} from "@/services/rpc/types";
const zRpcResponse = z.object({
    result: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    tag: z.number().optional(),
});

export const zRpcSuccess = z.object({}).passthrough();

// Relaxed: allow any integer but fallback to 0 (Paused) on invalid/unexpected values.
const zRpcTorrentStatus = z.number().int().catch(0);

const logValidationIssue = (
    context: string,
    payload: unknown,
    error: unknown
) => {
    if (typeof console !== "undefined" && console.error) {
        console.error(
            `[tiny-torrent][rpc-validation] ${context} failed`,
            payload,
            error
        );
    }
};

const atobShim = (value: string) => {
    if (typeof atob === "function") {
        return atob(value);
    }
    const globalObj = typeof globalThis !== "undefined" ? globalThis : {};
    const globalWithBuffer = globalObj as {
        Buffer?: {
            from: (input: string, encoding: string) => {
                toString: (encoding: string) => string;
            };
        };
    };
    const bufferCtor = globalWithBuffer.Buffer;
    if (bufferCtor && typeof bufferCtor.from === "function") {
        return bufferCtor.from(value, "base64").toString("binary");
    }
    throw new Error("Base64 decode unavailable");
};

const decodeBase64 = (value: string) => {
    const binary = atobShim(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; ++i) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const decodePieceStates = (encoded: unknown, pieceCount?: number) => {
    if (typeof encoded !== "string") return undefined;
    let bytes: Uint8Array;
    try {
        bytes = decodeBase64(encoded);
    } catch (error) {
        logValidationIssue("decodePieceStates", encoded, error);
        return undefined;
    }
    const totalPieces =
        typeof pieceCount === "number" && pieceCount > 0
            ? pieceCount
            : bytes.length * 8;
    const expectedBytes = Math.ceil(totalPieces / 8);
    if (bytes.length < expectedBytes) {
        logValidationIssue(
            "decodePieceStates",
            { encodedLength: bytes.length, pieceCount: totalPieces },
            new Error("Encoded pieceStates length does not cover pieceCount")
        );
        return undefined;
    }
    const states: number[] = [];
    for (let i = 0; i < totalPieces; ++i) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        const byte = byteIndex < bytes.length ? bytes[byteIndex] : 0;
        states.push((byte >> bitIndex) & 1 ? 1 : 0);
    }
    return states;
};

const decodePieceAvailability = (encoded: unknown, pieceCount?: number) => {
    if (typeof encoded !== "string") return undefined;
    let bytes: Uint8Array;
    try {
        bytes = decodeBase64(encoded);
    } catch (error) {
        logValidationIssue("decodePieceAvailability", encoded, error);
        return undefined;
    }
    const expectedEntries =
        typeof pieceCount === "number" && pieceCount > 0
            ? pieceCount
            : Math.floor(bytes.length / 2);
    const requiredLength = expectedEntries * 2;
    if (bytes.length < requiredLength) {
        logValidationIssue(
            "decodePieceAvailability",
            { encodedLength: bytes.length, pieceCount: expectedEntries },
            new Error(
                "Encoded pieceAvailability length is shorter than expected for the reported pieceCount"
            )
        );
        return undefined;
    }
    const availability: number[] = [];
    const entries = Math.min(expectedEntries, Math.floor(bytes.length / 2));
    for (let index = 0; index < entries; ++index) {
        const offset = index * 2;
        availability.push(bytes[offset] | (bytes[offset + 1] << 8));
    }
    return availability;
};

const zTransmissionTorrentFile = z
    .object({
        name: z.string(),
        length: z.number(),
        bytesCompleted: z.number().optional(),
    })
    .passthrough();

const zTransmissionTorrentFileStat = z
    .object({
        wanted: z.boolean(),
        priority: z.number(),
    })
    .passthrough();

const zTransmissionTorrentTracker = z
    .object({
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
    })
    .passthrough()
    .catch({
        announce: "",
        tier: 0,
        lastAnnounceTime: 0,
        lastAnnounceResult: "",
        lastAnnounceSucceeded: false,
        lastScrapeTime: 0,
        lastScrapeResult: "",
        lastScrapeSucceeded: false,
        seederCount: 0,
        leecherCount: 0,
    });

const zTransmissionTorrentPeer = z
    .object({
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
    })
    .passthrough()
    .catch({
        address: "",
        clientIsChoking: false,
        clientIsInterested: false,
        peerIsChoking: false,
        peerIsInterested: false,
        clientName: "",
        rateToClient: 0,
        rateToPeer: 0,
        progress: 0,
        flagStr: "",
    });

const zTransmissionTorrent = z
    .object({
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
        queuePosition: z.number().optional(),
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
    })
    .passthrough();

const zTransmissionTorrentAddResponseEntry = z
    .object({
        // Transmission guarantees these three fields in torrent-add responses.
        id: z.number(),
        name: z.string(),
        hashString: z.string(),
    })
    .passthrough();

// The daemon may return only the bare fields we care about for a newly
// added torrent. Parse that shape to keep the RPC layer resilient.
export const zTransmissionAddTorrentResponse = z
    .object({
        "torrent-added": zTransmissionTorrentAddResponseEntry.optional(),
        "torrent-duplicate": zTransmissionTorrentAddResponseEntry.optional(),
    })
    .passthrough();

const zTransmissionTorrentDetailBase = z.object({
    files: z.array(zTransmissionTorrentFile).default([]),
    fileStats: z.array(zTransmissionTorrentFileStat).default([]),
    trackers: z.array(zTransmissionTorrentTracker).default([]),
    peers: z.array(zTransmissionTorrentPeer).default([]),
    pieceCount: z.number().optional(),
    pieceSize: z.number().optional(),
    pieceStates: z.string().optional(),
    pieceAvailability: z.string().optional(),
    labels: z.array(z.string()).default([]),
    isPrivate: z.boolean().default(false),
});
const zTransmissionTorrentDetail = zTransmissionTorrent
    .merge(zTransmissionTorrentDetailBase)
    .passthrough();

const zTransmissionTorrentDetailWithPieces =
    zTransmissionTorrentDetail.transform((raw) => {
        const detail = { ...raw } as TransmissionTorrentDetail;
        const decodedStates = decodePieceStates(
            detail.pieceStates,
            detail.pieceCount
        );
        detail.pieceStates =
            decodedStates !== undefined ? decodedStates : undefined;
        const decodedAvailability = decodePieceAvailability(
            detail.pieceAvailability,
            detail.pieceCount
        );
        detail.pieceAvailability =
            decodedAvailability !== undefined ? decodedAvailability : undefined;
        return detail;
    });

const zTorrentListResponse = z
    .object({
        torrents: z.array(zTransmissionTorrent),
    })
    .passthrough()
    .catch({ torrents: [] });

const zTorrentDetailResponse = z
    .object({
        torrents: z.array(zTransmissionTorrentDetail),
    })
    .passthrough()
    .catch({ torrents: [] });

const zSessionStatsTotals = z.object({
    uploadedBytes: z.number(),
    downloadedBytes: z.number(),
    filesAdded: z.number(),
    secondsActive: z.number(),
    sessionCount: z.number(),
});

// Best-effort session stats parser: numeric fields fallback to 0, and the
// entire object falls back to a zeroed shape on parse failures.
const zSessionStatsRaw = z
    .object({
        activeTorrentCount: z.number().catch(0),
        downloadSpeed: z.number().catch(0),
        pausedTorrentCount: z.number().catch(0),
        torrentCount: z.number().catch(0),
        uploadSpeed: z.number().catch(0),
        dhtNodes: z.number().optional(),
        cumulativeStats: zSessionStatsTotals.optional(),
        "cumulative-stats": zSessionStatsTotals.optional(),
        currentStats: zSessionStatsTotals.optional(),
        "current-stats": zSessionStatsTotals.optional(),
    })
    .catch({
        activeTorrentCount: 0,
        downloadSpeed: 0,
        pausedTorrentCount: 0,
        torrentCount: 0,
        uploadSpeed: 0,
        dhtNodes: 0, // dht node counts are not reliably provided by Transmission; do not fabricate
    });

const EMPTY_SESSION_TOTALS = {
    uploadedBytes: 0,
    downloadedBytes: 0,
    filesAdded: 0,
    secondsActive: 0,
    sessionCount: 0,
};

const normalizeSessionStats = (raw: z.infer<typeof zSessionStatsRaw>) => {
    const cumulative =
        raw.cumulativeStats ?? raw["cumulative-stats"] ?? EMPTY_SESSION_TOTALS;
    const current =
        raw.currentStats ?? raw["current-stats"] ?? EMPTY_SESSION_TOTALS;
    if (!raw.cumulativeStats && !raw["cumulative-stats"]) {
        logValidationIssue(
            "normalizeSessionStats",
            raw,
            "Missing cumulative session stats"
        );
    }
    if (!raw.currentStats && !raw["current-stats"]) {
        logValidationIssue(
            "normalizeSessionStats",
            raw,
            "Missing current session stats"
        );
    }
    return {
        activeTorrentCount: raw.activeTorrentCount,
        downloadSpeed: raw.downloadSpeed,
        pausedTorrentCount: raw.pausedTorrentCount,
        torrentCount: raw.torrentCount,
        uploadSpeed: raw.uploadSpeed,
        dhtNodes: raw.dhtNodes,
        cumulativeStats: cumulative,
        currentStats: current,
    };
};

const ENCRYPTION_LEVEL_LABELS = ["required", "preferred", "tolerated"] as const;
type EncryptionLevelLabel = (typeof ENCRYPTION_LEVEL_LABELS)[number];

const encryptionNumberToLabel: Record<0 | 1 | 2, EncryptionLevelLabel> = {
    0: "tolerated",
    1: "preferred",
    2: "required",
};

// Accept either label or numeric value. Do NOT silently default unknown
// numeric values to "tolerated" — instead treat them as validation errors.
const zEncryptionLevelBase = z.union([
    z.enum(ENCRYPTION_LEVEL_LABELS),
    z
        .number()
        .int()
        .refine((value) => value === 0 || value === 1 || value === 2, {
            message: "Unknown encryption level",
        })
        .transform((value) => encryptionNumberToLabel[value as 0 | 1 | 2]),
]);

// Non-critical enum: tolerate unknown values by falling back to 'tolerated'.
const zEncryptionLevel = zEncryptionLevelBase.catch("tolerated");

export const zTransmissionSessionSettings = z.object({
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
    "alt-speed-time-begin": z.number().optional(),
    "alt-speed-time-end": z.number().optional(),
    "alt-speed-time-day": z.number().optional(),
    "peer-limit-global": z.number().optional(),
    "peer-limit-per-torrent": z.number().optional(),
    "lpd-enabled": z.boolean().optional(),
    "dht-enabled": z.boolean().optional(),
    "dht-nodes": z.number().optional(),
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
    ui: z
        .object({
            autoOpen: z.boolean().optional(),
            autorunHidden: z.boolean().optional(),
            showSplash: z.boolean().optional(),
            splashMessage: z.string().optional(),
        })
        .optional(),
});

export const zTransmissionFreeSpace = z.preprocess(
    (value) => {
        if (!value || typeof value !== "object") {
            return value;
        }
        const raw = value as Record<string, unknown>;
        const sizeBytes = raw.sizeBytes ?? raw["size-bytes"];
        const totalSize = raw.totalSize ?? raw["total-size"];
        return {
            ...raw,
            sizeBytes,
            totalSize,
        };
    },
    z.object({
        path: z.string(),
        sizeBytes: z.number(),
        totalSize: z.number().optional(),
    })
);

export const parseRpcResponse = (payload: unknown) => {
    try {
        return zRpcResponse.parse(payload);
    } catch (error) {
        logValidationIssue("parseRpcResponse", payload, error);
        throw error;
    }
};
export const getTorrentList = (payload: unknown): TransmissionTorrent[] => {
    try {
        return zTorrentListResponse.parse(payload)
            .torrents as TransmissionTorrent[];
    } catch (error) {
        logValidationIssue("getTorrentList", payload, error);
        // Always return empty array on error for UI stability
        return [];
    }
};
export const getTorrentDetail = (
    payload: unknown
): TransmissionTorrentDetail | null => {
    try {
        const result = zTorrentDetailResponse.parse(payload);
        const [torrent] = result.torrents;
        if (!torrent) {
            logValidationIssue(
                "getTorrentDetail",
                payload,
                "Torrent not found in RPC response"
            );
            return null;
        }
        return torrent as TransmissionTorrentDetail;
    } catch (error) {
        logValidationIssue("getTorrentDetail", payload, error);
        // Always return null on error for UI stability
        return null;
    }
};
export const getSessionStats = (payload: unknown): TransmissionSessionStats => {
    try {
        const raw = zSessionStatsRaw.parse(payload);
        return normalizeSessionStats(raw);
    } catch (error) {
        logValidationIssue("getSessionStats", payload, error);
        throw error;
    }
};
export const getSessionSettings = (
    payload: unknown
): TransmissionSessionSettings => {
    try {
        return zTransmissionSessionSettings.parse(
            payload
        ) as TransmissionSessionSettings;
    } catch (error) {
        logValidationIssue("getSessionSettings", payload, error);
        throw error;
    }
};
export const getFreeSpace = (payload: unknown): TransmissionFreeSpace => {
    try {
        return zTransmissionFreeSpace.parse(payload) as TransmissionFreeSpace;
    } catch (error) {
        logValidationIssue("getFreeSpace", payload, error);
        throw error;
    }
};

// --- Exposed Zod schemas for strict parsing in RPC layer ---
export const zTransmissionTorrentArray = zTorrentListResponse.transform(
    (v) => v.torrents
);

export const zTransmissionRecentlyActiveResponse = z
    .object({
        torrents: z.array(zTransmissionTorrent).catch([]),
        removed: z.array(z.number()).optional(),
    })
    .passthrough()
    .transform((value) => ({
        torrents: value.torrents as TransmissionTorrent[],
        removed: value.removed,
    }));

export const zTransmissionTorrentDetailSingle =
    zTorrentDetailResponse.transform((v) => {
        const [torrent] = v.torrents;
        if (!torrent) {
            return null;
        }
        return zTransmissionTorrentDetailWithPieces.parse(torrent);
    });

export const zSessionStats = zSessionStatsRaw.transform((raw) =>
    normalizeSessionStats(raw)
);

export const zTransmissionTorrentRenameResult = z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
});
