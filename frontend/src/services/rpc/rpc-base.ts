import type {
    TransmissionSessionSettings,
    TransmissionTorrent,
    TransmissionTorrentDetail,
    TransmissionTorrentFile,
    TransmissionTorrentTracker,
    TransmissionTorrentPeer,
    TransmissionFreeSpace,
    TransmissionSessionStats,
    TransmissionBandwidthGroupOptions,
    TransmissionTorrentRenameResult,
} from "./types";
import constants from "../../config/constants.json";
import type { EngineAdapter } from "./engine-adapter";
import type {
    TorrentEntity,
    TorrentDetailEntity,
    TorrentFileEntity,
    TorrentTrackerEntity,
    TorrentPeerEntity,
    AddTorrentPayload,
    SessionStats,
    EngineInfo,
    LibtorrentPriority,
} from "./entities";

type RpcRequest<M extends string> = {
    method: M;
    arguments?: Record<string, unknown>;
    tag?: number;
};

type RpcResponse<T> = {
    result: string;
    arguments: T;
    tag?: number;
};

type TorrentGetResponse<T> = {
    torrents: T[];
};

type AddTorrentResponse = {
    "torrent-added"?: TransmissionTorrent;
    "torrent-duplicate"?: TransmissionTorrent;
};

const DEFAULT_ENDPOINT =
    import.meta.env.VITE_RPC_ENDPOINT ?? constants.defaults.rpc_endpoint;

const SUMMARY_FIELDS: Array<keyof TransmissionTorrent> = [
    "id",
    "hashString",
    "name",
    "totalSize",
    "percentDone",
    "recheckProgress",
    "status",
    "rateDownload",
    "rateUpload",
    "peersConnected",
    "seedsConnected",
    "peersSendingToUs",
    "peersGettingFromUs",
    "eta",
    "dateAdded",
    "queuePosition",
    "uploadRatio",
    "uploadedEver",
    "downloadedEver",
    "leftUntilDone",
    "sizeWhenDone",
    "error",
    "errorString",
    "sequentialDownload",
    "superSeeding",
    "isFinished",
    "downloadDir",
];

const DETAIL_FIELDS = [
    ...SUMMARY_FIELDS,
    "files",
    "trackers",
    "peers",
    "pieceCount",
    "pieceSize",
    "pieceStates",
    "pieceAvailability",
];

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

const normalizeTorrent = (torrent: TransmissionTorrent): TorrentEntity => {
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
            seeds: torrent.seedsConnected,
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
        added: torrent.dateAdded,
        savePath: torrent.downloadDir,
        rpcId: torrent.id,
    };
};

