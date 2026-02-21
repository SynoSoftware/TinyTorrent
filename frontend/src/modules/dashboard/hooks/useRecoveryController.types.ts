import type {
    DownloadMissingOutcome,
    RecoveryRequestCompletionOutcome,
    RecoverySessionInfo,
} from "@/app/context/RecoveryContext";
import type {
    RecoveryGateAction,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";

export type RecoveryQueueEntry = {
    torrent: Torrent | TorrentDetail;
    action: RecoveryGateAction;
    outcome: RecoveryOutcome;
    classification: MissingFilesClassification;
    fingerprint: string;
    promise: Promise<RecoveryGateOutcome>;
    resolve: (result: RecoveryGateOutcome) => void;
};

export type RecoveryQueueSummary = {
    fingerprint: string;
    torrentName: string;
    kind: MissingFilesClassification["kind"];
    locationLabel: string;
};

export type ResumeRecoveryCommandOutcome = RecoveryRequestCompletionOutcome;

export type RetryRecoveryCommandOutcome =
    | { status: "applied"; shouldCloseModal: boolean }
    | {
          status: "not_applied";
          shouldCloseModal: boolean;
          reason: "missing_client" | "blocked" | "no_change";
      };

export type DownloadMissingCommandOutcome = DownloadMissingOutcome;

export interface RecoverySessionViewState {
    session: RecoverySessionInfo | null;
    isBusy: boolean;
    isDetailRecoveryBlocked: boolean;
    queuedCount: number;
    queuedItems: RecoveryQueueSummary[];
}
