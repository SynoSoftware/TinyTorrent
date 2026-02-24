import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export type RecoveryGateAction =
    | "resume"
    | "recheck"
    | "downloadMissing"
    | "setLocation";

export type RecoveryGateOutcome =
    | { status: "continue"; log?: string }
    | { status: "handled"; log?: string }
    | { status: "cancelled"; log?: string }
    | {
          status: "not_required";
          reason:
              | "no_error_envelope"
              | "not_actionable"
              | "no_blocking_outcome"
              | "blocked"
              | "set_location";
      };

export type RecoveryGateOptions = {
    retryOnly?: boolean;
    missingBytes?: number | null;
};

export type RecoveryGateUiOptions = {
    suppressFeedback?: boolean;
    bypassActiveRequestDedup?: boolean;
};

export type RecoveryGateCallback = (params: {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
    options?: RecoveryGateOptions;
    ui?: RecoveryGateUiOptions;
}) => Promise<RecoveryGateOutcome>;
