import type {
    DirectoryBrowseResult,
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
    SystemInstallOptions,
    SystemInstallResult,
} from "./types";
import {
    getFreeSpace,
    getSessionSettings,
    getSessionStats as parseSessionStats,
    getTinyTorrentCapabilities,
    getSystemAutorunStatus,
    getSystemHandlerStatus,
    getTorrentDetail,
    getTorrentList,
    parseDirectoryBrowseResult,
    parseRpcResponse,
} from "./schemas";
import constants from "../../config/constants.json";
import type { EngineAdapter } from "./engine-adapter";
import { HeartbeatManager } from "./heartbeat";
import type {
    HeartbeatSubscriberParams,
    HeartbeatSubscription,
} from "./heartbeat";
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
    TinyTorrentCapabilities,
    AutorunStatus,
    SystemHandlerStatus,
} from "./entities";
import { normalizeTorrent, normalizeTorrentDetail } from "./normalizers";

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
    "peersSendingToUs",
    "peersGettingFromUs",
    "eta",
    "addedDate",
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

export class TransmissionAdapter implements EngineAdapter {
    private endpoint: string;
    private sessionId?: string;
    private username: string;
    private password: string;
    private requestTimeout?: number;
    private sessionSettingsCache?: TransmissionSessionSettings;
    private engineInfoCache?: EngineInfo;
    private idMap = new Map<string, number>();
    private readonly heartbeat = new HeartbeatManager(this);
    private tinyTorrentCapabilities?: TinyTorrentCapabilities | null;
    private websocketSession?: TinyTorrentWebSocketSession;
    private tinyTorrentFeaturesEnabled = false;

    private getTinyTorrentAuthToken(): string | undefined {
        const token = sessionStorage.getItem("tt-auth-token");
        return token && token.length > 0 ? token : undefined;
    }

