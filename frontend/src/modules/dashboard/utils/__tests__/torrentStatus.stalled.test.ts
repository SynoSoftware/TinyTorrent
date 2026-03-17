import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
    getTorrentStatusPresentation,
    resetTorrentStatusPresentationRuntimeState,
} from "@/modules/dashboard/utils/torrentStatus";
import { status } from "@/shared/status";
import type { TorrentEntity } from "@/services/rpc/entities";

const t = ((key: string) => key) as unknown as TFunction;
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
        resetTorrentStatusPresentationRuntimeState();
    });

    afterEach(() => {
        resetTorrentStatusPresentationRuntimeState();
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
        expect(presentation.visualState).toBe(status.torrent.downloading);
        expect(presentation.label).toBe("table.status_dl");
    });

    it("marks idle downloads as stalled after a full idle activity window", () => {
        const torrent = makeTorrent();

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.transportState).toBe(status.torrent.downloading);
        expect(presentation.overlayState).toBe(status.torrent.stalled);
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
        expect(presentation.visualState).toBe(
            status.torrent.downloading,
        );
    });

    it("shows stalled as no data transfer when peers are connected but idle", () => {
        const torrent = makeTorrent({
            peerSummary: { connected: 3, getting: 0, sending: 0 },
        });

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.overlayState).toBe(status.torrent.stalled);
        expect(presentation.visualState).toBe(status.torrent.stalled);
        expect(presentation.tooltip).toBe(
            "table.status_waiting_for_peers • table.status_no_data_transfer",
        );
    });

    it("preserves the seeding label for idle seeders while exposing the stalled reason in the tooltip", () => {
        const torrent = makeTorrent({
            state: status.torrent.seeding,
        });

        const presentation = getTorrentStatusPresentation(
            torrent,
            t,
            undefined,
            fullIdleHistory,
        );

        expect(presentation.transportState).toBe(status.torrent.seeding);
        expect(presentation.overlayState).toBe(status.torrent.stalled);
        expect(presentation.visualState).toBe(status.torrent.stalled);
        expect(presentation.label).toBe("table.status_seed");
        expect(presentation.tooltip).toBe(
            "table.status_seed • table.status_waiting_for_peers • table.status_no_active_connections",
        );
    });

    it("auto-recovers from stalled when useful transfer resumes", () => {
        const idleTorrent = makeTorrent();
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
        expect(presentation.visualState).toBe(
            status.torrent.downloading,
        );
    });

    it("never assigns stalled to paused, queued, or checking states", () => {
        const paused = makeTorrent({ state: status.torrent.paused });
        const queued = makeTorrent({ state: status.torrent.queued });
        const checking = makeTorrent({ state: status.torrent.checking });

        expect(getTorrentStatusPresentation(paused, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(paused, t).visualState).toBe(
            status.torrent.paused,
        );
        expect(getTorrentStatusPresentation(queued, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(queued, t).visualState).toBe(
            status.torrent.queued,
        );
        expect(getTorrentStatusPresentation(checking, t).overlayState).toBeNull();
        expect(getTorrentStatusPresentation(checking, t).visualState).toBe(
            status.torrent.checking,
        );
    });
});
