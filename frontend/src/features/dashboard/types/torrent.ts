export type TorrentStatus = "downloading" | "seeding" | "paused" | "checking" | "error";

export interface Torrent {
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