    private clearTinyTorrentAuthToken() {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem("tt-auth-token");
        }
    }

    private handleUnauthorizedResponse() {
        this.clearTinyTorrentAuthToken();
        this.closeWebSocketSession();
    }

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

    public setTinyTorrentFeaturesEnabled(enabled: boolean) {
        this.tinyTorrentFeaturesEnabled = enabled;
        if (!enabled) {
            this.closeWebSocketSession();
            return;
        }
        this.ensureWebsocketConnection();
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
            const ttAuth = this.getTinyTorrentAuthToken();
            if (ttAuth && this.isLoopbackEndpoint()) {
                headers["X-TT-Auth"] = ttAuth;
            }
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

            if (response.status === 401) {
                this.handleUnauthorizedResponse();
                throw new Error("TinyTorrent RPC unauthorized");
            }
            if (response.status === 403) {
                this.handleUnauthorizedResponse();
                throw new Error("TinyTorrent RPC forbidden");
            }

            if (!response.ok) {
                throw new Error(
                    `Transmission RPC responded with ${response.status}`
                );
            }

            const json = await response.json();
            const parsed = parseRpcResponse(json);
            if (parsed.result !== "success") {
                throw new Error(
                    `Transmission RPC responded with ${parsed.result}`
                );
            }
            const args = (parsed.arguments ?? ({} as T)) as T;
            return {
                ...parsed,
                arguments: args,
            };
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    private async mutate(method: string, args: Record<string, unknown> = {}) {
        await this.send<void>({ method, arguments: args });
    }

    private resolveEndpointUrl(): URL | null {
        if (typeof window === "undefined") {
            return null;
        }
        try {
            return new URL(this.endpoint, window.location.origin);
        } catch {
            return null;
        }
    }

    private isLoopbackEndpoint(): boolean {
        const resolved = this.resolveEndpointUrl();
        if (!resolved) {
            return false;
        }
        const host = resolved.hostname.replace(/^\[|\]$/g, "").toLowerCase();
        return (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "::1"
        );
    }

    private buildWebSocketBaseUrl(path: string): URL | null {
        if (!path) return null;
        try {
            if (path.startsWith("ws://") || path.startsWith("wss://")) {
                return new URL(path);
            }
            const endpointUrl = this.resolveEndpointUrl();
            if (!endpointUrl) {
                return null;
            }
            const scheme = endpointUrl.protocol === "https:" ? "wss" : "ws";
            const normalizedPath = path.startsWith("/") ? path : `/${path}`;
            return new URL(`${scheme}://${endpointUrl.host}${normalizedPath}`);
        } catch {
            return null;
        }
    }

    private closeWebSocketSession() {
        this.websocketSession?.stop();
        this.websocketSession = undefined;
    }

    private ensureWebsocketConnection() {
        if (!this.tinyTorrentFeaturesEnabled) {
            this.closeWebSocketSession();
            return;
        }
        const endpointPath =
            this.tinyTorrentCapabilities?.websocketEndpoint ??
            this.tinyTorrentCapabilities?.websocketPath;
        if (!endpointPath) {
            this.closeWebSocketSession();
            return;
        }
        const wsBaseUrl = this.buildWebSocketBaseUrl(endpointPath);
        if (!wsBaseUrl) {
            this.closeWebSocketSession();
            return;
        }
        if (!this.websocketSession) {
            this.websocketSession = new TinyTorrentWebSocketSession({
                getToken: () => this.getTinyTorrentAuthToken(),
                onUpdate: this.handleLiveStateUpdate,
                onConnected: () => this.heartbeat.disablePolling(),
                onDisconnected: () => this.heartbeat.enablePolling(),
                onError: (error) => {
                    console.error("[tiny-torrent][ws]", error);
                },
            });
        }
        this.websocketSession.start(wsBaseUrl);
    }

    private async refreshExtendedCapabilities(): Promise<void> {
        try {
            const response = await this.send<Record<string, unknown>>({
                method: "tt-get-capabilities",
            });
            this.tinyTorrentCapabilities = getTinyTorrentCapabilities(
                response.arguments
            );
        } catch {
            this.tinyTorrentCapabilities = null;
        }
        this.ensureWebsocketConnection();
    }

    private handleLiveStateUpdate = ({
        torrents,
        session,
    }: {
        torrents: TransmissionTorrent[];
        session: TransmissionSessionStats;
    }) => {
        this.syncIdMap(torrents);
        const normalized = torrents.map(normalizeTorrent);
        const stats = mapTransmissionSessionStatsToSessionStats(session);
        this.heartbeat.pushLivePayload({
            torrents: normalized,
            sessionStats: stats,
            source: "websocket",
        });
    };

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
        this.tinyTorrentCapabilities = undefined;
        this.closeWebSocketSession();
        return result.arguments;
    }

    public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
        const result = await this.send<TransmissionSessionSettings>({
            method: "session-get",
        });
        const settings = getSessionSettings(result.arguments);
        this.sessionSettingsCache = settings;
        return settings;
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

    public async getExtendedCapabilities(
        force = false
    ): Promise<TinyTorrentCapabilities | null> {
        if (force || this.tinyTorrentCapabilities === undefined) {
            await this.refreshExtendedCapabilities();
        } else {
            this.ensureWebsocketConnection();
        }
        return this.tinyTorrentCapabilities ?? null;
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
        return parseSessionStats(result.arguments);
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

    public subscribeToHeartbeat(
        params: HeartbeatSubscriberParams
    ): HeartbeatSubscription {
        return this.heartbeat.subscribe(params);
    }

    public async closeSession(): Promise<void> {
        await this.mutate("session-close");
    }

    public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        const result = await this.send<TransmissionFreeSpace>({
            method: "free-space",
            arguments: { path },
        });
        return getFreeSpace(result.arguments);
    }

    private supportsFsBrowse(): boolean {
        return Boolean(
            this.tinyTorrentCapabilities?.features.includes("fs-browse")
        );
    }

    public async browseDirectory(
        path?: string
    ): Promise<DirectoryBrowseResult> {
        if (!this.supportsFsBrowse()) {
            throw new Error("fs-browse is not supported by the connected engine");
        }
        const result = await this.send<DirectoryBrowseResult>({
            method: "fs-browse",
            arguments: path ? { path } : undefined,
        });
        return parseDirectoryBrowseResult(result.arguments);
    }

    public async createDirectory(path: string): Promise<void> {
        if (!path) {
            return;
        }
        await this.mutate("fs-create-dir", { path });
    }

    public async openPath(path: string): Promise<void> {
        if (!path) {
            return;
        }
        await this.mutate("system-open", { path });
    }

    public async systemInstall(
        options: SystemInstallOptions = {}
    ): Promise<SystemInstallResult> {
        const args: Record<string, unknown> = {};
        const name = options.name?.trim();
        if (name) {
            args.name = name;
        }
        if (options.args && options.args.trim()) {
            args.args = options.args.trim();
        }
        if (options.locations && options.locations.length > 0) {
            args.locations = options.locations;
        }
        if (options.registerHandlers !== undefined) {
            args.registerHandlers = options.registerHandlers;
        }
        if (options.installToProgramFiles !== undefined) {
            args.installToProgramFiles = options.installToProgramFiles;
        }
        const result = await this.send<SystemInstallResult>({
            method: "system-install",
            arguments: args,
        });
        return result.arguments;
    }

    public async getSystemAutorunStatus(): Promise<AutorunStatus> {
        const result = await this.send<AutorunStatus>({
            method: "system-autorun-status",
        });
        return getSystemAutorunStatus(result.arguments);
    }

    public async getSystemHandlerStatus(): Promise<SystemHandlerStatus> {
        const result = await this.send<SystemHandlerStatus>({
            method: "system-handler-status",
        });
        return getSystemHandlerStatus(result.arguments);
    }

    public async systemAutorunEnable(scope = "user"): Promise<void> {
        await this.mutate("system-autorun-enable", { scope });
    }

    public async systemAutorunDisable(): Promise<void> {
        await this.mutate("system-autorun-disable");
    }

    public async systemHandlerEnable(): Promise<void> {
        await this.mutate("system-handler-enable");
    }

    public async systemHandlerDisable(): Promise<void> {
        await this.mutate("system-handler-disable");
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
        return getTorrentList(result.arguments);
    }

    private async fetchTransmissionTorrentSummaryByIdentifier(
        identifier: string | number
    ): Promise<TransmissionTorrent> {
        const result = await this.send<TorrentGetResponse<TransmissionTorrent>>(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                    ids: [identifier],
                },
            }
        );
        const [torrent] = getTorrentList(result.arguments);
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
        return getTorrentDetail(result.arguments);
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
            paused: payload.paused,
        };
        if (payload.downloadDir?.trim()) {
            args["download-dir"] = payload.downloadDir;
        }
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

