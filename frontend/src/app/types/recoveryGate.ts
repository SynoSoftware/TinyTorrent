import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export type RecoveryGateAction =
    | "resume"
    | "recheck"
    | "redownload"
    | "setLocation";

export type RecoveryGateOutcome =
    | { status: "continue" }
    | { status: "handled" }
    | { status: "cancelled" };

export type RecoveryGateCallback = (params: {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
}) => Promise<RecoveryGateOutcome | null>;
