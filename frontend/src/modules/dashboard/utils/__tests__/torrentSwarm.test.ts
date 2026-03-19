import { describe, expect, it, vi } from "vitest";
import type { TorrentEntity, TorrentTrackerEntity } from "@/services/rpc/entities";
import {
    deriveTorrentDisplayHealth,
    deriveTorrentSwarmHealth,
    deriveTorrentTrackerCondition,
} from "@/modules/dashboard/utils/torrentSwarm";
import {
    getTorrentStatusPresentation,
    getStatusSpeedHistory,
    resetTorrentStatusRuntimeState,
} from "@/modules/dashboard/utils/torrentStatus";
import { status } from "@/shared/status";
import type { TFunction } from "i18next";

const t = ((key: string) => key) as unknown as TFunction;

const makeTorrent = (
    overrides: Partial<TorrentEntity> = {},
): TorrentEntity => ({
    id: "torrent-1",
    hash: "hash-1",
    name: "Torrent 1",
    state: status.torrent.downloading,
    speed: { down: 0, up: 0 },
    peerSummary: { connected: 0, getting: 0, sending: 0 },
    totalSize: 1000,
    eta: -1,
    ratio: 0,
    uploaded: 0,
    downloaded: 0,
    added: 1,
    leftUntilDone: 1000,
    desiredAvailable: 0,
    metadataPercentComplete: 1,
    webseedsSendingToUs: 0,
    error: 0,
    ...overrides,
});

const makeTracker = (
    overrides: Partial<TorrentTrackerEntity> = {},
): TorrentTrackerEntity => ({
    announce: "https://tracker.example.com/announce",
    tier: 0,
    lastAnnounceTime: 0,
    lastAnnounceResult: "",
    lastAnnounceSucceeded: false,
    lastScrapeTime: 0,
    lastScrapeResult: "",
    lastScrapeSucceeded: false,
    seederCount: 0,
    leecherCount: 0,
    ...overrides,
});

describe("deriveTorrentSwarmHealth", () => {
    it("returns metadata while magnet data is still incomplete", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                metadataPercentComplete: 0.5,
            }),
        );

        expect(swarm.healthState).toBe("metadata");
    });

    it("returns error only for blocking local torrent errors", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                error: 3,
            }),
        );

        expect(swarm.healthState).toBe("error");
    });

    it("returns healthy when all remaining bytes are reachable now", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 4, getting: 2, sending: 1 },
            }),
        );

        expect(swarm.healthState).toBe("healthy");
        expect(swarm.reachableNowBytes).toBe(1000);
    });

    it("returns degraded when peers are connected but nobody is sending missing data", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            }),
        );

        expect(swarm.healthState).toBe("degraded");
        expect(swarm.reachableNowBytes).toBe(1000);
    });

    it("returns degraded when only some remaining bytes are reachable", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 400,
                peerSummary: { connected: 3, getting: 1, sending: 0 },
            }),
        );

        expect(swarm.healthState).toBe("degraded");
        expect(swarm.reachableNowBytes).toBe(400);
    });

    it("returns unavailable when peers are connected but none of the remaining data is reachable", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                peerSummary: { connected: 3, getting: 0, sending: 0 },
            }),
        );

        expect(swarm.healthState).toBe("unavailable");
    });

    it("returns finding_peers only when there are no connected sources and nothing reachable", () => {
        const swarm = deriveTorrentSwarmHealth(makeTorrent());

        expect(swarm.healthState).toBe("finding_peers");
    });

    it("treats contradiction cases as degraded when some progress remains possible", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 2, getting: 1, sending: 0 },
                pieceAvailability: [0, 2, 2],
            }),
        );

        expect(swarm.healthState).toBe("degraded");
        expect(swarm.robustnessState).toBe("critical");
        expect(swarm.missingPiecesUnavailable).toBe(1);
        expect(swarm.reachableNowBytes).toBe(1000);
    });

    it("falls back to web seed availability when byte-level peer data is absent", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 0,
                webseedsSendingToUs: 1,
            }),
        );

        expect(swarm.healthState).toBe("healthy");
    });

    it("marks reachable torrents as degraded when enough single-source pieces remain", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 2, getting: 1, sending: 0 },
                pieceAvailability: [1, 1, 1, 2],
            }),
        );

        expect(swarm.healthState).toBe("degraded");
        expect(swarm.robustnessState).toBe("fragile");
        expect(swarm.missingPieceCount).toBe(4);
    });

    it("keeps reachable torrents robust when single-source pieces stay below the threshold", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 2, getting: 1, sending: 0 },
                pieceAvailability: [1, 2, 2, 2],
            }),
        );

        expect(swarm.robustnessState).toBe("robust");
        expect(swarm.healthState).toBe("healthy");
    });

    it("preserves healthy behavior for completed torrents", () => {
        const swarm = deriveTorrentSwarmHealth(
            makeTorrent({
                state: status.torrent.seeding,
                leftUntilDone: 0,
                desiredAvailable: 0,
                peerSummary: { connected: 0, getting: 0, sending: 2 },
            }),
        );

        expect(swarm.isIncomplete).toBe(false);
        expect(swarm.healthState).toBe("healthy");
        expect(swarm.reachableNowBytes).toBe(0);
    });

    it("keeps stalled owned by status while health degrades for connected idle downloads", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                desiredAvailable: 1000,
                added: Math.floor(Date.now() / 1000) - 120,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });

            const swarm = deriveTorrentSwarmHealth(torrent);
            getTorrentStatusPresentation(
                torrent,
                t,
                undefined,
                { down: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], up: [] },
            );
            vi.advanceTimersByTime(60_000);
            const presentation = getTorrentStatusPresentation(
                torrent,
                t,
                undefined,
                { down: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], up: [] },
            );

            expect(swarm.healthState).toBe("degraded");
            expect(presentation.overlayState).toBe(status.torrent.stalled);
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });
});

