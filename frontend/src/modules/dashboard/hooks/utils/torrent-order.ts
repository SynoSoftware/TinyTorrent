import type { TorrentEntity as Torrent } from "@/services/rpc/entities";

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
