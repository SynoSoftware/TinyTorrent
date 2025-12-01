import type {
  TransmissionTorrent,
  TransmissionTorrentDetail,
  RpcTorrentStatus,
} from "../../../core/types";

export type TorrentStatus = "downloading" | "seeding" | "paused" | "checking" | "error";
export type Torrent = Omit<TransmissionTorrent, "status"> & { status: TorrentStatus };
export type TorrentDetail = Omit<TransmissionTorrentDetail, "status"> & { status: TorrentStatus };

const RPC_STATUS_MAP: Record<RpcTorrentStatus, TorrentStatus> = {
  0: "paused",
  1: "checking",
  2: "checking",
  3: "downloading",
  4: "downloading",
  5: "seeding",
  6: "seeding",
  7: "paused",
};

const normalizeStatus = (status: RpcTorrentStatus | TorrentStatus | undefined): TorrentStatus => {
  if (typeof status === "string") {
    return status;
  }
  if (typeof status === "number") {
    return RPC_STATUS_MAP[status] ?? "paused";
  }
  return "paused";
};

export const normalizeTorrent = (torrent: TransmissionTorrent): Torrent => ({
  ...torrent,
  status: normalizeStatus(torrent.status),
});

export const normalizeTorrentDetail = (detail: TransmissionTorrentDetail): TorrentDetail => ({
  ...detail,
  status: normalizeStatus(detail.status),
});