function mapTransmissionSessionStatsToSessionStats(
    stats: TransmissionSessionStats
): SessionStats {
    return {
        downloadSpeed: stats.downloadSpeed,
        uploadSpeed: stats.uploadSpeed,
        torrentCount: stats.torrentCount,
        activeTorrentCount: stats.activeTorrentCount,
        pausedTorrentCount: stats.pausedTorrentCount,
        dhtNodes: stats.dhtNodes ?? 0,
    };
}

interface TinyTorrentWebSocketSessionOptions {
    getToken: () => string | undefined;
    onUpdate: (data: {
        torrents: TransmissionTorrent[];
        session: TransmissionSessionStats;
    }) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: unknown) => void;
}

type SyncSnapshotMessage = {
    type: "sync-snapshot";
    data: {
        session?: unknown;
        torrents?: TransmissionTorrent[];
    };
};

type SyncPatchMessage = {
    type: "sync-patch";
    data: {
        session?: unknown;
        torrents?: {
            removed?: number[];
            added?: TransmissionTorrent[];
            updated?: TransmissionTorrent[];
        };
    };
};

type TinyTorrentWebSocketMessage =
    | SyncSnapshotMessage
    | SyncPatchMessage
    | { type: "event"; data?: unknown };

class TinyTorrentWebSocketSession {
    private baseUrl?: URL;
    private socket?: WebSocket;
    private reconnectTimer?: number;
    private reconnectDelay = 1000;
    private readonly maxReconnectDelay = 10000;
    private shouldReconnect = false;
    private isConnected = false;
    private readonly torrentsMap = new Map<number, TransmissionTorrent>();
    private lastSessionStats?: TransmissionSessionStats;
    private readonly options: TinyTorrentWebSocketSessionOptions;

    constructor(options: TinyTorrentWebSocketSessionOptions) {
        this.options = options;
    }

