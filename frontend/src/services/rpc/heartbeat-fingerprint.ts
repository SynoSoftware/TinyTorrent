import type { TorrentEntity } from "@/services/rpc/entities";

const FNV1A_OFFSET_BASIS = 2166136261;
const FNV1A_PRIME = 16777619;
const FIELD_SEPARATOR_CODE = 31; // unit separator

type FingerprintValue = string | number | boolean | null | undefined;

const mixHash = (hash: number, value: FingerprintValue): number => {
    // Serialize without allocating big intermediate structures.
    // Strings are hashed by char-code; numbers/booleans are stringified via
    // small temporaries (acceptable) to keep the function simple and correct.
    const serialized =
        typeof value === "string"
            ? value
            : typeof value === "number"
              ? Number.isFinite(value)
                  ? String(value)
                  : "NaN"
              : typeof value === "boolean"
                ? value
                    ? "1"
                    : "0"
                : "";

    let mixed = hash >>> 0;
    mixed ^= FIELD_SEPARATOR_CODE;
    mixed = Math.imul(mixed, FNV1A_PRIME) >>> 0;

    for (let i = 0; i < serialized.length; i += 1) {
        mixed ^= serialized.charCodeAt(i);
        mixed = Math.imul(mixed, FNV1A_PRIME) >>> 0;
    }
    return mixed >>> 0;
};

const mixTorrent = (hash: number, torrent: TorrentEntity): number => {
    // Keep this list aligned with what the UI surfaces can change without a full refresh.
    // If a new field becomes user-visible in table/detail summaries, add it here.
    let mixed = hash;
    mixed = mixHash(mixed, torrent.id);
    mixed = mixHash(mixed, torrent.hash);
    mixed = mixHash(mixed, torrent.name);
    mixed = mixHash(mixed, torrent.state);
    mixed = mixHash(mixed, torrent.progress);
    mixed = mixHash(mixed, torrent.verificationProgress);
    mixed = mixHash(mixed, torrent.speed.down);
    mixed = mixHash(mixed, torrent.speed.up);
    mixed = mixHash(mixed, torrent.peerSummary.connected);
    mixed = mixHash(mixed, torrent.peerSummary.total);
    mixed = mixHash(mixed, torrent.peerSummary.sending);
    mixed = mixHash(mixed, torrent.peerSummary.getting);
    mixed = mixHash(mixed, torrent.peerSummary.seeds);
    mixed = mixHash(mixed, torrent.totalSize);
    mixed = mixHash(mixed, torrent.eta);
    mixed = mixHash(mixed, torrent.queuePosition);
    mixed = mixHash(mixed, torrent.ratio);
    mixed = mixHash(mixed, torrent.uploaded);
    mixed = mixHash(mixed, torrent.downloaded);
    mixed = mixHash(mixed, torrent.leftUntilDone);
    mixed = mixHash(mixed, torrent.sizeWhenDone);
    mixed = mixHash(mixed, torrent.error);
    mixed = mixHash(mixed, torrent.errorString);
    mixed = mixHash(mixed, torrent.isFinished);
    mixed = mixHash(mixed, torrent.sequentialDownload);
    mixed = mixHash(mixed, torrent.superSeeding);
    mixed = mixHash(mixed, torrent.added);
    mixed = mixHash(mixed, torrent.savePath);
    mixed = mixHash(mixed, torrent.downloadDir);
    mixed = mixHash(mixed, torrent.rpcId);
    mixed = mixHash(mixed, torrent.isGhost);
    mixed = mixHash(mixed, torrent.ghostLabel);
    mixed = mixHash(mixed, torrent.ghostState);
    mixed = mixHash(mixed, torrent.errorEnvelope?.errorClass);
    mixed = mixHash(mixed, torrent.errorEnvelope?.errorMessage);
    mixed = mixHash(mixed, torrent.errorEnvelope?.lastErrorAt);
    mixed = mixHash(mixed, torrent.errorEnvelope?.recoveryState);
    mixed = mixHash(mixed, torrent.errorEnvelope?.retryCount);
    mixed = mixHash(mixed, torrent.errorEnvelope?.nextRetryAt);
    mixed = mixHash(mixed, torrent.errorEnvelope?.recoveryKind);
    mixed = mixHash(mixed, torrent.errorEnvelope?.recoveryConfidence);
    mixed = mixHash(mixed, torrent.errorEnvelope?.fingerprint);
    mixed = mixHash(mixed, torrent.errorEnvelope?.primaryAction);
    return mixed >>> 0;
};

export const computeTorrentListFingerprint = (
    torrents: readonly TorrentEntity[],
): number => {
    // Avoid `JSON.stringify(torrents)` to reduce large transient allocations per tick.
    let hash = FNV1A_OFFSET_BASIS;
    for (const torrent of torrents) {
        hash = mixTorrent(hash, torrent);
    }
    return hash >>> 0;
};
