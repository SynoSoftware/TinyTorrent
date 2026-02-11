import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export function resolveTorrentPath(
    torrent: Torrent | TorrentDetail | null | undefined
): string {
    if (!torrent) return "";
    return torrent.savePath ?? torrent.downloadDir ?? "";
}
