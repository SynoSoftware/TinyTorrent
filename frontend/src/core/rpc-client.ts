import type { TransmissionPollResponse, TransmissionSession, TransmissionTorrent } from "./types";

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

const DEFAULT_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT ?? "/transmission/rpc";

export class TransmissionClient {
  private endpoint: string;
  private sessionId?: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? DEFAULT_ENDPOINT;
  }

  private async send<T>(payload: RpcRequest<string>): Promise<RpcResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.sessionId) {
      headers["X-Transmission-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      const token = response.headers.get("X-Transmission-Session-Id");
      if (token) {
        this.sessionId = token;
        return this.send<T>(payload);
      }
    }

    if (!response.ok) {
      throw new Error(`Transmission RPC responded with ${response.status}`);
    }

    const data = (await response.json()) as RpcResponse<T>;
    return data;
  }

  public async handshake(): Promise<TransmissionSession> {
    const result = await this.send<TransmissionSession>({ method: "session-get" });
    return result.arguments;
  }

  public async fetchTorrents(): Promise<TransmissionTorrent[]> {
    const result = await this.send<TransmissionPollResponse>({
      method: "torrent-get",
      arguments: {
        fields: [
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
        ],
      },
    });
    return result.arguments.torrents;
  }
}