describe("deriveTorrentDisplayHealth", () => {
    it("returns healthy during connecting when all remaining bytes are reachable", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                desiredAvailable: 1000,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });

            const health = deriveTorrentDisplayHealth(
                torrent,
                undefined,
                getStatusSpeedHistory(torrent, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            );

            expect(health.healthState).toBe("healthy");
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });

    it("returns finding_peers during connecting when remaining bytes are not fully reachable", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                desiredAvailable: 400,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });

            const health = deriveTorrentDisplayHealth(
                torrent,
                undefined,
                getStatusSpeedHistory(torrent, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            );

            expect(health.healthState).toBe("finding_peers");
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });

    it("keeps error unchanged during connecting", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                error: 3,
                desiredAvailable: 1000,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });

            const health = deriveTorrentDisplayHealth(
                torrent,
                undefined,
                getStatusSpeedHistory(torrent, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            );

            expect(health.healthState).toBe("error");
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });

    it("keeps metadata unchanged during connecting", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                metadataPercentComplete: 0.5,
                desiredAvailable: 1000,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });

            const health = deriveTorrentDisplayHealth(
                torrent,
                undefined,
                getStatusSpeedHistory(torrent, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            );

            expect(health.healthState).toBe("metadata");
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });

    it("keeps connected idle downloads degraded after connecting grace ends", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();

        try {
            const torrent = makeTorrent({
                desiredAvailable: 1000,
                added: Math.floor(Date.now() / 1000) - 120,
                peerSummary: { connected: 1, getting: 0, sending: 0 },
            });
            const speedHistory = getStatusSpeedHistory(
                torrent,
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            );

            getTorrentStatusPresentation(torrent, t, undefined, speedHistory);
            vi.advanceTimersByTime(60_000);

            const health = deriveTorrentDisplayHealth(
                torrent,
                undefined,
                speedHistory,
            );

            expect(health.healthState).toBe("degraded");
        } finally {
            resetTorrentStatusRuntimeState();
            vi.useRealTimers();
        }
    });
});

describe("deriveTorrentTrackerCondition", () => {
    it("returns working when a relevant tracker recently succeeded", () => {
        const summary = deriveTorrentTrackerCondition(
            [
                makeTracker({
                    lastAnnounceSucceeded: true,
                    lastAnnounceTime: 950,
                    seederCount: 12,
                    leecherCount: 4,
                }),
            ],
            1000,
        );

        expect(summary.condition).toBe("working");
        expect(summary.bestSeederCount).toBe(12);
        expect(summary.bestLeecherCount).toBe(4);
    });

    it("returns degraded for mixed tracker evidence", () => {
        const summary = deriveTorrentTrackerCondition(
            [
                makeTracker({
                    lastAnnounceSucceeded: true,
                    lastAnnounceTime: 950,
                }),
                makeTracker({
                    announce: "https://backup.example.com/announce",
                    lastAnnounceSucceeded: false,
                    lastAnnounceResult: "timeout",
                }),
            ],
            1000,
        );

        expect(summary.condition).toBe("degraded");
    });

    it("returns failing when every relevant tracker is failing or unreachable", () => {
        const summary = deriveTorrentTrackerCondition(
            [
                makeTracker({
                    lastAnnounceSucceeded: false,
                    lastAnnounceResult: "timeout",
                }),
            ],
            1000,
        );

        expect(summary.condition).toBe("failing");
    });
});
