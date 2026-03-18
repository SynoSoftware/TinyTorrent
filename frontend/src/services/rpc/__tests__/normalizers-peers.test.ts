import { describe, expect, it } from "vitest";
import { normalizeTorrentDetail } from "@/services/rpc/normalizers";
import type { TransmissionTorrentDetail } from "@/services/rpc/types";

const makeDetail = (): TransmissionTorrentDetail => ({
    id: 25,
    hashString: "normalize-peer-hash",
    name: "debian.iso",
    totalSize: 2048,
    percentDone: 0.75,
    status: 4,
    rateDownload: 0,
    rateUpload: 0,
    peersConnected: 1,
    eta: 0,
    addedDate: 1,
    uploadRatio: 0,
    uploadedEver: 0,
    downloadedEver: 0,
    files: [],
    trackers: [],
    peers: [
        {
            address: "198.51.100.20",
            port: 60000,
            clientIsChoking: false,
            clientIsInterested: true,
            clientName: "",
            flagStr: "TX",
            isDownloadingFrom: false,
            isEncrypted: false,
            isIncoming: false,
            isUploadingTo: false,
            isUtp: true,
            peerIsChoking: true,
            peerIsInterested: false,
            progress: 0,
            bytesToClient: 0,
            bytesToPeer: 0,
            rateToClient: 0,
            rateToPeer: 0,
        },
    ],
});

describe("peer normalizers", () => {
    it("keeps Transmission-supported peer fields and drops unsupported extras", () => {
        const detail = makeDetail();
        const normalized = normalizeTorrentDetail(detail);
        const [peer] = normalized.peers ?? [];

        expect(peer).toMatchObject({
            address: "198.51.100.20",
            port: 60000,
            clientName: "",
            flagStr: "TX",
            isUtp: true,
            peerIsChoking: true,
            bytesToClient: 0,
            bytesToPeer: 0,
            rateToClient: 0,
            rateToPeer: 0,
        });
        expect("country" in (peer ?? {})).toBe(false);
        expect("relevance" in (peer ?? {})).toBe(false);
        expect("files" in (peer ?? {})).toBe(false);
    });
});
