import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";

export type RecoveryGateAction =
    | "resume"
    | "recheck"
    | "redownload"
    | "setLocation";

export type RecoveryGateOutcome =
    | { status: "continue"; log?: string }
    | {
          status: "handled";
          log?: string;
          blockingOutcome?: RecoveryOutcome;
      }
    | { status: "cancelled"; log?: string };

export type RecoveryGateOptions = {
    recreateFolder?: boolean;
    retryOnly?: boolean;
    missingBytes?: number | null;
};

export type RecoveryGateCallback = (params: {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
    options?: RecoveryGateOptions;
}) => Promise<RecoveryGateOutcome | null>;
