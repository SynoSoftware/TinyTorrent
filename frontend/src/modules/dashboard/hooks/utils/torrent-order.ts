import type { Torrent } from "../../types/torrent.ts";

export function buildUniqueTorrentOrder(torrents: Torrent[]): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const torrent of torrents) {
        if (seen.has(torrent.id)) {
            continue;
        }
        seen.add(torrent.id);
        order.push(torrent.id);
    }
    return order;
}