    public start(baseUrl: URL) {
        if (typeof window === "undefined" || typeof WebSocket === "undefined") {
            return;
        }
        this.stop();
        this.baseUrl = baseUrl;
        this.torrentsMap.clear();
        this.lastSessionStats = undefined;
        this.shouldReconnect = true;
        this.reconnectDelay = 1000;
        this.scheduleConnect(0);
    }

    public stop() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
        }
        this.markDisconnected();
    }

    private scheduleConnect(delay: number) {
        if (!this.shouldReconnect || !this.baseUrl) return;
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
    }

    private openSocket() {
        if (!this.shouldReconnect || !this.baseUrl) return;
        const url = this.buildUrlWithToken();
        if (!url) {
            this.options.onError?.(new Error("Invalid WebSocket URL"));
            return;
        }
        try {
            this.socket = new WebSocket(url.toString());
        } catch (error) {
            this.options.onError?.(error);
            this.scheduleConnect(this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.maxReconnectDelay,
                this.reconnectDelay * 2
            );
            return;
        }
        this.socket.addEventListener("open", this.handleOpen);
        this.socket.addEventListener("message", this.handleMessage);
        this.socket.addEventListener("close", this.handleClose);
        this.socket.addEventListener("error", this.handleError);
    }

    private buildUrlWithToken(): URL | null {
        if (!this.baseUrl) return null;
        const url = new URL(this.baseUrl.toString());
        const token = this.options.getToken();
        if (token) {
            url.searchParams.set("token", token);
        } else {
            url.searchParams.delete("token");
        }
        return url;
    }

    private handleOpen = () => {
        this.reconnectDelay = 1000;
        this.isConnected = true;
        this.options.onConnected?.();
    };

    private handleMessage = (event: MessageEvent) => {
        let parsed: TinyTorrentWebSocketMessage;
        try {
            parsed = JSON.parse(event.data);
        } catch {
            return;
        }
        if (parsed.type === "sync-snapshot") {
            this.handleSnapshot(parsed.data);
        } else if (parsed.type === "sync-patch") {
            this.handlePatch(parsed.data);
        }
    };

    private handleSnapshot(data: SyncSnapshotMessage["data"]) {
        const session = this.parseSession(data.session);
        if (!session) {
            return;
        }
        const torrents = this.parseTorrents(data.torrents);
        this.torrentsMap.clear();
        torrents.forEach((torrent) => {
            this.torrentsMap.set(torrent.id, torrent);
        });
        this.lastSessionStats = session;
        this.emitUpdate();
    }

    private handlePatch(data: SyncPatchMessage["data"]) {
        const patch = data.torrents;
        if (patch?.removed) {
            for (const id of patch.removed) {
                this.torrentsMap.delete(id);
            }
        }
        if (patch?.added) {
            this.parseTorrents(patch.added).forEach((torrent) => {
                this.torrentsMap.set(torrent.id, torrent);
            });
        }
        if (patch?.updated) {
            this.parseTorrents(patch.updated).forEach((torrent) => {
                this.torrentsMap.set(torrent.id, torrent);
            });
        }
        const session = this.parseSession(data.session);
        if (session) {
            this.lastSessionStats = session;
        }
        this.emitUpdate();
    }

    private parseTorrents(
        value: TransmissionTorrent[] | undefined
    ): TransmissionTorrent[] {
        if (!value || !value.length) return [];
        try {
            return getTorrentList({ torrents: value });
        } catch (error) {
            this.options.onError?.(error);
            return [];
        }
    }

    private parseSession(
        value: unknown
    ): TransmissionSessionStats | undefined {
        if (!value) return undefined;
        try {
            return parseSessionStats(value);
        } catch (error) {
            this.options.onError?.(error);
            return undefined;
        }
    }

    private emitUpdate() {
        if (!this.lastSessionStats) {
            return;
        }
        const torrents = Array.from(this.torrentsMap.values());
        this.options.onUpdate({
            torrents,
            session: this.lastSessionStats,
        });
    }

    private handleClose = () => {
        this.markDisconnected();
        if (this.shouldReconnect) {
            this.scheduleConnect(this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.maxReconnectDelay,
                this.reconnectDelay * 2
            );
        }
    };

    private handleError = (event: Event) => {
        this.options.onError?.(event);
    };

    private markDisconnected() {
        if (!this.isConnected) {
            return;
        }
        this.isConnected = false;
        this.options.onDisconnected?.();
    }
}
