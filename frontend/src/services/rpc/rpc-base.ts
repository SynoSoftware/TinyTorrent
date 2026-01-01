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
import { z } from "zod";
import {
    parseRpcResponse,
    zTransmissionTorrentArray,
    zTransmissionTorrentDetailSingle,
    zSessionStats,
    zTransmissionSessionSettings,
    zTransmissionFreeSpace,
    zDirectoryBrowseResponse,
    zTinyTorrentCapabilitiesNormalized,
    zSystemAutorunStatus,
    zSystemHandlerStatus,
    zTransmissionTorrentRenameResult,
    zSystemInstallResult,
    zRpcSuccess,
    getTorrentList,
    getSessionStats,
} from "@/services/rpc/schemas";
import {
    CONFIG,
    FOCUS_RESTORE_DELAY_MS,
    WS_RECONNECT_INITIAL_DELAY_MS,
    WS_RECONNECT_MAX_DELAY_MS,
} from "@/config/logic";
import type { EngineAdapter } from "./engine-adapter";
import { NativeShell } from "@/app/runtime";
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
    ServerClass,
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
    import.meta.env.VITE_RPC_ENDPOINT ?? CONFIG.defaults.rpc_endpoint;

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
    // Active in-flight request controllers (for abort on destroy)
    private readonly activeControllers = new Set<AbortController>();
    private tinyTorrentCapabilities?: TinyTorrentCapabilities | null;
    private websocketSession?: TinyTorrentWebSocketSession;
    private serverClass: ServerClass = "unknown";

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

    private getAuthorizationHeader(): string | undefined {
        if (!this.username && !this.password) {
            return undefined;
        }
        const token = `${this.username}:${this.password}`;
        return `Basic ${btoa(token)}`;
    }

    private async send<T>(
        payload: RpcRequest<string>,
        schema: z.ZodSchema<T>,
        retryCount = 0,
        keepalive = false
    ): Promise<T> {
        const controller = new AbortController();
        this.activeControllers.add(controller);
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
            if (ttAuth) {
                headers["X-TT-Auth"] = ttAuth;
            }
            if (this.sessionId) {
                headers["X-Transmission-Session-Id"] = this.sessionId;
            }
            const authHeader = this.getAuthorizationHeader();
            if (authHeader) {
                headers.Authorization = authHeader;
            }

            const requestInit: RequestInit = {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            };
            if (keepalive) {
                requestInit.keepalive = true;
            }
            const response = await fetch(this.endpoint, requestInit);

            if (response.status === 409) {
                const token = response.headers.get("X-Transmission-Session-Id");
                if (token && token !== this.sessionId && retryCount < 1) {
                    this.sessionId = token;
                    return this.send(
                        payload,
                        schema,
                        retryCount + 1,
                        keepalive
                    );
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
            const args = parsed.arguments ?? {};
            return schema.parse(args as unknown) as T;
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            // remove controller from active set
            try {
                this.activeControllers.delete(controller);
            } catch {
                // swallow
            }
        }
    }

    // Synchronously destroy the adapter and release resources.
    public destroy(): void {
        try {
            this.heartbeat.disablePolling();
        } catch {}
        try {
            this.closeWebSocketSession();
        } catch {}
        try {
            for (const ctrl of Array.from(this.activeControllers)) {
                try {
                    ctrl.abort();
                } catch {}
            }
        } finally {
            this.activeControllers.clear();
        }
    }

    private async mutate(method: string, args: Record<string, unknown> = {}) {
        await this.send({ method, arguments: args }, zRpcSuccess);
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

    private updateServerClassFromCapabilities(
        capabilities: TinyTorrentCapabilities | null
    ) {
        if (!capabilities || !capabilities.serverClass) {
            this.serverClass = "unknown";
            return;
        }
        if (capabilities.serverClass === "tinytorrent") {
            this.serverClass = "tinytorrent";
            return;
        }
        if (capabilities.serverClass === "transmission") {
            this.serverClass = "transmission";
            return;
        }
        this.serverClass = "unknown";
    }

    private applyCapabilities(capabilities: TinyTorrentCapabilities | null) {
        this.tinyTorrentCapabilities = capabilities;
        this.updateServerClassFromCapabilities(capabilities);
        this.ensureWebsocketConnection();
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
        if (!this.hasWebsocketSupport()) {
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
                onUiFocus: () => {
                    if ((this as any).handleUiFocusSignal) {
                        (this as any).handleUiFocusSignal();
                    }
                },
                onError: (error) => {
                    console.error("[tiny-torrent][ws]", error);
                },
            });
        }
        this.websocketSession.start(wsBaseUrl);
    }

    public async refreshExtendedCapabilities(force = false): Promise<void> {
        if (!force && this.tinyTorrentCapabilities !== undefined) {
            this.ensureWebsocketConnection();
            return;
        }
        try {
            const response = await this.send(
                { method: "tt-get-capabilities" },
                zTinyTorrentCapabilitiesNormalized
            );
            this.applyCapabilities(response);
        } catch (error) {
            console.error(
                `[tiny-torrent][rpc] refreshExtendedCapabilities failed`,
                error
            );
            this.applyCapabilities(null);
        }
    }

    private hasWebsocketSupport() {
        const endpointPath =
            this.tinyTorrentCapabilities?.websocketEndpoint ??
            this.tinyTorrentCapabilities?.websocketPath;
        const supportsDeltaSync =
            this.tinyTorrentCapabilities?.features?.includes(
                "websocket-delta-sync"
            );
        return (
            this.serverClass === "tinytorrent" &&
            Boolean(endpointPath) &&
            Boolean(supportsDeltaSync)
        );
    }

    public async handshake(): Promise<TransmissionSessionSettings> {
        const result = await this.send(
            { method: "session-get" },
            zTransmissionSessionSettings
        );
        this.sessionSettingsCache = result;

        this.engineInfoCache = undefined;
        this.applyCapabilities(null);

        // FIX: Use 'this' instead of 'adapter'.
        await this.refreshExtendedCapabilities(true);

        return result;
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
            timestampMs: Date.now(),
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

    public async notifyUiReady(): Promise<void> {
        if (this.serverClass === "tinytorrent") {
            return;
        }
        if (
            this.tinyTorrentCapabilities &&
            this.tinyTorrentCapabilities.features?.includes?.("ui-attach")
        ) {
            await this.mutate("session-ui-attach");
        }
    }

    public async notifyUiDetached(): Promise<void> {
        const isTransmissionClass = this.serverClass !== "tinytorrent";
        if (!isTransmissionClass) {
            return;
        }
        if (!this.tinyTorrentCapabilities?.features?.includes?.("ui-attach")) {
            return;
        }
        const request = { method: "session-ui-detach" };
        // Use fetch with keepalive so we can include required headers
        // (notably X-Transmission-Session-Id). sendBeacon does not allow
        // custom headers and will often result in 409 from Transmission.
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            const ttAuth = this.getTinyTorrentAuthToken();
            if (ttAuth) {
                headers["X-TT-Auth"] = ttAuth;
            }
            if (this.sessionId) {
                headers["X-Transmission-Session-Id"] = this.sessionId;
            }
            const authHeader = this.getAuthorizationHeader();
            if (authHeader) headers.Authorization = authHeader;

            const payload = JSON.stringify(request);
            const requestInit: RequestInit = {
                method: "POST",
                headers,
                body: payload,
                keepalive: true,
            };

            const resp = await fetch(this.endpoint, requestInit);
            if (resp.status === 409) {
                const token = resp.headers.get("X-Transmission-Session-Id");
                if (token && token !== this.sessionId) {
                    this.sessionId = token;
                    // retry once with updated session id
                    headers["X-Transmission-Session-Id"] = this.sessionId;
                    await fetch(this.endpoint, {
                        ...requestInit,
                        headers,
                    });
                }
            }
            // best-effort; don't throw on non-OK because this is fire-and-forget
            return;
        } catch (e) {
            // fallback to adapter send which supports retries and header logic
        }

        await this.send(request, zRpcSuccess, 0, true);
    }

    public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
        const settings = await this.send(
            { method: "session-get" },
            zTransmissionSessionSettings
        );
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
        if (
            force ||
            this.tinyTorrentCapabilities === undefined ||
            this.tinyTorrentCapabilities === null
        ) {
            await this.refreshExtendedCapabilities();
        } else {
            this.ensureWebsocketConnection();
        }
        return this.tinyTorrentCapabilities ?? null;
    }

    public getServerClass(): ServerClass {
        return this.serverClass;
    }

    public async updateSessionSettings(
        settings: Partial<TransmissionSessionSettings>
    ): Promise<void> {
        await this.send(
            { method: "session-set", arguments: settings },
            zRpcSuccess
        );
        this.sessionSettingsCache = {
            ...(this.sessionSettingsCache ?? {}),
            ...settings,
        };
    }

    public async testPort(): Promise<boolean> {
        const result = await this.send(
            { method: "session-test" },
            z.object({ portIsOpen: z.boolean().optional() })
        );
        return Boolean(result.portIsOpen);
    }

    public async fetchSessionStats(): Promise<TransmissionSessionStats> {
        try {
            const stats = await this.send(
                { method: "session-stats" },
                zSessionStats
            );
            return stats;
        } catch (error) {
            // Best-effort fallback: log and return zeroed stats to avoid
            // disconnecting the UI on malformed or partial RPC responses.
            console.warn(
                "[tiny-torrent][rpc] failed to parse session-stats, returning zeroed stats",
                error
            );
            const zeroTotals = {
                uploadedBytes: 0,
                downloadedBytes: 0,
                filesAdded: 0,
                secondsActive: 0,
                sessionCount: 0,
            };
            return {
                activeTorrentCount: 0,
                downloadSpeed: 0,
                pausedTorrentCount: 0,
                torrentCount: 0,
                uploadSpeed: 0,
                dhtNodes: 0,
                cumulativeStats: zeroTotals,
                currentStats: zeroTotals,
            };
        }
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

    /**
     * Return the engine-owned speed history for a torrent.
     * This delegates to the internal HeartbeatManager which maintains fixed-length buffers.
     */
    public async getSpeedHistory(
        id: string
    ): Promise<{ down: number[]; up: number[] }> {
        try {
            // HeartbeatManager provides a synchronous getter that returns copies of buffers.
            // Call it directly and return the result as a resolved Promise.
            const data = this.heartbeat.getSpeedHistory(id);
            return Promise.resolve(data);
        } catch (e) {
            return Promise.resolve({ down: [], up: [] });
        }
    }

    public async closeSession(): Promise<void> {
        await this.mutate("session-close");
    }

    public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        if (NativeShell.isAvailable) {
            return NativeShell.checkFreeSpace(path);
        }
        const fs = await this.send(
            { method: "free-space", arguments: { path } },
            zTransmissionFreeSpace
        );
        return fs;
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
            throw new Error(
                "fs-browse is not supported by the connected engine"
            );
        }
        const result = await this.send(
            { method: "fs-browse", arguments: path ? { path } : undefined },
            zDirectoryBrowseResponse
        );
        return result;
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
        if (this.serverClass === "tinytorrent" && NativeShell.isAvailable) {
            await NativeShell.openPath(path);
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
        const result = await this.send(
            { method: "system-install", arguments: args },
            zSystemInstallResult
        );
        return result as SystemInstallResult;
    }

    public async getSystemAutorunStatus(): Promise<AutorunStatus> {
        const result = await this.send(
            { method: "system-autorun-status" },
            zSystemAutorunStatus
        );
        return result;
    }

    public async getSystemHandlerStatus(): Promise<SystemHandlerStatus> {
        const result = await this.send(
            { method: "system-handler-status" },
            zSystemHandlerStatus
        );
        return result;
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
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                },
            },
            zTransmissionTorrentArray
        );
        return list as TransmissionTorrent[];
    }

    private async fetchTransmissionTorrentSummaryByIdentifier(
        identifier: string | number
    ): Promise<TransmissionTorrent> {
        const list = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: SUMMARY_FIELDS,
                    ids: [identifier],
                },
            },
            zTransmissionTorrentArray
        );
        const [torrent] = list as TransmissionTorrent[];
        if (!torrent) {
            throw new Error(`Torrent ${identifier} not found`);
        }
        return torrent as TransmissionTorrent;
    }

    private async fetchTransmissionTorrentDetails(
        id: number
    ): Promise<TransmissionTorrentDetail> {
        const detail = await this.send(
            {
                method: "torrent-get",
                arguments: {
                    fields: DETAIL_FIELDS,
                    ids: [id],
                },
            },
            zTransmissionTorrentDetailSingle
        );
        return detail as TransmissionTorrentDetail;
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
        if (payload.metainfoPath) {
            args["metainfo-path"] = payload.metainfoPath;
        } else if (payload.metainfo) {
            args.metainfo = payload.metainfo;
        } else if (payload.magnetLink) {
            args.filename = payload.magnetLink;
        } else {
            throw new Error("No torrent source provided");
        }
        await this.send(
            { method: "torrent-add", arguments: args },
            zRpcSuccess
        );
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
        await this.send(
            {
                method: "torrent-reannounce",
                arguments: {
                    ids: [rpcId],
                },
            },
            zRpcSuccess
        );
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
        const result = await this.send(
            {
                method: "torrent-rename-path",
                arguments: {
                    ids: [id],
                    path,
                    name,
                },
            },
            zTransmissionTorrentRenameResult
        );
        return result;
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
    onUiFocus?: () => void;
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

type TinyTorrentEventMessage = {
    type: "event";
    data?: {
        event?: string;
    };
};

type TinyTorrentWebSocketMessage =
    | SyncSnapshotMessage
    | SyncPatchMessage
    | TinyTorrentEventMessage;

class TinyTorrentWebSocketSession {
    private static nextSessionId = 1;
    private readonly sessionId: number;
    private readonly logPrefix: string;
    private baseUrl?: URL;
    private socket?: WebSocket;
    private reconnectTimer?: number;
    private reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
    private readonly maxReconnectDelay = WS_RECONNECT_MAX_DELAY_MS;
    private shouldReconnect = false;
    private isConnected = false;
    private readonly torrentsMap = new Map<number, TransmissionTorrent>();
    private lastSessionStats?: TransmissionSessionStats;
    private readonly options: TinyTorrentWebSocketSessionOptions;
    private focusRestoreTimer?: number;
    private connectAttempt = 0;

    constructor(options: TinyTorrentWebSocketSessionOptions) {
        this.sessionId = TinyTorrentWebSocketSession.nextSessionId++;
        this.logPrefix = `[tiny-torrent][ws #${this.sessionId}]`;
        this.options = options;
        console.log(`${this.logPrefix} session created`);
    }

    private handleUiFocusSignal() {
        if (typeof window === "undefined") {
            return;
        }
        const token = this.options.getToken();
        const focusKey = token ? `TT-FOCUS-${token}` : null;
        const originalTitle =
            typeof document !== "undefined" ? document.title : "";

        if (focusKey) {
            document.title = focusKey;
        }

        if (typeof window.focus === "function") {
            window.focus();
        }

        if (!focusKey) {
            return;
        }

        if (this.focusRestoreTimer) {
            window.clearTimeout(this.focusRestoreTimer);
        }

        this.focusRestoreTimer = window.setTimeout(() => {
            if (
                focusKey &&
                typeof document !== "undefined" &&
                document.title === focusKey
            ) {
                document.title = originalTitle;
            }
            this.focusRestoreTimer = undefined;
        }, FOCUS_RESTORE_DELAY_MS);
    }

    public start(baseUrl: URL) {
        if (typeof window === "undefined" || typeof WebSocket === "undefined") {
            return;
        }
        this.stop();
        this.baseUrl = baseUrl;
        console.log(`${this.logPrefix} start requested baseUrl=${baseUrl.toString()}`);
        this.torrentsMap.clear();
        this.lastSessionStats = undefined;
        this.shouldReconnect = true;
        this.reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
        this.scheduleConnect(0);
    }

    public stop() {
        console.log(`${this.logPrefix} stop invoked`);
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.socket) {
            console.log(`${this.logPrefix} closing socket`);
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
        console.log(
            `${this.logPrefix} scheduling connect in ${delay}ms (shouldReconnect=${this.shouldReconnect})`
        );
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
    }

    private openSocket() {
        if (!this.shouldReconnect || !this.baseUrl) return;
        const url = this.buildUrlWithToken();
        if (!url) {
            this.options.onError?.(new Error("Invalid WebSocket URL"));
            return;
        }
        const attemptId = ++this.connectAttempt;
        console.log(
            `${this.logPrefix} opening WebSocket attempt #${attemptId} to ${url.toString()}`
        );
        try {
            this.socket = new WebSocket(url.toString());
        } catch (error) {
            console.error(
                `${this.logPrefix} connect attempt #${attemptId} failed`,
                error
            );
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
        console.log(
            `${this.logPrefix} websocket opened (attempt #${this.connectAttempt})`
        );
        this.reconnectDelay = WS_RECONNECT_INITIAL_DELAY_MS;
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
        } else if (parsed.type === "event") {
            this.handleEvent(parsed.data);
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

    private handleEvent(data: TinyTorrentEventMessage["data"]) {
        const eventName = data?.event;
        if (!eventName) {
            return;
        }
        if (eventName === "ui-focus") {
            this.options.onUiFocus?.();
        }
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

    private parseSession(value: unknown): TransmissionSessionStats | undefined {
        if (!value) return undefined;
        try {
            return getSessionStats(value as unknown);
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

    private handleClose = (event: CloseEvent) => {
        console.warn(
            `${this.logPrefix} websocket closed code=${event.code} reason=${event.reason}`
        );
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
        console.error(`${this.logPrefix} websocket error`, event);
        this.options.onError?.(event);
    };

    private markDisconnected() {
        if (!this.isConnected) {
            return;
        }
        console.log(`${this.logPrefix} markDisconnected`);
        this.isConnected = false;
        this.options.onDisconnected?.();
    }
}
