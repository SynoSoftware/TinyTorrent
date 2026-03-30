import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

import {
    getTorrentStatusPresentation,
    resetTorrentStatusRuntimeState,
} from "@/modules/dashboard/utils/torrentStatus";
import { registry } from "@/config/logic";
import { status } from "@/shared/status";
import type { TorrentEntity } from "@/services/rpc/entities";

const t = ((key: string) => key) as unknown as TFunction;
const stalledObservationWindowMs =
    registry.timing.ui.stalledActivityHistoryWindow *
    registry.timing.heartbeat.detailMs;
const startupGraceMs = registry.timing.ui.startupStalledGraceMs;
const fullIdleHistory = {
    down: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    up: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
} as const;

const makeTorrent = (
    overrides: Partial<TorrentEntity> = {},
): TorrentEntity => ({
    id: "1",
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
    added: Math.floor(Date.now() / 1000) - 120,
    ...overrides,
});

describe("torrent stalled presentation", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
        resetTorrentStatusRuntimeState();
    });

    afterEach(() => {
        resetTorrentStatusRuntimeState();
        vi.useRealTimers();
    });

    it("keeps actively downloading torrents out of the stalled overlay", () => {
        const torrent = makeTorrent({
            speed: { down: 1024, up: 0 },
        });

        const presentation = getTorrentStatusPresentation(torrent, t);

        expect(presentation.overlayState).toBeNull();
        expect(presentation.visualState).toBe(
            status.torrent.downloading,
        );
    });

    it("keeps idle torrents in transport state until the recent activity window is populated", () => {
        const torrent = makeTorrent();

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [0, 0, 0, 0], up: [] },
        );

        expect(presentation.transportState).toBe(status.torrent.downloading);
        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(true);
        expect(presentation.visualState).toBe("connecting");
        expect(presentation.label).toBe("labels.status.torrent.connecting");
    });

    it("keeps newly observed idle downloads in connecting grace before stalled becomes eligible", () => {
        const torrent = makeTorrent();

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.transportState).toBe(status.torrent.downloading);
        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(true);
        expect(presentation.visualState).toBe("connecting");
        expect(presentation.label).toBe("labels.status.torrent.connecting");
    });

    it("keeps recently added torrents out of stalled until the hard startup grace expires", () => {
        const torrent = makeTorrent({
            added: Math.floor(Date.now() / 1000),
        });

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(true);

        vi.advanceTimersByTime(startupGraceMs);

        const settledPresentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(settledPresentation.overlayState).toBe(status.torrent.stalled);
        expect(settledPresentation.startupGrace).toBe(false);
    });

    it("marks idle downloads as stalled after the local observation window elapses", () => {
        const torrent = makeTorrent();

        getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );
        vi.advanceTimersByTime(startupGraceMs + stalledObservationWindowMs);

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.transportState).toBe(status.torrent.downloading);
        expect(presentation.overlayState).toBe(status.torrent.stalled);
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(status.torrent.stalled);
        expect(presentation.label).toBe("table.status_stalled");
        expect(presentation.tooltip).toBe(
            "table.status_waiting_for_peers • table.status_no_active_connections",
        );
    });

    it("keeps the stalled overlay off while recent transfer history is still non-zero", () => {
        const torrent = makeTorrent();

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [0, 0, 0, 0, 0, 128, 64, 0, 0, 0], up: [] },
        );

        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(
            status.torrent.downloading,
        );
    });

    it("shows stalled as no data transfer when download peers are connected but idle", () => {
        const torrent = makeTorrent({
            peerSummary: { connected: 3, getting: 0, sending: 0 },
        });
        getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );
        vi.advanceTimersByTime(startupGraceMs + stalledObservationWindowMs);

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.overlayState).toBe(status.torrent.stalled);
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(status.torrent.stalled);
        expect(presentation.isIdleSeeding).toBe(false);
        expect(presentation.tooltip).toBe(
            "table.status_waiting_for_peers • table.status_no_data_transfer",
        );
    });

    it("keeps the seeding label while exposing an idle seeding presentation", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
        });
        getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [], up: fullIdleHistory.up },
        );
        vi.advanceTimersByTime(stalledObservationWindowMs);

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [], up: fullIdleHistory.up },
        );

        expect(presentation.transportState).toBe(status.torrent.seeding);
        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(status.torrent.seeding);
        expect(presentation.isIdleSeeding).toBe(true);
        expect(presentation.label).toBe("table.status_seed");
        expect(presentation.tooltip).toBe(
            "table.status_seed • table.status_waiting_for_peers • table.status_no_active_connections",
        );
    });

    it("keeps seeding with connected peers out of stalled while exposing connected idle seeding", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
            peerSummary: { connected: 3, getting: 0, sending: 0 },
        });
        getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [], up: fullIdleHistory.up },
        );
        vi.advanceTimersByTime(stalledObservationWindowMs);

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            { down: [], up: fullIdleHistory.up },
        );

        expect(presentation.transportState).toBe(status.torrent.seeding);
        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(status.torrent.seeding);
        expect(presentation.isIdleSeeding).toBe(true);
        expect(presentation.label).toBe("table.status_seed");
        expect(presentation.tooltip).toBe(
            "table.status_seed • table.status_waiting_for_peers • table.status_no_data_transfer",
        );
    });

    it("auto-recovers from stalled when useful transfer resumes", () => {
        const idleTorrent = makeTorrent();
        getTorrentStatusPresentation(
            idleTorrent,
            t,
            undefined,
            fullIdleHistory,
        );
        vi.advanceTimersByTime(startupGraceMs + stalledObservationWindowMs);
        const stalledPresentation = getTorrentStatusPresentation(
            idleTorrent,
            t,
            undefined,
            fullIdleHistory,
        );
        expect(stalledPresentation.overlayState).toBe(
            status.torrent.stalled,
        );
        expect(stalledPresentation.visualState).toBe(
            status.torrent.stalled,
        );

        const recoveredTorrent = makeTorrent({
            speed: { down: 1024, up: 0 },
            peerSummary: { connected: 1, getting: 1, sending: 0 },
        });

        const presentation = getTorrentStatusPresentation(recoveredTorrent, t);
        expect(presentation.transportState).toBe(status.torrent.downloading);
        expect(presentation.overlayState).toBeNull();
        expect(presentation.startupGrace).toBe(false);
        expect(presentation.visualState).toBe(
            status.torrent.downloading,
        );
    });

    it("keeps downloads in connecting for the full local active-entry grace even when addedDate is old", () => {
        const checkingTorrent = makeTorrent({
            state: status.torrent.checking,
            added: Math.floor(Date.now() / 1000) - 3600,
        });
        expect(
            getTorrentStatusPresentation(checkingTorrent, t, undefined, fullIdleHistory)
                .visualState,
        ).toBe(status.torrent.checking);

        const activeTorrent = makeTorrent({
            state: status.torrent.downloading,
            added: Math.floor(Date.now() / 1000) - 3600,
        });

        const initialPresentation = getTorrentStatusPresentation(
            activeTorrent,
            t,
            undefined,
            fullIdleHistory,
        );
        expect(initialPresentation.startupGrace).toBe(true);
        expect(initialPresentation.visualState).toBe("connecting");

        vi.advanceTimersByTime(stalledObservationWindowMs + 1000);

        const midGracePresentation = getTorrentStatusPresentation(
            activeTorrent,
            t,
            undefined,
            fullIdleHistory,
        );
        expect(midGracePresentation.startupGrace).toBe(true);
        expect(midGracePresentation.overlayState).toBeNull();
        expect(midGracePresentation.visualState).toBe("connecting");

        vi.advanceTimersByTime(startupGraceMs - stalledObservationWindowMs - 1000);

        const settledPresentation = getTorrentStatusPresentation(
            activeTorrent,
            t,
            undefined,
            fullIdleHistory,
        );
        expect(settledPresentation.startupGrace).toBe(false);
        expect(settledPresentation.overlayState).toBe(status.torrent.stalled);
    });

    it("never assigns stalled to paused, queued, checking, or seeding states", () => {
        const paused = makeTorrent({ state: status.torrent.paused });
        const queued = makeTorrent({ state: status.torrent.queued });
        const checking = makeTorrent({ state: status.torrent.checking });
        const seeding = makeTorrent({ state: status.torrent.seeding });

        expect(getTorrentStatusPresentation(paused, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(paused, t).startupGrace).toBe(false);
        expect(getTorrentStatusPresentation(paused, t).visualState).toBe(
            status.torrent.paused,
        );
        expect(getTorrentStatusPresentation(queued, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(queued, t).startupGrace).toBe(false);
        expect(getTorrentStatusPresentation(queued, t).visualState).toBe(
            status.torrent.queued,
        );
        expect(getTorrentStatusPresentation(checking, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(checking, t).startupGrace).toBe(false);
        expect(getTorrentStatusPresentation(checking, t).visualState).toBe(
            status.torrent.checking,
        );
        expect(getTorrentStatusPresentation(seeding, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(seeding, t).startupGrace).toBe(false);
        expect(getTorrentStatusPresentation(seeding, t).visualState).toBe(
            status.torrent.seeding,
        );
        expect(getTorrentStatusPresentation(seeding, t).isIdleSeeding).toBe(false);
    });
});
