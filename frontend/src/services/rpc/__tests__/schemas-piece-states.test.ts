import { describe, expect, it } from "vitest";
import { zTransmissionTorrentDetailSingle } from "@/services/rpc/schemas";

const encodeBase64 = (bytes: Uint8Array) => {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index] ?? 0);
    }
    if (typeof btoa === "function") {
        return btoa(binary);
    }
    const globalWithBuffer = globalThis as {
        Buffer?: {
            from: (input: string, encoding: string) => {
                toString: (encoding: string) => string;
            };
        };
    };
    const bufferCtor = globalWithBuffer.Buffer;
    if (bufferCtor && typeof bufferCtor.from === "function") {
        return bufferCtor.from(binary, "binary").toString("base64");
    }
    throw new Error("Base64 encode unavailable");
};

const encodePieceStates = (states: number[]) => {
    const bytes = new Uint8Array(Math.ceil(states.length / 8));
    states.forEach((state, index) => {
        if (state !== 1) {
            return;
        }
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        bytes[byteIndex] |= 1 << (7 - bitIndex);
    });
    return encodeBase64(bytes);
};

const buildDetailPayload = (params: {
    pieceCount: number;
    pieces: string;
}) => ({
    torrents: [
        {
            id: 1,
            hashString: "hash",
            name: "torrent",
            totalSize: params.pieceCount * 4 * 1024 * 1024,
            percentDone: 1,
            status: 6,
            rateDownload: 0,
            rateUpload: 0,
            peersConnected: 0,
            eta: -1,
            addedDate: 0,
            uploadRatio: 1,
            uploadedEver: 1,
            downloadedEver: 1,
            pieceCount: params.pieceCount,
            pieces: params.pieces,
        },
    ],
});

describe("piece bitfield decoding", () => {
    it("decodes Transmission piece bitfields as MSB-first", () => {
        const pieceCount = 1180;
        const encoded = encodePieceStates(Array(pieceCount).fill(1));
        const detail = zTransmissionTorrentDetailSingle.parse(
            buildDetailPayload({ pieceCount, pieces: encoded }),
        );

        expect(detail).not.toBeNull();
        expect(detail?.pieceStates).toHaveLength(pieceCount);
        expect(detail?.pieceStates?.slice(-4)).toEqual([1, 1, 1, 1]);
        expect(detail?.pieceStates?.every((value) => value === 1)).toBe(true);
    });
});
