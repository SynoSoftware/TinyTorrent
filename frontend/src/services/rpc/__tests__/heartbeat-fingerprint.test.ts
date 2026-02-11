import { describe, expect, it } from "vitest";
import type { TorrentEntity } from "@/services/rpc/entities";
import { computeTorrentListFingerprint } from "@/services/rpc/heartbeat-fingerprint";
import STATUS from "@/shared/status";

function makeTorrent(overrides: Partial<TorrentEntity> = {}): TorrentEntity {
    const base: TorrentEntity = {
        id: overrides.id ?? "torrent-1",
        hash: overrides.hash ?? "torrent-hash-1",
        name: overrides.name ?? "torrent-1",
        progress: overrides.progress ?? 0,
        state: overrides.state ?? STATUS.torrent.PAUSED,
        verificationProgress: overrides.verificationProgress,
        speed: overrides.speed ?? { down: 0, up: 0 },
        peerSummary: {
            connected: overrides.peerSummary?.connected ?? 0,
            total: overrides.peerSummary?.total ?? 0,
            sending: overrides.peerSummary?.sending ?? 0,
            getting: overrides.peerSummary?.getting ?? 0,
            seeds: overrides.peerSummary?.seeds ?? 0,
        },
        totalSize: overrides.totalSize ?? 0,
        eta: overrides.eta ?? 0,
        queuePosition: overrides.queuePosition ?? 0,
        ratio: overrides.ratio ?? 0,
        uploaded: overrides.uploaded ?? 0,
        downloaded: overrides.downloaded ?? 0,
        leftUntilDone: overrides.leftUntilDone ?? 0,
        sizeWhenDone: overrides.sizeWhenDone ?? 0,
        error: overrides.error ?? 0,
        errorString: overrides.errorString,
        isFinished: overrides.isFinished ?? false,
        sequentialDownload: overrides.sequentialDownload ?? false,
        superSeeding: overrides.superSeeding ?? false,
        added: overrides.added ?? 0,
        savePath: overrides.savePath ?? "/tmp",
        downloadDir: overrides.downloadDir,
        rpcId: overrides.rpcId ?? 1,
        isGhost: overrides.isGhost ?? false,
        ghostLabel: overrides.ghostLabel,
        ghostState: overrides.ghostState,
        errorEnvelope: overrides.errorEnvelope,
    };
    return { ...base, ...overrides };
}

describe("computeTorrentListFingerprint", () => {
    it("is deterministic for the same input", () => {
        const torrents = [
            makeTorrent({ id: "a", hash: "ha", name: "A" }),
            makeTorrent({ id: "b", hash: "hb", name: "B" }),
        ];
        const a = computeTorrentListFingerprint(torrents);
        const b = computeTorrentListFingerprint(torrents);
        expect(a).toBe(b);
        expect(Number.isInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
    });

    it("changes when a stable surfaced field changes", () => {
        const base = [makeTorrent({ id: "a", speed: { down: 1, up: 2 } })];
        const changed = [makeTorrent({ id: "a", speed: { down: 2, up: 2 } })];
        expect(computeTorrentListFingerprint(base)).not.toBe(
            computeTorrentListFingerprint(changed),
        );
    });

    it("changes when envelope fields change", () => {
        const base = [
            makeTorrent({
                id: "a",
                errorEnvelope: {
                    errorClass: "missingFiles",
                    errorMessage: "x",
                    lastErrorAt: 123,
                    recoveryState: "needsUserAction",
                    retryCount: 0,
                    nextRetryAt: null,
                    recoveryActions: ["openFolder"],
                    recoveryKind: "pathLoss",
                    recoveryConfidence: "likely",
                    fingerprint: "fp",
                    primaryAction: "openFolder",
                },
            }),
        ];
        const changed = [
            makeTorrent({
                id: "a",
                errorEnvelope: {
                    errorClass: "missingFiles",
                    errorMessage: "y",
                    lastErrorAt: 123,
                    recoveryState: "needsUserAction",
                    retryCount: 0,
                    nextRetryAt: null,
                    recoveryActions: ["openFolder"],
                    recoveryKind: "pathLoss",
                    recoveryConfidence: "likely",
                    fingerprint: "fp",
                    primaryAction: "openFolder",
                },
            }),
        ];
        expect(computeTorrentListFingerprint(base)).not.toBe(
            computeTorrentListFingerprint(changed),
        );
    });
});

