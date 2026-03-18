import { describe, expect, it } from "vitest";
import { zTransmissionTorrentDetailSingle } from "@/services/rpc/schemas";

describe("peer schema parsing", () => {
    it("parses Transmission peer fields from the daemon snake_case shape", () => {
        const parsed = zTransmissionTorrentDetailSingle.parse({
            torrents: [
                {
                    id: 19,
                    hashString: "peer-hash",
                    name: "arch.iso",
                    totalSize: 1024,
                    percentDone: 0.5,
                    status: 4,
                    rateDownload: 0,
                    rateUpload: 0,
                    peersConnected: 1,
                    eta: 0,
                    addedDate: 1,
                    uploadRatio: 0,
                    uploadedEver: 0,
                    downloadedEver: 0,
                    peers: [
                        {
                            address: "203.0.113.10",
                            port: 51413,
                            client_name: "Transmission 4.0.6",
                            flag_str: "TDEI",
                            progress: 0.25,
                            rate_to_client: 2048,
                            rate_to_peer: 1024,
                            bytes_to_client: 4096,
                            bytes_to_peer: 8192,
                            is_utp: true,
                            is_encrypted: true,
                            is_incoming: true,
                            client_is_choked: false,
                            client_is_interested: true,
                            peer_is_choked: false,
                            peer_is_interested: true,
                            is_downloading_from: true,
                            is_uploading_to: false,
                        },
                    ],
                },
            ],
        });

        expect(parsed).not.toBeNull();
        const [peer] = parsed?.peers ?? [];
        expect(peer).toMatchObject({
            address: "203.0.113.10",
            port: 51413,
            clientName: "Transmission 4.0.6",
            flagStr: "TDEI",
            progress: 0.25,
            rateToClient: 2048,
            rateToPeer: 1024,
            bytesToClient: 4096,
            bytesToPeer: 8192,
            isUtp: true,
            isEncrypted: true,
            isIncoming: true,
            clientIsChoking: false,
            clientIsInterested: true,
            peerIsChoking: false,
            peerIsInterested: true,
            isDownloadingFrom: true,
            isUploadingTo: false,
        });
    });

    it("drops malformed peer entries instead of manufacturing blank fallback rows", () => {
        const parsed = zTransmissionTorrentDetailSingle.parse({
            torrents: [
                {
                    id: 19,
                    hashString: "peer-hash",
                    name: "arch.iso",
                    totalSize: 1024,
                    percentDone: 0.5,
                    status: 4,
                    rateDownload: 0,
                    rateUpload: 0,
                    peersConnected: 2,
                    eta: 0,
                    addedDate: 1,
                    uploadRatio: 0,
                    uploadedEver: 0,
                    downloadedEver: 0,
                    peers: [
                        {
                            address: "203.0.113.10",
                            port: 51413,
                            client_name: "Transmission 4.0.6",
                            flag_str: "TDEI",
                        },
                        {
                            port: "not-a-port",
                            client_name: "Broken Peer",
                        },
                        null,
                    ],
                },
            ],
        });

        expect(parsed?.peers).toHaveLength(1);
        expect(parsed?.peers?.[0]?.address).toBe("203.0.113.10");
    });
});
