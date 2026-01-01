import type { Torrent } from "@/modules/dashboard/types/torrent";
import { buildUniqueTorrentOrder } from "@/modules/dashboard/hooks/utils/torrent-order";

const assertDeepEqual = <T>(actual: T, expected: T, message: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message);
    }
};

const createTorrent = (id: string): Torrent => ({
    id,
    hash: id,
    name: id,
    progress: 0,
    state: "queued",
    speed: { down: 0, up: 0 },
    peerSummary: {
        connected: 0,
        total: 0,
        sending: 0,
        getting: 0,
        seeds: 0,
    },
    totalSize: 0,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 0,
});

const duplicates = [
    createTorrent("hash-a"),
    createTorrent("hash-b"),
    createTorrent("hash-a"),
    createTorrent("hash-c"),
];

assertDeepEqual(
    buildUniqueTorrentOrder(duplicates),
    ["hash-a", "hash-b", "hash-c"],
    "should deduplicate duplicate IDs"
);

assertDeepEqual(
    buildUniqueTorrentOrder([]),
    [],
    "should return empty order for empty snapshots"
);
