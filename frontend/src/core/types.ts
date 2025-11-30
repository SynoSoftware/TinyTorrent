export type TorrentStatus = "downloading" | "seeding" | "paused" | "checking" | "error";

export interface TransmissionTorrent {
  id: number;
  hashString: string;
  name: string;
  totalSize: number;
  percentDone: number;
  status: TorrentStatus;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  seedsConnected: number;
  eta: number;
}

export interface TransmissionPollResponse {
  torrents: TransmissionTorrent[];
}

export interface TransmissionSession {
  id: number;
  version: string;
  downloadDir: string;
}
