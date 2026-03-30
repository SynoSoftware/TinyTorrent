import { describe, expect, it } from "vitest";
import { status } from "@/shared/status";
import { deriveTorrentState, normalizeTorrent } from "@/services/rpc/normalizers";
import type { TransmissionTorrent } from "@/services/rpc/types";

const makeTorrent = (
    overrides: Partial<TransmissionTorrent>,
): TransmissionTorrent => ({
    id: 1,
    hashString: "hash-1",
    name: "Torrent 1",
    totalSize: 100,
    percentDone: 0.5,
    status: 4,
    rateDownload: 0,
    rateUpload: 0,
    peersConnected: 0,
    eta: -1,
    addedDate: 0,
    uploadRatio: 0,
    uploadedEver: 0,
    downloadedEver: 0,
    ...overrides,
});

describe("deriveTorrentState verify precedence", () => {
    it("prefers checking while verify is active even when local error is set", () => {
        const torrent = makeTorrent({
            status: 1,
            recheckProgress: 0.35,
            error: 3,
            errorString: "No data found",
        });

        expect(deriveTorrentState(status.torrent.downloading, torrent)).toBe(
            status.torrent.checking,
        );
    });

    it("keeps error state when verify is not active", () => {
        const torrent = makeTorrent({
            status: 4,
            recheckProgress: 0,
            error: 3,
        });

        expect(deriveTorrentState(status.torrent.downloading, torrent)).toBe(
            status.torrent.error,
        );
    });

    it("returns downloading when a seeded torrent has wanted bytes remaining again", () => {
        const torrent = makeTorrent({
            percentDone: 1,
            status: 6,
            leftUntilDone: 512,
            isFinished: false,
            rateDownload: 128,
        });

        expect(deriveTorrentState(status.torrent.seeding, torrent)).toBe(
            status.torrent.downloading,
        );
    });

    it("keeps seeding when no wanted bytes remain even if isFinished is still false", () => {
        const torrent = makeTorrent({
            percentDone: 1,
            status: 6,
            leftUntilDone: 0,
            isFinished: false,
            rateDownload: 0,
        });

        expect(deriveTorrentState(status.torrent.seeding, torrent)).toBe(
            status.torrent.seeding,
        );
    });

    it("never admits ui-only stalled as transport truth for completed torrents", () => {
        const torrent = makeTorrent({
            percentDone: 1,
            isFinished: true,
            leftUntilDone: 0,
        }) as unknown as TransmissionTorrent;
        (torrent as { status: unknown }).status = "stalled";

        expect(normalizeTorrent(torrent).state).toBe(
            status.torrent.seeding,
        );
    });
});
