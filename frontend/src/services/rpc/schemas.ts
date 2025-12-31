import { z } from "zod";
import type {
    DirectoryBrowseResult,
    RpcTorrentStatus,
    TransmissionFreeSpace,
    TransmissionSessionSettings,
    TransmissionSessionStats,
    TransmissionTorrent,
    TransmissionTorrentDetail,
} from "./types";
import type {
    AutorunStatus,
    TinyTorrentCapabilities,
    SystemHandlerStatus,
} from "./entities";

const zRpcResponse = z.object({
    result: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    tag: z.number().optional(),
});

export const zRpcSuccess = z.object({}).passthrough();

const RPC_TORRENT_STATUS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const isRpcTorrentStatus = (value: number): value is RpcTorrentStatus =>
    (RPC_TORRENT_STATUS_VALUES as readonly number[]).includes(value);

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

const zTransmissionTorrentFile = z
    .object({
        bytesCompleted: z.number(),
        length: z.number(),
        name: z.string(),
        percentDone: z.number(),
        priority: z.number(),
        wanted: z.boolean(),
    })
    .passthrough()
    .catch({
        bytesCompleted: 0,
        length: 0,
        name: "",
        percentDone: 0,
        priority: 0,
        wanted: false,
    });

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

const zTransmissionTorrentDetailBase = z.object({
    files: z.array(zTransmissionTorrentFile).default([]),
    trackers: z.array(zTransmissionTorrentTracker).default([]),
    peers: z.array(zTransmissionTorrentPeer).default([]),
    pieceCount: z.number().optional(),
    pieceSize: z.number().optional(),
    pieceStates: z.array(z.number()).optional(),
    pieceAvailability: z.array(z.number()).optional(),
    labels: z.array(z.string()).default([]),
    isPrivate: z.boolean().default(false),
});
const zTransmissionTorrentDetail = zTransmissionTorrent
    .merge(zTransmissionTorrentDetailBase)
    .passthrough()
    .catch({
        id: 0,
        hashString: "",
        name: "",
        totalSize: 0,
        percentDone: 0,
        status: 0,
        rateDownload: 0,
        rateUpload: 0,
        peersConnected: 0,
        eta: 0,
        addedDate: 0,
        uploadRatio: 0,
        uploadedEver: 0,
        downloadedEver: 0,
        files: [],
        trackers: [],
        peers: [],
        labels: [],
        isPrivate: false,
        pieceCount: undefined,
        pieceSize: undefined,
        pieceStates: undefined,
        pieceAvailability: undefined,
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
        dhtNodes: 0,
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

export const zTransmissionFreeSpace = z.object({
    path: z.string(),
    sizeBytes: z.number(),
    totalSize: z.number(),
});

const zDirectoryEntryType = z.enum(["drive", "folder"]);

const zDirectoryEntry = z.object({
    name: z.string(),
    path: z.string(),
    type: zDirectoryEntryType,
    totalBytes: z.number().optional(),
    freeBytes: z.number().optional(),
});

export const zDirectoryBrowseResponse = z.object({
    path: z.string(),
    parentPath: z.string().optional(),
    separator: z.string().optional(),
    entries: z.array(zDirectoryEntry),
});

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

export const parseDirectoryBrowseResult = (
    payload: unknown
): DirectoryBrowseResult => {
    try {
        return zDirectoryBrowseResponse.parse(payload);
    } catch (error) {
        logValidationIssue("parseDirectoryBrowseResult", payload, error);
        throw error;
    }
};

const zServerClass = z.enum(["tinytorrent", "transmission"]).optional();

const zTinyTorrentCapabilities = z.object({
    "server-version": z.string().optional(),
    version: z.string().optional(),
    "rpc-version": z.number(),
    "websocket-endpoint": z.string().optional(),
    "websocket-path": z.string().optional(),
    platform: z.string().optional(),
    features: z.array(z.string()).default([]),
    "server-class": zServerClass,
});

export const getTinyTorrentCapabilities = (
    payload: unknown
): TinyTorrentCapabilities => {
    try {
        const parsed = zTinyTorrentCapabilities.parse(payload);
        return {
            version: parsed.version,
            serverVersion: parsed["server-version"],
            rpcVersion: parsed["rpc-version"],
            websocketEndpoint:
                parsed["websocket-endpoint"] ?? parsed["websocket-path"],
            websocketPath:
                parsed["websocket-path"] ?? parsed["websocket-endpoint"],
            platform: parsed.platform,
            features: parsed.features,
            serverClass: parsed["server-class"],
        };
    } catch (error) {
        logValidationIssue("getTinyTorrentCapabilities", payload, error);
        throw error;
    }
};

export const zSystemAutorunStatus = z.object({
    enabled: z.boolean(),
    supported: z.boolean(),
    requiresElevation: z.boolean(),
});

export const zSystemHandlerStatus = z.object({
    registered: z.boolean(),
    supported: z.boolean(),
    requiresElevation: z.boolean(),
    magnetRegistered: z.boolean().optional(),
    torrentRegistered: z.boolean().optional(),
});

export const getSystemAutorunStatus = (payload: unknown): AutorunStatus => {
    try {
        return zSystemAutorunStatus.parse(payload);
    } catch (error) {
        logValidationIssue("getSystemAutorunStatus", payload, error);
        throw error;
    }
};

export const getSystemHandlerStatus = (
    payload: unknown
): SystemHandlerStatus => {
    try {
        return zSystemHandlerStatus.parse(payload);
    } catch (error) {
        logValidationIssue("getSystemHandlerStatus", payload, error);
        throw error;
    }
};

// --- Exposed Zod schemas for strict parsing in RPC layer ---
export const zTransmissionTorrentArray = zTorrentListResponse.transform(
    (v) => v.torrents
);

export const zTransmissionTorrentDetailSingle =
    zTorrentDetailResponse.transform((v) => v.torrents[0]);

export const zSessionStats = zSessionStatsRaw.transform((raw) =>
    normalizeSessionStats(raw)
);

export const zTinyTorrentCapabilitiesNormalized =
    zTinyTorrentCapabilities.transform((parsed) => ({
        version: parsed.version,
        serverVersion: parsed["server-version"],
        rpcVersion: parsed["rpc-version"],
        websocketEndpoint:
            parsed["websocket-endpoint"] ?? parsed["websocket-path"],
        websocketPath: parsed["websocket-path"] ?? parsed["websocket-endpoint"],
        platform: parsed.platform,
        features: parsed.features,
        serverClass: parsed["server-class"],
    }));

export const zTransmissionTorrentRenameResult = z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
});

export const zSystemInstallResult = z.object({
    action: z.string(),
    success: z.boolean(),
    permissionDenied: z.boolean().optional(),
    message: z.string().optional(),
    shortcuts: z.record(z.string(), z.unknown()).optional(),
    installSuccess: z.boolean().optional(),
    installMessage: z.string().optional(),
    installedPath: z.string().optional(),
    handlersRegistered: z.boolean().optional(),
    handlerMessage: z.string().optional(),
});
