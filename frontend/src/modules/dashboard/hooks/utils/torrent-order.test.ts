import * as assert from "node:assert/strict";

import type { Torrent } from "../../types/torrent.ts";
import { buildUniqueTorrentOrder } from "./torrent-order.ts";

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

assert.deepStrictEqual(
    buildUniqueTorrentOrder(duplicates),
    ["hash-a", "hash-b", "hash-c"],
    "should deduplicate duplicate IDs"
);

assert.deepStrictEqual(
    buildUniqueTorrentOrder([]),
    [],
    "should return empty order for empty snapshots"
);