const normalizeTorrentDetail = (
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

export class TransmissionAdapter implements EngineAdapter {
    private endpoint: string;
    private sessionId?: string;
    private username: string;
    private password: string;
    private requestTimeout?: number;
    private sessionSettingsCache?: TransmissionSessionSettings;
    private engineInfoCache?: EngineInfo;
    private idMap = new Map<string, number>();

    constructor(options?: {
        endpoint?: string;
        username?: string;
        password?: string;
        requestTimeout?: number;
    }) {
        this.endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
        this.username = options?.username ?? "";
        this.password = options?.password ?? "";
        this.requestTimeout = options?.requestTimeout;
    }

    public updateRequestTimeout(timeout: number) {
        this.requestTimeout = timeout;
    }

    private getAuthorizationHeader(): string | undefined {
        if (!this.username && !this.password) {
            return undefined;
        }
        const token = `${this.username}:${this.password}`;
        return `Basic ${btoa(token)}`;
    }

    private async send<T>(
        payload: RpcRequest<string>,
        retryCount = 0
    ): Promise<RpcResponse<T>> {
        const controller = new AbortController();
        let timeoutId: number | undefined;
        if (this.requestTimeout && this.requestTimeout > 0) {
            timeoutId = window.setTimeout(
                () => controller.abort(),
                this.requestTimeout
            );
        }
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (this.sessionId) {
                headers["X-Transmission-Session-Id"] = this.sessionId;
            }
            const authHeader = this.getAuthorizationHeader();
            if (authHeader) {
                headers.Authorization = authHeader;
            }

            const response = await fetch(this.endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            if (response.status === 409) {
                const token = response.headers.get("X-Transmission-Session-Id");
                if (token && token !== this.sessionId && retryCount < 1) {
                    this.sessionId = token;
                    return this.send(payload, retryCount + 1);
                }
            }

            if (!response.ok) {
                throw new Error(
                    `Transmission RPC responded with ${response.status}`
                );
            }

            const data = (await response.json()) as RpcResponse<T>;
            return data;
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    private async mutate(method: string, args: Record<string, unknown> = {}) {
        await this.send<void>({ method, arguments: args });
    }

    private syncIdMap(torrents: TransmissionTorrent[]) {
        const seen = new Set<string>();
        torrents.forEach((torrent) => {
            this.idMap.set(torrent.hashString, torrent.id);
            seen.add(torrent.hashString);
        });
        for (const key of Array.from(this.idMap.keys())) {
            if (!seen.has(key)) {
                this.idMap.delete(key);
            }
        }
    }

    private async refreshIdMap() {
        const torrents = await this.fetchTransmissionTorrents();
        this.syncIdMap(torrents);
    }

    private async resolveRpcId(id: string) {
        const mapped = this.idMap.get(id);
        if (mapped !== undefined) return mapped;
        const parsed = Number(id);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
        try {
            const torrent =
                await this.fetchTransmissionTorrentSummaryByIdentifier(id);
            this.idMap.set(torrent.hashString, torrent.id);
            return torrent.id;
        } catch (error) {
            if (
                error instanceof Error &&
                !error.message.includes("not found")
            ) {
                throw error;
            }
            await this.refreshIdMap();
            const refreshed = this.idMap.get(id);
            if (refreshed !== undefined) return refreshed;
            throw error instanceof Error
                ? error
                : new Error(`Torrent ${id} not found`);
        }
    }

    private async resolveIds(ids: string[]) {
        const resolved: number[] = [];
        for (const id of ids) {
            resolved.push(await this.resolveRpcId(id));
        }
        return resolved;
    }

    private async queueOperation(method: string, ids: number[]) {
        await this.mutate(method, { ids });
    }

    public async handshake(): Promise<TransmissionSessionSettings> {
        const result = await this.send<TransmissionSessionSettings>({
            method: "session-get",
        });
        this.sessionSettingsCache = result.arguments;
        this.engineInfoCache = undefined;
        return result.arguments;
    }

    public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
        const result = await this.send<TransmissionSessionSettings>({
            method: "session-get",
        });
        this.sessionSettingsCache = result.arguments;
        return result.arguments;
    }

    public async detectEngine(): Promise<EngineInfo> {
        if (this.engineInfoCache) {
            return this.engineInfoCache;
        }
        const settings =
            this.sessionSettingsCache ?? (await this.fetchSessionSettings());
        const version =
            settings.version ??
            (settings["rpc-version"]
                ? String(settings["rpc-version"])
                : undefined);
        const info: EngineInfo = {
            type: "transmission",
            name: "Transmission",
            version,
            capabilities: {
                sequentialDownload: false,
                superSeeding: false,
                trackerReannounce: true,
            },
        };
        this.engineInfoCache = info;
        return info;
    }

    public async updateSessionSettings(
        settings: Partial<TransmissionSessionSettings>
    ): Promise<void> {
        await this.send<void>({ method: "session-set", arguments: settings });
        this.sessionSettingsCache = {
            ...(this.sessionSettingsCache ?? {}),
            ...settings,
        };
    }

    public async testPort(): Promise<boolean> {
        const result = await this.send<{ portIsOpen?: boolean }>({
            method: "session-test",
        });
        return Boolean(result.arguments?.portIsOpen);
    }

    public async fetchSessionStats(): Promise<TransmissionSessionStats> {
        const result = await this.send<TransmissionSessionStats>({
            method: "session-stats",
        });
        return result.arguments;
    }

    public async getSessionStats(): Promise<SessionStats> {
        const stats = await this.fetchSessionStats();
        return {
            downloadSpeed: stats.downloadSpeed,
            uploadSpeed: stats.uploadSpeed,
            torrentCount: stats.torrentCount,
            activeTorrentCount: stats.activeTorrentCount,
            pausedTorrentCount: stats.pausedTorrentCount,
            dhtNodes: stats.dhtNodes ?? 0,
        };
    }

    public async closeSession(): Promise<void> {
        await this.mutate("session-close");
    }

    public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        const result = await this.send<TransmissionFreeSpace>({
            method: "free-space",
            arguments: { path },
        });
        return result.arguments;
    }

    private async fetchTransmissionTorrents(): Promise<TransmissionTorrent[]> {
        const result = await this.send<TorrentGetResponse<TransmissionTorrent>>(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                },
            }
        );
        return result.arguments.torrents;
    }

    private async fetchTransmissionTorrentSummaryByIdentifier(
        identifier: string | number
    ): Promise<TransmissionTorrent> {
        const result = await this.send<TorrentGetResponse<TransmissionTorrent>>(
            {
                method: "torrent-get",
                arguments: {
                    fields: ["id", "hashString"],
                    ids: [identifier],
                },
            }
        );
        const [torrent] = result.arguments.torrents;
        if (!torrent) {
            throw new Error(`Torrent ${identifier} not found`);
        }
        return torrent;
    }

    private async fetchTransmissionTorrentDetails(
        id: number
    ): Promise<TransmissionTorrentDetail> {
        const result = await this.send<
            TorrentGetResponse<TransmissionTorrentDetail>
        >({
            method: "torrent-get",
            arguments: {
                fields: DETAIL_FIELDS,
                ids: [id],
            },
        });
        const [torrent] = result.arguments.torrents;
        if (!torrent) {
            throw new Error(`Torrent ${id} not found`);
        }
        return torrent;
    }

    public async getTorrents(): Promise<TorrentEntity[]> {
        const torrents = await this.fetchTransmissionTorrents();
        this.syncIdMap(torrents);
        return torrents.map(normalizeTorrent);
    }

    public async getTorrentDetails(id: string): Promise<TorrentDetailEntity> {
        const rpcId = await this.resolveRpcId(id);
        const detail = await this.fetchTransmissionTorrentDetails(rpcId);
        this.idMap.set(detail.hashString, detail.id);
        return normalizeTorrentDetail(detail);
    }

    public async addTorrent(payload: AddTorrentPayload): Promise<void> {
        const args: Record<string, unknown> = {
            "download-dir": payload.downloadDir,
            paused: payload.paused,
        };
        if (payload.metainfo) {
            args.metainfo = payload.metainfo;
        } else if (payload.magnetLink) {
            args.filename = payload.magnetLink;
        } else {
            throw new Error("No torrent source provided");
        }
        await this.send<AddTorrentResponse>({
            method: "torrent-add",
            arguments: args,
        });
    }

    public async pause(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.stopTorrents(rpcIds);
    }

    public async resume(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.startTorrents(rpcIds);
    }

    public async verify(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.verifyTorrents(rpcIds);
    }

    public async moveToTop(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-top", rpcIds);
    }

    public async moveUp(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-up", rpcIds);
    }

    public async moveDown(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-down", rpcIds);
    }

    public async moveToBottom(ids: string[]): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.queueOperation("queue-move-bottom", rpcIds);
    }

    public async remove(ids: string[], deleteData = false): Promise<void> {
        const rpcIds = await this.resolveIds(ids);
        await this.mutate("torrent-remove", {
            ids: rpcIds,
            "delete-local-data": deleteData,
        });
        ids.forEach((id) => {
            this.idMap.delete(id);
        });
    }

    public async updateFileSelection(
        id: string,
        indexes: number[],
        wanted: boolean
    ): Promise<void> {
        if (!indexes.length) return;
        const key = wanted ? "files-wanted" : "files-unwanted";
        const rpcId = await this.resolveRpcId(id);
        await this.mutate("torrent-set", {
            ids: [rpcId],
            [key]: indexes,
        });
    }

    public async forceTrackerReannounce(id: string): Promise<void> {
        const rpcId = await this.resolveRpcId(id);
        await this.send<void>({
            method: "torrent-reannounce",
            arguments: {
                ids: [rpcId],
            },
        });
    }

    public async startTorrents(ids: number[], now = false): Promise<void> {
        const method = now ? "torrent-start-now" : "torrent-start";
        await this.mutate(method, { ids });
    }

    public async stopTorrents(ids: number[]): Promise<void> {
        await this.mutate("torrent-stop", { ids });
    }

    public async verifyTorrents(ids: number[]): Promise<void> {
        await this.mutate("torrent-verify", { ids });
    }

    public async renameTorrentPath(
        id: number,
        path: string,
        name: string
    ): Promise<TransmissionTorrentRenameResult> {
        const result = await this.send<TransmissionTorrentRenameResult>({
            method: "torrent-rename-path",
            arguments: {
                ids: [id],
                path,
                name,
            },
        });
        return result.arguments;
    }

    public async setTorrentLocation(
        ids: number | number[],
        location: string,
        moveData = true
    ): Promise<void> {
        await this.mutate("torrent-set-location", {
            ids: Array.isArray(ids) ? ids : [ids],
            location,
            move: moveData,
        });
    }

    public async setBandwidthGroup(
        options: TransmissionBandwidthGroupOptions
    ): Promise<void> {
        const args: Record<string, unknown> = { name: options.name };
        if (options.honorsSessionLimits !== undefined) {
            args["honors-session-limits"] = options.honorsSessionLimits;
        }
        if (options.speedLimitDown !== undefined) {
            args["speed-limit-down"] = options.speedLimitDown;
        }
        if (options.speedLimitDownEnabled !== undefined) {
            args["speed-limit-down-enabled"] = options.speedLimitDownEnabled;
        }
        if (options.speedLimitUp !== undefined) {
            args["speed-limit-up"] = options.speedLimitUp;
        }
        if (options.speedLimitUpEnabled !== undefined) {
            args["speed-limit-up-enabled"] = options.speedLimitUpEnabled;
        }
        await this.mutate("group-set", args);
    }
}
