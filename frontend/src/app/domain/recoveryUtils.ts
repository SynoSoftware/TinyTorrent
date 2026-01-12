import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export const getRecoveryFingerprint = (torrent: Torrent | TorrentDetail) =>
    torrent.errorEnvelope?.fingerprint ??
    torrent.hash ??
    torrent.id ??
    "<no-recovery-fingerprint>";

export type PathNeededReason = Extract<
    RecoveryOutcome,
    { kind: "path-needed" }
>["reason"];

export const derivePathReason = (errorClass?: string | null): PathNeededReason => {
    switch (errorClass) {
        case "permissionDenied":
            return "unwritable";
        case "diskFull":
            return "disk-full";
        case "missingFiles":
            return "missing";
        default:
            return "missing";
    }
};
