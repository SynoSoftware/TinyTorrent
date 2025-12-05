import type {
  TransmissionSessionSettings,
  TransmissionTorrent,
  TransmissionTorrentDetail,
  TransmissionFreeSpace,
  TransmissionSessionStats,
  TransmissionBandwidthGroupOptions,
  TransmissionTorrentRenameResult,
} from "./types";
import constants from "../config/constants.json";

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

const DEFAULT_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT ?? constants.defaults.rpc_endpoint;

const SUMMARY_FIELDS: Array<keyof TransmissionTorrent> = [
  "id",
  "hashString",
  "name",
  "totalSize",
  "percentDone",
  "status",
  "rateDownload",
  "rateUpload",
  "peersConnected",
  "seedsConnected",
  "eta",
  "dateAdded",
  "queuePosition",
  "uploadRatio",
  "uploadedEver",
  "downloadedEver",
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

export class TransmissionClient {
  private endpoint: string;
  private sessionId?: string;
  private username: string;
  private password: string;
  private requestTimeout?: number;

  constructor(options?: { endpoint?: string; username?: string; password?: string; requestTimeout?: number }) {
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

  private async send<T>(payload: RpcRequest<string>, retryCount = 0): Promise<RpcResponse<T>> {
    const controller = new AbortController();
    let timeoutId: number | undefined;
    if (this.requestTimeout && this.requestTimeout > 0) {
      timeoutId = window.setTimeout(() => controller.abort(), this.requestTimeout);
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
        throw new Error(`Transmission RPC responded with ${response.status}`);
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

  private normalizeIds(ids: number | number[]): number[] {
    return Array.isArray(ids) ? ids : [ids];
  }

  private async queueOperation(method: string, ids: number | number[]) {
    await this.mutate(method, { ids: this.normalizeIds(ids) });
  }

  public async handshake(): Promise<TransmissionSessionSettings> {
    const result = await this.send<TransmissionSessionSettings>({ method: "session-get" });
    return result.arguments;
  }

  public async fetchSessionSettings(): Promise<TransmissionSessionSettings> {
    const result = await this.send<TransmissionSessionSettings>({ method: "session-get" });
    return result.arguments;
  }

  public async updateSessionSettings(settings: Partial<TransmissionSessionSettings>): Promise<void> {
    await this.send<void>({ method: "session-set", arguments: settings });
  }

  public async testPort(): Promise<boolean> {
    const result = await this.send<{ portIsOpen?: boolean }>({ method: "session-test" });
    return Boolean(result.arguments?.portIsOpen);
  }

  public async fetchSessionStats(): Promise<TransmissionSessionStats> {
    const result = await this.send<TransmissionSessionStats>({ method: "session-stats" });
    return result.arguments;
  }

  public async closeSession(): Promise<void> {
    await this.mutate("session-close");
  }

  public async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
    const result = await this.send<TransmissionFreeSpace>({ method: "free-space", arguments: { path } });
    return result.arguments;
  }

  public async fetchTorrents(): Promise<TransmissionTorrent[]> {
    const result = await this.send<TorrentGetResponse<TransmissionTorrent>>({
      method: "torrent-get",
      arguments: {
        fields: SUMMARY_FIELDS,
      },
    });
    return result.arguments.torrents;
  }

  public async fetchTorrentDetails(id: number): Promise<TransmissionTorrentDetail> {
    const result = await this.send<TorrentGetResponse<TransmissionTorrentDetail>>({
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

  public async moveTorrentsToTop(ids: number | number[]): Promise<void> {
    await this.queueOperation("queue-move-top", ids);
  }

  public async moveTorrentsUp(ids: number | number[]): Promise<void> {
    await this.queueOperation("queue-move-up", ids);
  }

  public async moveTorrentsDown(ids: number | number[]): Promise<void> {
    await this.queueOperation("queue-move-down", ids);
  }

  public async moveTorrentsToBottom(ids: number | number[]): Promise<void> {
    await this.queueOperation("queue-move-bottom", ids);
  }

  public async removeTorrents(ids: number[], deleteData = false): Promise<void> {
    await this.mutate("torrent-remove", { ids, "delete-local-data": deleteData });
  }

  public async addTorrent(payload: {
    magnetLink?: string;
    metainfo?: string;
    downloadDir?: string;
    paused?: boolean;
    filesUnwanted?: number[];
  }): Promise<TransmissionTorrent | null> {
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
    const result = await this.send<AddTorrentResponse>({
      method: "torrent-add",
      arguments: args,
    });
    return result.arguments["torrent-added"] ?? result.arguments["torrent-duplicate"] ?? null;
  }

  public async updateFileSelection(torrentId: number, indexes: number[], wanted: boolean): Promise<void> {
    if (!indexes.length) return;
    const key = wanted ? "files-wanted" : "files-unwanted";
    await this.mutate("torrent-set", {
      ids: [torrentId],
      [key]: indexes,
    });
  }

  public async renameTorrentPath(id: number, path: string, name: string): Promise<TransmissionTorrentRenameResult> {
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

  public async setTorrentLocation(ids: number | number[], location: string, moveData = true): Promise<void> {
    await this.mutate("torrent-set-location", {
      ids: this.normalizeIds(ids),
      location,
      move: moveData,
    });
  }

  public async setBandwidthGroup(options: TransmissionBandwidthGroupOptions): Promise<void> {
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
