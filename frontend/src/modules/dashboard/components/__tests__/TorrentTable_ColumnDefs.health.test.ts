import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TORRENTTABLE_COLUMN_DEFS } from "@/modules/dashboard/components/TorrentTable_ColumnDefs";
import {
    deriveTorrentSwarmHealth,
    getTorrentSwarmSortValue,
} from "@/modules/dashboard/utils/torrentSwarm";
import { resetTorrentStatusRuntimeState } from "@/modules/dashboard/utils/torrentStatus";
import type { TorrentEntity } from "@/services/rpc/entities";
import { status } from "@/shared/status";

const makeTorrent = (
    overrides: Partial<TorrentEntity> = {},
): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent 1",
    state: status.torrent.downloading,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0, getting: 0, sending: 0 },
    totalSize: 100,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 1,
    leftUntilDone: 100,
    desiredAvailable: 0,
    metadataPercentComplete: 1,
    webseedsSendingToUs: 0,
    error: 0,
    ...overrides,
});

describe("TORRENTTABLE_COLUMN_DEFS.health", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();
    });

    afterEach(() => {
        resetTorrentStatusRuntimeState();
        vi.useRealTimers();
    });

    it("sorts by displayed availability during connecting grace", () => {
        const torrent = makeTorrent({
            desiredAvailable: 100,
            peerSummary: { connected: 1, getting: 0, sending: 0 },
        });
        const rawSortValue = getTorrentSwarmSortValue(
            deriveTorrentSwarmHealth(torrent),
        );
        const displaySortValue = TORRENTTABLE_COLUMN_DEFS.health.sortAccessor?.(
            torrent,
            {
                optimisticStatuses: {},
                speedHistoryRef: {
                    current: {
                        [torrent.id]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    },
                },
            },
        );

        expect(rawSortValue).toBe(1);
        expect(displaySortValue).toBe(0);
    });
});
