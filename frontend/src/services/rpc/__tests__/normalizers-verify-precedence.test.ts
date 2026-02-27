import { describe, expect, it } from "vitest";
import { status } from "@/shared/status";
import { deriveTorrentState } from "@/services/rpc/normalizers";
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
});

