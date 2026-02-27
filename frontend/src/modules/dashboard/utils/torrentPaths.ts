import type { TorrentEntity as Torrent, TorrentDetailEntity as TorrentDetail } from "@/services/rpc/entities";

export function resolveTorrentPath(
    torrent: Torrent | TorrentDetail | null | undefined
): string {
    if (!torrent) return "";
    return torrent.savePath ?? torrent.downloadDir ?? "";
}

